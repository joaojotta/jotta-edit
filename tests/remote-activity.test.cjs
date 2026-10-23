'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const {RemoteActivity}=require('../electron/remote-activity.cjs');
const {RemoteFolders}=require('../electron/remote-folders.cjs');
const {attributes}=require('../electron/remote-clients.cjs');
const {panelDom}=require('./fixtures/panel-dom.cjs');
const {startSftp}=require('./fixtures/sftp-server.cjs');
function session(t,options={}){
 const events=[],credentials=[],clients=[],files=new Map([['/project/file.txt',Buffer.from('original')]]);
 const factory=async(_location,secret,{onDisconnect})=>{
  credentials.push(secret);const client={
   directoryPath:async p=>p,
   stat:async p=>files.has(p)?attributes({size:files.get(p).length}):p==='/'||p==='/project'?attributes({dir:true}):Promise.reject(Object.assign(new Error('secret in server error'),{code:'ENOENT'})),
   list:async()=>[attributes({name:'file.txt',size:8})],
   read:async(p,progress=()=>{})=>{const bytes=files.get(p);if(!bytes)throw new Error('secret in server error');progress(Math.floor(bytes.length/2));progress(bytes.length);return bytes;},
   write:async(p,bytes,_mode,progress=()=>{})=>{files.set(p,bytes);progress(bytes.length);},
   rename:async(a,b)=>{files.set(b,files.get(a));files.delete(a);},remove:async p=>{files.delete(p);},
   close:async()=>{onDisconnect();}
  };clients.push(client);return client;
 };
 const remote=new RemoteFolders({base:path.join(os.tmpdir(),'jotta-panel-test-'+Math.random()),clientFactory:factory,onActivity:value=>events.push(value),...options});t.after(()=>remote.close());return {remote,events,credentials,clients,files};
}
test('activity tracks queue, download/upload phases and sanitized failures without exposing credentials',async t=>{
 const {remote,events,clients}=session(t);const {root}=await remote.connect('sftp://alice@host/project',undefined,{password:'top-secret'}),file=path.join(root,'file.txt');
 assert.equal(await remote.readFile(file,'utf8'),'original');await remote.save(file,'changed',{expectedText:'original'});
 assert.ok(events.some(e=>e.operations.some(o=>o.phase==='Downloading'&&o.total===8)));
 assert.ok(events.some(e=>e.operations.some(o=>o.phase==='Uploading'&&o.total===7)));
 assert.ok(events.some(e=>e.operations.some(o=>o.phase==='Verifying')));
 assert.equal(remote.activity.snapshot().connections[0].status,'connected');
 clients[0].list=async()=>{throw new Error('top-secret');};await assert.rejects(remote.readdir(root));
 const failure=remote.activity.snapshot().operations.at(-1);assert.equal(failure.status,'failed');assert.equal(failure.retryable,true);
 assert.equal(JSON.stringify(events).includes('top-secret'),false);assert.equal(JSON.stringify(events).includes('credentials'),false);
 remote.activity.clearCompleted();assert.equal(remote.activity.snapshot().operations.length,1);
 remote.activity.dismiss(failure.id);assert.equal(remote.activity.snapshot().operations.length,0);
});
test('reconnect retains only the session credentials and a stale save remains blocked',async t=>{
 const {remote,clients,credentials,files}=session(t);const {root}=await remote.connect('ftp://host/project',undefined,{username:'alice',password:'private'}),file=path.join(root,'file.txt');
 await clients[0].close();assert.equal(remote.activity.snapshot().connections[0].status,'disconnected');
 assert.deepEqual((await remote.reconnect(root)).root,root);assert.equal(credentials[1].password,'private');
 files.set('/project/file.txt',Buffer.from('server changed'));
 await assert.rejects(remote.save(file,'our draft',{expectedText:'original'}),/changed on the server/);
 assert.equal(files.get('/project/file.txt').toString(),'server changed');
 const failure=remote.activity.snapshot().operations.at(-1);assert.equal(failure.kind,'save');assert.match(failure.error,/changed on the server/);assert.equal(failure.retryable,true);
});
test('file metadata failures are reported once without duplicating an already tracked transfer failure',async t=>{
 const {remote}=session(t);const {root}=await remote.connect('ftp://host/project');const missing=path.join(root,'missing.txt');
 try{await remote.stat(missing);}catch(error){remote.recordFailure(missing,'read',error);remote.recordFailure(missing,'read',error);}
 assert.equal(remote.activity.snapshot().operations.length,1);assert.equal(remote.activity.snapshot().operations[0].status,'failed');
 try{await remote.readFile(missing);}catch(error){remote.recordFailure(missing,'read',error);}
 assert.equal(remote.activity.snapshot().operations.length,2);
});
test('operation timeout marks the connection disconnected and ignores late progress',async t=>{
 const {remote,clients}=session(t,{timeout:15});const {root}=await remote.connect('ftp://host/project');let report;
 clients[0].read=(_file,progress)=>{report=progress;return new Promise(()=>{});};
 await assert.rejects(remote.readFile(path.join(root,'file.txt')),/timed out/);
 const state=remote.activity.snapshot();assert.equal(state.connections[0].status,'disconnected');assert.equal(state.operations[0].status,'failed');
 report(999);assert.deepEqual(remote.activity.snapshot(),state);
});
test('activity history is bounded and never clears pending work',()=>{
 const activity=new RemoteActivity();const pending=activity.start('/root','/root/pending','save');
 for(let i=0;i<100;i++){const id=activity.start('/root','/root/'+i,'read');activity.finish(id);}
 assert.equal(activity.snapshot().operations.length,61);activity.clearCompleted();assert.equal(activity.snapshot().operations[0].id,pending);
});
test('remote panel preserves the latest snapshot and retries through the editor without clearing a failed retry',async()=>{
 const ids=['remote-connections','remote-connection-list','remote-operation-list','remote-panel-status','remote-panel-empty','remote-operation-empty','btn-connections','remote-panel-connect','remote-panel-clear'];
 const {elements,documentRef}=panelDom(ids);let publish,initial,retries=0,dismissed=[],succeed=false;
 const api={onRemoteActivity:fn=>{publish=fn;},getRemoteActivity:()=>new Promise(resolve=>{initial=resolve;}),dismissRemoteOperation:async id=>{dismissed.push(id);}};
 const {installRemoteConnectionPanel}=await import('../src/remote-connection-panel.js');
 const panel=installRemoteConnectionPanel({documentRef,api,sidebar:{onShow(){},show(){}},reconnect(){},retry:async()=>{retries++;return succeed;}});
 const failed={id:'failure',root:'/remote',file:'/remote/file.txt',kind:'save',status:'failed',phase:'Failed',error:'File changed on the server. Compare or reload it before saving.',retryable:true};
 publish({revision:2,connections:[],operations:[failed]});initial({revision:0,connections:[],operations:[]});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(elements['remote-operation-list'].children.length,1);
 await elements['remote-operation-list'].querySelectorAll('button')[0].onclick();assert.equal(retries,1);assert.deepEqual(dismissed,[]);
 succeed=true;await elements['remote-operation-list'].querySelectorAll('button')[0].onclick();assert.deepEqual(dismissed,['failure']);
 publish({revision:3,connections:[],operations:[{...failed,kind:'delete',retryable:false}]});assert.deepEqual(elements['remote-operation-list'].querySelectorAll('button').map(b=>b.textContent),['Dismiss']);panel.dispose();
});
test('real SFTP transfers report byte progress and reconnect without exposing the password',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-activity-sftp-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'project'));const original='a'.repeat(130000);await fs.writeFile(path.join(root,'project','file.txt'),original);
 const server=await startSftp(root);t.after(()=>server.close());const events=[];
 const remote=new RemoteFolders({base:path.join(root,'virtual'),confirmHostKey:async()=>true,onActivity:event=>events.push(event)});t.after(()=>remote.close());
 const connection=await remote.connect(`sftp://test@127.0.0.1:${server.port}/project`,undefined,{password:'test-password'}),file=path.join(connection.root,'file.txt');
 assert.equal(await remote.readFile(file,'utf8'),original);await remote.save(file,'b'.repeat(150000),{expectedText:original});
 assert.equal((await fs.readFile(path.join(root,'project','file.txt'),'utf8')).length,150000);
 assert.ok(events.some(e=>e.operations.some(o=>o.phase==='Downloading'&&o.transferred>0)));
 assert.ok(events.some(e=>e.operations.some(o=>o.phase==='Uploading'&&o.transferred>0)));
 await remote.reconnect(connection.root);assert.equal(remote.activity.snapshot().connections[0].status,'connected');assert.equal(JSON.stringify(events).includes('test-password'),false);
});

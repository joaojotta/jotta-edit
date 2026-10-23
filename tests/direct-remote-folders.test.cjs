'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const net=require('node:net');
const {RemoteFolders}=require('../electron/remote-folders.cjs');
const {attributes}=require('../electron/remote-clients.cjs');
const {startSftp}=require('./fixtures/sftp-server.cjs');
async function temp(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-direct-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
async function fake(t,options={}){
 const disk=await temp(t),server=path.join(disk,'server');await fs.mkdir(path.join(server,'project'),{recursive:true});
 const local=file=>path.join(server,file.replace(/^\//,''));let closed=0;
 const client={stat:file=>fs.lstat(local(file)),readlink:async file=>{const target=await fs.readlink(local(file));return path.isAbsolute(target)?'/'+path.relative(server,target).split(path.sep).join('/'):target;},list:async file=>{const entries=await fs.readdir(local(file),{withFileTypes:true});return entries.map(x=>attributes({name:x.name,dir:x.isDirectory(),link:x.isSymbolicLink()}));},read:file=>fs.readFile(local(file)),write:(file,bytes,mode)=>fs.writeFile(local(file),bytes,{flag:'wx',mode}),mkdir:file=>fs.mkdir(local(file)),rename:(a,b)=>fs.rename(local(a),local(b)),remove:file=>fs.unlink(local(file)),close:async()=>{closed++;}};
 const remote=new RemoteFolders({base:path.join(disk,'virtual'),clientFactory:async(_location,_credentials,{registerClose})=>{registerClose(client.close);return client;},...options});
 t.after(()=>remote.close());return {remote,client,server,local,closed:()=>closed};
}
test('direct sessions list, read, create, move, save and trash files without a mounted directory',async t=>{
 const {remote,local}=await fake(t);await fs.writeFile(local('/project/readme.txt'),'before');
 const {root}=await remote.connect('ftp://host/project',undefined,{username:'test',password:'secret'});
 await assert.rejects(fs.stat(root),{code:'ENOENT'});
 assert.equal((await remote.readdir(root,{withFileTypes:true}))[0].name,'readme.txt');
 assert.equal(await remote.readFile(path.join(root,'readme.txt'),'utf8'),'before');
 await remote.save(path.join(root,'readme.txt'),'after',{expectedText:'before'});
 assert.equal(await fs.readFile(local('/project/readme.txt'),'utf8'),'after');
 await remote.mkdir(path.join(root,'sub'));await (await remote.open(path.join(root,'new.txt'),'wx')).close();
 await assert.rejects(remote.open(path.join(root,'new.txt'),'wx'),{code:'EEXIST'});
 await remote.rename(path.join(root,'new.txt'),path.join(root,'sub','renamed.txt'));
 await remote.trash(path.join(root,'sub'));assert.equal((await fs.readdir(local('/project/.jotta-trash'))).length,1);
 assert.equal(remote.isRemote(root),true);assert.equal(remote.isRemote(remote.base+'-outside'),false);
});
test('direct saves reject stale content, failed uploads and failed replacement without damaging the original',async t=>{
 const {remote,client,local}=await fake(t);await fs.writeFile(local('/project/file.txt'),'server');const {root}=await remote.connect('ftp://host/project');const file=path.join(root,'file.txt');
 await assert.rejects(remote.save(file,'ours',{expectedText:'old'}),/changed on the server/);
 const rename=client.rename;client.rename=async()=>{throw new Error('secret-password');};
 await assert.rejects(remote.save(file,'ours',{expectedText:'server'}),error=>/Remote operation failed/.test(error.message)&&!error.message.includes('secret-password'));
 assert.equal(await fs.readFile(local('/project/file.txt'),'utf8'),'server');assert.deepEqual(await fs.readdir(local('/project')),['file.txt']);
 client.rename=rename;const write=client.write;client.write=async(...args)=>{await write(...args);await fs.writeFile(local('/project/file.txt'),'concurrent edit');};
 await assert.rejects(remote.save(file,'ours',{expectedText:'server'}),/changed on the server/);
 assert.equal(await fs.readFile(local('/project/file.txt'),'utf8'),'concurrent edit');
});
test('symlink traversal, oversized files, invalid listing names and disconnected namespace fallthrough are rejected',async t=>{
 const {remote,local,client}=await fake(t);await fs.mkdir(local('/outside'));await fs.writeFile(local('/outside/secret'),'secret');await fs.symlink(local('/outside'),local('/project/link'));
 const {root}=await remote.connect('sftp://user@host/project');
 await assert.rejects(remote.readFile(path.join(root,'link','secret')),/outside this workspace/);
 await fs.writeFile(local('/project/huge'),Buffer.alloc(5*1024*1024+1));await assert.rejects(remote.readFile(path.join(root,'huge')),/limit/);
 client.list=async()=>[attributes({name:'../escape'}),attributes({name:'safe.txt'}),attributes({name:'bad\\name'}),attributes({name:'.'})];assert.deepEqual(await remote.readdir(root),['safe.txt']);
 const io=require('../electron/project-fs.cjs');io.setRemote(remote);t.after(()=>io.setRemote(null));await remote.close();
 await assert.rejects(io.readFile(path.join(root,'file.txt')),/disconnected/);
});
test('cancellation closes pending transports and operations time out without keeping the session usable',async t=>{
 let closed=0;
 const remote=new RemoteFolders({clientFactory:async(_l,_c,{registerClose})=>{registerClose(()=>{closed++;});return new Promise(()=>{});}}),controller=new AbortController();
 const pending=remote.connect('ftp://host',controller.signal);await new Promise(resolve=>setImmediate(resolve));controller.abort(new Error('Connection cancelled.'));
 await assert.rejects(pending,/cancelled/);assert.equal(closed,1);assert.equal(remote.connections.size,0);
 const setup=await fake(t,{timeout:30});const {root}=await setup.remote.connect('ftp://host/project');setup.client.read=()=>new Promise(()=>{});await fs.writeFile(setup.local('/project/file'),'x');
 await assert.rejects(setup.remote.readFile(path.join(root,'file')),/timed out/);await assert.rejects(setup.remote.stat(root),/disconnected/);
});
test('SFTP host identities require approval, persist without passwords and require approval after a key change',async t=>{
 const disk=await temp(t),prompts=[];let hash='ab'.repeat(32),allow=true;
 const client={stat:async()=>attributes({dir:true}),list:async()=>[],close:async()=>{}};
 const factory=async(_l,_c,{verifyHostKey})=>{if(!await verifyHostKey(hash))throw new Error('Rejected key');return client;};
 const remote=new RemoteFolders({clientFactory:factory,confirmHostKey:async details=>{prompts.push(details);return allow;}});
 await remote.restoreRoots(path.join(disk,'remote-folders.json'));
 const credentials={username:'alice',password:'never-on-disk'};
 const first=await remote.connect('sftp://host/project',undefined,credentials);await remote.connect('sftp://host/project',undefined,credentials);assert.equal(prompts.length,1);
 hash='cd'.repeat(32);allow=false;await assert.rejects(remote.connect('sftp://host/project',undefined,credentials),/Could not connect/);assert.equal(prompts.at(-1).changed,true);
 assert.equal(remote.resolve(first.root).connection.closed,false);
 for(const file of await fs.readdir(disk))assert.equal((await fs.readFile(path.join(disk,file),'utf8')).includes(credentials.password),false);
 const restored=new RemoteFolders({clientFactory:factory,confirmHostKey:async()=>assert.fail('Stored host identity should match')});await restored.restoreRoots(path.join(disk,'remote-folders.json'));hash='ab'.repeat(32);
 assert.equal((await restored.connect('sftp://host/project',undefined,credentials)).root,first.root);await remote.close();await restored.close();
});
async function exercise(remote,address,disk){
 const {root}=await remote.connect(address,undefined,{username:'test',password:'test-password'}),file=path.join(root,'hello.txt');
 assert.ok((await remote.readdir(root,{withFileTypes:true})).some(x=>x.name==='hello.txt'));
 assert.equal(await remote.readFile(file,'utf8'),'before');await remote.save(file,'after',{expectedText:'before'});assert.equal(await fs.readFile(path.join(disk,'hello.txt'),'utf8'),'after');
 await remote.save(path.join(root,'created.txt'),'created');assert.equal(await fs.readFile(path.join(disk,'created.txt'),'utf8'),'created');
 await remote.mkdir(path.join(root,'sub'));await remote.rename(path.join(root,'created.txt'),path.join(root,'sub','moved.txt'));await remote.trash(path.join(root,'sub','moved.txt'));
 assert.equal((await fs.readdir(path.join(disk,'.jotta-trash'))).length,1);
 await fs.writeFile(path.join(disk,'hello.txt'),'outside edit');await assert.rejects(remote.save(file,'ours',{expectedText:'after'}),/changed on the server/);
 await assert.rejects(remote.connect(address,undefined,{username:'test',password:'wrong-secret'}),error=>/Could not connect/.test(error.message)&&!error.message.includes('wrong-secret'));
}
test('real loopback SFTP connects, lists, stages saves, renames and rejects bad credentials',async t=>{
 const disk=await temp(t);await fs.writeFile(path.join(disk,'hello.txt'),'before');const server=await startSftp(disk);t.after(()=>server.close());
 const remote=new RemoteFolders({confirmHostKey:async()=>true});t.after(()=>remote.close());
 await exercise(remote,`sftp://127.0.0.1:${server.port}/`,disk);
});
for(const protocol of ['ftp','smb'])test(`real loopback ${protocol.toUpperCase()} direct connection and guarded edits`,{skip:!process.env.JOTTA_PROTOCOL_TEST_PYTHONPATH},async t=>{
 const disk=await temp(t);await fs.writeFile(path.join(disk,'hello.txt'),'before');
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const child=spawn('python3',[path.join(__dirname,'fixtures','remote-servers.py'),protocol,disk,String(port)],{env:{...process.env,PYTHONPATH:process.env.JOTTA_PROTOCOL_TEST_PYTHONPATH},stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',chunk=>{output+=chunk;});
 t.after(()=>child.kill());await new Promise((resolve,reject)=>{let timer=setTimeout(()=>reject(new Error('Server startup timed out: '+output)),10000);child.once('exit',()=>{clearTimeout(timer);reject(new Error(output));});child.stdout.on('data',chunk=>{if(String(chunk).includes('READY')){clearTimeout(timer);resolve();}});});
 const remote=new RemoteFolders({confirmHostKey:async()=>true});t.after(()=>remote.close());await exercise(remote,`${protocol}://127.0.0.1:${port}/${protocol==='smb'?'share':''}`,disk);
});
test('existing Explorer operations, Markdown assets, completions and static preview use the remote filesystem',async t=>{
 const {remote,local}=await fake(t);await fs.writeFile(local('/project/index.html'),'<h1>Remote preview</h1>');await fs.writeFile(local('/project/image.png'),Buffer.from('89504e470d0a1a0a','hex'));
 const {root}=await remote.connect('ftp://host/project'),io=require('../electron/project-fs.cjs');io.setRemote(remote);t.after(()=>io.setRemote(null));
 const {createEntry,renameEntry,moveEntry,deleteEntry}=require('../electron/file-operations.cjs');
 await createEntry(root,root,'sub','folder');const entry=await createEntry(root,root,'new.txt','file');const renamed=await renameEntry(root,entry.path,'renamed.txt');const moved=await moveEntry(root,renamed.path,path.join(root,'sub'));await deleteEntry(root,moved.path,file=>remote.trash(file));
 const {readMarkdownAsset}=require('../electron/markdown-assets.cjs');const image=await readMarkdownAsset({reference:'image.png',documentPath:path.join(root,'readme.md'),root});assert.match(image.url,/^data:image\/png;base64,/);
 const {listPathCandidates}=require('../electron/path-completion.cjs');assert.ok((await listPathCandidates({file:path.join(root,'index.html'),root,typed:'./'})).some(x=>x.name==='image.png'));
 const {LivePreview}=require('../electron/live-preview.cjs'),preview=new LivePreview();t.after(()=>preview.stop());const url=await preview.start({root,entry:path.join(root,'index.html')});assert.match(await (await fetch(url)).text(),/Remote preview/);
 await assert.rejects(preview.start({root,entry:path.join(root,'index.php')}),/requires a local/);
});
test('public_html directory links can be browsed and edited without replacing the link',async t=>{
 const {remote,local}=await fake(t);await fs.mkdir(local('/project/sites/example'),{recursive:true});await fs.writeFile(local('/project/sites/example/index.html'),'before');await fs.symlink('sites/example',local('/project/public_html'));await fs.symlink('.',local('/project/loop'));
 const {root}=await remote.connect('sftp://user@host/project'),web=path.join(root,'public_html');
 const entries=await remote.readdir(root,{withFileTypes:true});assert.equal(entries.find(x=>x.name==='public_html').isDirectory(),true);
 assert.equal((await remote.lstat(web)).isSymbolicLink(),true);assert.equal((await remote.stat(web)).isDirectory(),true);
 assert.equal(await remote.realpath(web),path.join(root,'sites','example'));
 assert.equal(await remote.readFile(path.join(web,'index.html'),'utf8'),'before');await remote.save(path.join(web,'index.html'),'after',{expectedText:'before'});
 assert.equal(await fs.readFile(local('/project/sites/example/index.html'),'utf8'),'after');assert.equal((await fs.lstat(local('/project/public_html'))).isSymbolicLink(),true);
 const io=require('../electron/project-fs.cjs');io.setRemote(remote);t.after(()=>io.setRemote(null));const {listFolderTree}=require('../electron/folder-tree.cjs');
 const listing=await listFolderTree(root);assert.equal(listing.nodes.find(x=>x.name==='public_html').children[0].name,'index.html');assert.match(listing.nodes.find(x=>x.name==='loop').error,/loop/);
 const {createEntry}=require('../electron/file-operations.cjs');await createEntry(root,web,'new.html','file');assert.equal((await fs.stat(local('/project/sites/example/new.html'))).isFile(),true);
});
test('remote links outside the workspace remain visible with a reason; opening that link as the root is allowed',async t=>{
 const {remote,local}=await fake(t);await fs.mkdir(local('/outside'));await fs.writeFile(local('/outside/index.html'),'site');await fs.symlink('../outside',local('/project/public_html'));
 const {root}=await remote.connect('sftp://user@host/project');const entry=(await remote.readdir(root,{withFileTypes:true})).find(x=>x.name==='public_html');assert.match(entry.error,/outside/);
 await assert.rejects(remote.readFile(path.join(root,'public_html','index.html')),/outside/);
 const direct=await remote.connect('sftp://user@host/project/public_html');assert.equal(await remote.readFile(path.join(direct.root,'index.html'),'utf8'),'site');
});
test('real SFTP lists public_html symlinks and saves through the target',async t=>{
 const disk=await temp(t);await fs.mkdir(path.join(disk,'sites','example'),{recursive:true});await fs.writeFile(path.join(disk,'sites','example','index.html'),'before');await fs.symlink('sites/example',path.join(disk,'public_html'));
 const server=await startSftp(disk);t.after(()=>server.close());const remote=new RemoteFolders({confirmHostKey:async()=>true});t.after(()=>remote.close());const {root}=await remote.connect(`sftp://127.0.0.1:${server.port}/`,undefined,{username:'test',password:'test-password'});
 const web=path.join(root,'public_html');assert.equal((await remote.readdir(root,{withFileTypes:true})).find(x=>x.name==='public_html').isDirectory(),true);
 await remote.save(path.join(web,'index.html'),'after',{expectedText:'before'});assert.equal(await fs.readFile(path.join(disk,'sites','example','index.html'),'utf8'),'after');
});
for(const listingMode of ['ftp','ftp-list','ftp-mlsd-link','ftp-mlsd-link-only','ftp-list-physical-link','ftp-mlsd-physical-link','ftp-cwd-mlsd','ftp-cwd-list'])test(`FTP public_html links appear and save correctly with ${listingMode} listings`,{skip:!process.env.JOTTA_PROTOCOL_TEST_PYTHONPATH},async t=>{
 const disk=await temp(t),physical=listingMode.includes('physical'),home=physical?path.join(disk,'account'):disk;
 await fs.mkdir(path.join(home,'sites','example'),{recursive:true});await fs.writeFile(path.join(home,'sites','example','index.html'),'before');await fs.symlink(physical?path.join(home,'sites','example'):'sites/example',path.join(home,'public_html'));
 if(physical){await fs.mkdir(path.join(disk,'outside'));await fs.writeFile(path.join(disk,'outside','secret'),'private');await fs.symlink('/outside',path.join(home,'blocked'));}
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const child=spawn('python3',[path.join(__dirname,'fixtures','remote-servers.py'),listingMode,disk,String(port)],{env:{...process.env,PYTHONPATH:process.env.JOTTA_PROTOCOL_TEST_PYTHONPATH},stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',chunk=>{output+=chunk;});
 t.after(()=>child.kill());await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('FTP startup timed out: '+output)),10000);child.once('exit',()=>{clearTimeout(timer);reject(new Error(output));});child.stdout.on('data',chunk=>{if(String(chunk).includes('READY')){clearTimeout(timer);resolve();}});});
 const remote=new RemoteFolders();t.after(()=>remote.close());const {root}=await remote.connect(`ftp://127.0.0.1:${port}/${physical?'account':''}`,undefined,{username:'test',password:'test-password'});
 assert.deepEqual(await remote.readdir(path.join(root,'public_html')),['index.html']);
 const io=require('../electron/project-fs.cjs');io.setRemote(remote);t.after(()=>io.setRemote(null));const {listFolderTree}=require('../electron/folder-tree.cjs');const tree=await listFolderTree(root),web=tree.nodes.find(x=>x.name==='public_html');
 assert.ok(web);assert.equal(web.dir,true);assert.equal(web.error,undefined);assert.equal(web.children[0].name,'index.html');
 const alias=path.join(root,'public_html');assert.equal((await remote.stat(alias)).isDirectory(),true);assert.equal((await remote.lstat(alias)).isSymbolicLink(),!['ftp','ftp-cwd-mlsd'].includes(listingMode));
 await remote.save(path.join(alias,'index.html'),'after',{expectedText:'before'});assert.equal(await fs.readFile(path.join(home,'sites','example','index.html'),'utf8'),'after');assert.equal((await fs.lstat(path.join(home,'public_html'))).isSymbolicLink(),true);
 const {createEntry}=require('../electron/file-operations.cjs');await createEntry(root,alias,'new.html','file');assert.equal((await fs.stat(path.join(home,'sites','example','new.html'))).isFile(),true);
 if(physical){assert.match(tree.nodes.find(x=>x.name==='blocked').error,/outside/);await assert.rejects(remote.readFile(path.join(root,'blocked','secret')),/outside/);}
});
test('an explicitly selected FTP alias opens when LIST exposes its physical server path',{skip:!process.env.JOTTA_PROTOCOL_TEST_PYTHONPATH},async t=>{
 const disk=await temp(t);await fs.mkdir(path.join(disk,'sites','example'),{recursive:true});await fs.writeFile(path.join(disk,'sites','example','index.html'),'before');await fs.symlink(path.join(disk,'sites','example'),path.join(disk,'public_html'));
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const child=spawn('python3',[path.join(__dirname,'fixtures','remote-servers.py'),'ftp-list',disk,String(port)],{env:{...process.env,PYTHONPATH:process.env.JOTTA_PROTOCOL_TEST_PYTHONPATH},stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',chunk=>{output+=chunk;});
 t.after(()=>child.kill());await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('FTP startup timed out: '+output)),10000);child.once('exit',()=>{clearTimeout(timer);reject(new Error(output));});child.stdout.on('data',chunk=>{if(String(chunk).includes('READY')){clearTimeout(timer);resolve();}});});
 const remote=new RemoteFolders();t.after(()=>remote.close());const {root}=await remote.connect(`ftp://127.0.0.1:${port}/public_html`,undefined,{username:'test',password:'test-password'});
 assert.equal((await remote.stat(root)).isDirectory(),true);assert.equal((await remote.readdir(root))[0],'index.html');await remote.save(path.join(root,'index.html'),'after',{expectedText:'before'});assert.equal(await fs.readFile(path.join(disk,'sites','example','index.html'),'utf8'),'after');
});

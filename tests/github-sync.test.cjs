'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {GitHubWorkspace}=require('../electron/github-workspace.cjs');
const core=()=>import('../shared/github-sync.mjs');
async function file(name,text,mode='100644'){const {encodeBytes,blobSha}=await core();const data=encodeBytes(new TextEncoder().encode(text));return {path:name,data,mode,sha:await blobSha(data)};}
test('Git blob hashing and binary/text transport preserve Unicode, BOM and empty files',async()=>{
 const {blobSha,encodeBytes,decodeBytes,textOf}=await core();
 assert.equal(await blobSha(new Uint8Array()),'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
 const text='\ufeffOlá 🌻\r\n';assert.equal(textOf(await file('a',text)),text);
 const bytes=new Uint8Array([0,255,1,128]);assert.deepEqual(decodeBytes(encodeBytes(bytes)),bytes);assert.equal(textOf({data:encodeBytes(bytes)}),null);
});
test('three-way sync distinguishes independent changes, deletes, equal edits and conflicts',async()=>{
 const {mergePlan,resolvePlan}=await core(),a=await file('a','base'),b=await file('b','base'),c=await file('c','base'),d=await file('d','base');
 const local=[await file('a','local'),b,await file('c','same')],remote=[a,await file('b','remote'),await file('c','same'),d,await file('new','added')];
 const plan=mergePlan([a,b,c,d],local,remote);assert.deepEqual(plan.map(p=>[p.path,p.type]),[['a','outgoing'],['b','incoming'],['d','outgoing'],['new','incoming']]);
 const conflicts=mergePlan([a],[await file('a','ours')],[await file('a','theirs')]);assert.equal(conflicts[0].type,'conflict');
 assert.throws(()=>resolvePlan(conflicts,{},['a']),/Resolve every conflict/);
 assert.equal(resolvePlan(conflicts,{a:'local'},['a']).outgoing.length,1);
 assert.equal(resolvePlan(conflicts,{a:'remote'},['a']).incoming.length,1);
 assert.equal(resolvePlan(plan,{},[]).outgoing.length,0);
});
test('unsafe paths, unsupported modes, case collisions and credential-bearing state are rejected or stripped',async()=>{
 const {safeRepoPath,validateEntries,validLink}=await core();
 for(const path of ['../a','/a','a/../b','a/.git/config','C:/a','a\\b','NUL.txt','a.'])assert.throws(()=>safeRepoPath(path));
 assert.throws(()=>validLink({repo:'../repo',branch:'main'}));assert.throws(()=>validLink({repo:'user/repo',branch:'../main'}));
 const a=await file('a','x');assert.throws(()=>validateEntries([a,{...a,path:'A'}]),/Case-colliding/);assert.throws(()=>validateEntries([{...a,mode:'120000'}]),/Symlinks/);
 const {cleanSyncState,validateApply}=await import('../shared/github-workspace.mjs');
 assert.ok(!JSON.stringify(cleanSyncState({repo:'user/repo',branch:'main',entries:[a],token:'secret'})).includes('secret'));
 assert.throws(()=>validateApply([a],[awaitNever()]),/Missing file content|Unsupported/);
 function awaitNever(){return {path:'a/child',mode:'100644'};}
});
test('GitHub commits selected files only and advances the branch without force',async()=>{
 const {GitHubClient}=await core(),calls=[],a=await file('a','new'),head='1'.repeat(40);
 const client=new GitHubClient({fetch:async(url,options)=>{calls.push({url,...options});let result;
  if(url.endsWith('/user'))result={login:'user'};
  else if(url.includes('/git/ref/'))result={object:{sha:head}};
  else if(url.endsWith('/git/blobs'))result={sha:a.sha};
  else if(url.endsWith('/git/trees'))result={sha:'2'.repeat(40)};
  else if(url.endsWith('/git/commits'))result={sha:'3'.repeat(40)};
  else result={};return {ok:true,status:200,json:async()=>result};}});
 await client.connect('fixture-token');const result=await client.publish({repo:'user/repo',branch:'feature/test'},{head,tree:'0'.repeat(40),entries:[]},[a],'message');
 const last=calls.at(-1);assert.equal(last.method,'PATCH');assert.deepEqual(JSON.parse(last.body),{sha:'3'.repeat(40),force:false});assert.equal(result.entries[0].sha,a.sha);
 assert.ok(calls.every(call=>call.url.startsWith('https://api.github.com/')&&!call.url.includes('fixture-token')));
 client.disconnect();await assert.rejects(client.request('/user'),/Connect/);
});
test('GitHub requests preserve the browser fetch receiver',async()=>{
 const {GitHubClient}=await core();
 const client=new GitHubClient({fetch:async function(){assert.equal(this,globalThis);return {ok:true,status:200,json:async()=>({login:'user'})};}});
 assert.equal((await client.connect('fixture')).login,'user');client.disconnect();
});
test('branch changes and incomplete trees fail without publishing a branch update',async()=>{
 const {GitHubClient}=await core(),calls=[];
 const client=new GitHubClient({fetch:async(url,options)=>{calls.push(options.method);let value=url.endsWith('/user')?{}:url.includes('/git/ref/')?{object:{sha:'a'.repeat(40)}}:url.includes('/git/commits/')?{tree:{sha:'b'.repeat(40)}}:{truncated:true,tree:[]};return {ok:true,status:200,json:async()=>value};}});
 await client.connect('fixture');await assert.rejects(client.publish({repo:'user/repo',branch:'main'},{head:'c'.repeat(40),entries:[]},[await file('a','x')],'msg'),/branch changed/);
 await assert.rejects(client.snapshot({repo:'user/repo',branch:'main'}),/incomplete tree/);assert.ok(calls.every(method=>method==='GET'));
});
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-github-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const folder=path.join(root,'workspace');await fs.mkdir(folder);return {root,folder,store:new GitHubWorkspace(path.join(root,'metadata'))};}
test('desktop applies reviewed binary/text batches and records a token-free persistent baseline',async t=>{
 const {folder,store}=await fixture(t);await fs.writeFile(path.join(folder,'a'),'old');const old=await store.snapshot(folder);const next=await file('nested/new','new');
 await store.apply(folder,[{path:'a',data:null,mode:'100644'},next],old,[next]);
 assert.equal(await fs.readFile(path.join(folder,'nested/new'),'utf8'),'new');await assert.rejects(fs.stat(path.join(folder,'a')));
 await store.setState(folder,{repo:'user/repo',branch:'main',head:'a'.repeat(40),entries:[next],token:'never-store'});
 const saved=await store.getState(folder);assert.equal(saved.entries[0].sha,next.sha);assert.equal(saved.token,undefined);
});
test('desktop refuses stale or unsafe batches before making partial edits',async t=>{
 const {folder,store}=await fixture(t);await fs.writeFile(path.join(folder,'a'),'old');const old=await store.snapshot(folder);
 await fs.writeFile(path.join(folder,'a'),'external');await assert.rejects(store.apply(folder,[await file('a','new')],old),/changed after review/);assert.equal(await fs.readFile(path.join(folder,'a'),'utf8'),'external');
 const current=await store.snapshot(folder);await fs.mkdir(path.join(folder,'occupied'));
 await assert.rejects(store.apply(folder,[await file('a','new'),await file('occupied','bad')],current),/Unsafe sync destination/);assert.equal(await fs.readFile(path.join(folder,'a'),'utf8'),'external');
 await fs.mkdir(path.join(folder,'.git'));await assert.rejects(store.snapshot(folder),/Git checkout/);
});
test('desktop refuses symlinks and can sync tracked generated paths without scanning new dependencies',async t=>{
 const {folder,store}=await fixture(t);await fs.mkdir(path.join(folder,'node_modules'));await fs.writeFile(path.join(folder,'node_modules','x'),'generated');assert.equal((await store.snapshot(folder)).length,0);
 assert.equal((await store.snapshot(folder,[{path:'node_modules/x'}])).length,1);
 if(process.platform!=='win32'){await fs.symlink(path.join(folder,'node_modules','x'),path.join(folder,'link'));await assert.rejects(store.snapshot(folder),/Symlinks/);}
});

test('desktop rolls back an earlier edit when a later staged write fails',async t=>{
 const {folder,store}=await fixture(t);await fs.writeFile(path.join(folder,'a'),'original');const before=await store.snapshot(folder);
 const rename=fs.rename;let failed=false;
 fs.rename=async(source,destination)=>{if(!failed&&source.includes('new-1')){failed=true;throw Object.assign(new Error('fixture write failed'),{code:'EIO'});}return rename(source,destination);};
 try{await assert.rejects(store.apply(folder,[await file('a','changed'),await file('b','new')],before),/fixture write failed/);}
 finally{fs.rename=rename;}
 assert.equal(await fs.readFile(path.join(folder,'a'),'utf8'),'original');await assert.rejects(fs.stat(path.join(folder,'b')));
 assert.ok(!(await fs.readdir(folder)).some(name=>name.startsWith('.jotta-sync-')));
});

test('desktop skips untracked release builds but still includes tracked output files',async t=>{
 const {folder,store}=await fixture(t);
 for(const name of ['release','web-dist']){
  await fs.mkdir(path.join(folder,name));
  const handle=await fs.open(path.join(folder,name,'bundle.bin'),'w');try{await handle.truncate(6*1024*1024);}finally{await handle.close();}
 }
 await fs.writeFile(path.join(folder,'source.txt'),'source');
 assert.deepEqual((await store.snapshot(folder)).map(file=>file.path),['source.txt']);
 await assert.rejects(store.snapshot(folder,[{path:'release/bundle.bin'}]),/release\/bundle\.bin.*6\.00 MiB.*5 MiB/);
 await fs.writeFile(path.join(folder,'web-dist','tracked.txt'),'tracked');
 const result=await store.snapshot(folder,[{path:'web-dist/tracked.txt'}]);
 assert.ok(result.some(file=>file.path==='web-dist/tracked.txt'));
 assert.ok(!result.some(file=>file.path.endsWith('bundle.bin')));
 await fs.copyFile(path.join(folder,'release','bundle.bin'),path.join(folder,'large.bin'));
 await assert.rejects(store.snapshot(folder),/large\.bin.*6\.00 MiB.*5 MiB/);
});
test('web scans share output exclusions and limit errors distinguish every threshold',async()=>{
 const {virtualSyncFiles}=await import('../web/github-workspace.js');
 const records=['release/output.txt','web-dist/index.html','src/main.js'].map(path=>({path:'/workspace/'+path,content:'file'}));
 assert.deepEqual(virtualSyncFiles(records,'/workspace').map(file=>file.path),['src/main.js']);
 assert.deepEqual(virtualSyncFiles(records,'/workspace',[{path:'web-dist/index.html',mode:'100644'}]).map(file=>file.path),['web-dist/index.html','src/main.js']);
 const {assertSyncLimits,SYNC_LIMITS,validateEntries}=await core();
 assert.doesNotThrow(()=>assertSyncLimits('boundary',SYNC_LIMITS.fileBytes,SYNC_LIMITS.totalBytes,SYNC_LIMITS.files));
 assert.throws(()=>assertSyncLimits('video.bin',SYNC_LIMITS.fileBytes+1,0,1),/video\.bin.*per-file limit is 5 MiB/);
 assert.throws(()=>assertSyncLimits('last.txt',1,SYNC_LIMITS.totalBytes+1,1),/last\.txt.*exceeds 40 MiB/);
 assert.throws(()=>assertSyncLimits('extra.txt',1,1,SYNC_LIMITS.files+1),/extra\.txt.*2,000 files \(2001 scanned\)/);
 assert.throws(()=>validateEntries(Array.from({length:2001},(_,index)=>({path:`file-${index}`}))),/file-2000.*2,000 files/);
});

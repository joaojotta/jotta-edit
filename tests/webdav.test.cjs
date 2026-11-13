'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {RemoteFolders}=require('../electron/remote-folders.cjs');
const {createRemoteClient}=require('../electron/remote-clients.cjs');
const {Favourites}=require('../electron/favourites.cjs');
const {startWebDav}=require('./fixtures/webdav-server.cjs');
const credentials={username:'test',password:'test-password'};
async function setup(t,options){
  const disk=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-webdav-'));
  t.after(()=>fs.rm(disk,{recursive:true,force:true}));
  const server=await startWebDav(disk,options);t.after(()=>server.close());
  const remote=new RemoteFolders({base:path.join(disk,'virtual')});t.after(()=>remote.close());
  return {disk,server,remote};
}
test('HTTP and HTTPS WebDAV endpoints validate and save favourites without exposing passwords',async t=>{
  const {remoteLocation}=await import('../shared/remote-location.mjs');
  assert.equal(remoteLocation('https://cloud.example/remote.php/dav/files/alice/My Project',credentials).uri,'https://test@cloud.example/remote.php/dav/files/alice/My%20Project');
  assert.equal(remoteLocation('http://host:8080/dav').protocol,'http');
  for(const address of ['https://user:secret@host/dav','https://host/dav?token=secret','https://host/dav#frag','https://host/a%2fb'])assert.throws(()=>remoteLocation(address));
  assert.throws(()=>remoteLocation('https://host/dav',{username:'bad:name'}));
  const {disk}=await setup(t);
  const saved=new Favourites(path.join(disk,'favourites.json'));
  const entry=await saved.save({kind:'remote',location:'https://host/dav'},credentials);
  assert.equal(entry.location,'https://test@host/dav');
  assert.equal((await fs.readFile(saved.file,'utf8')).includes(credentials.password),false);
});
for(const digest of [false,true])test(`WebDAV ${digest?'Digest':'Basic'} sessions browse, save, create, rename, trash and reconnect`,async t=>{
  const {disk,server,remote}=await setup(t,{digest});
  await fs.writeFile(path.join(disk,'hello & # %.txt'),'before');
  const {root}=await remote.connect(server.url,undefined,credentials),file=path.join(root,'hello & # %.txt');
  assert.deepEqual(await remote.readdir(root),['hello & # %.txt']);
  assert.equal(await remote.readFile(file,'utf8'),'before');
  await remote.save(file,'after',{expectedText:'before'});
  assert.equal(await fs.readFile(path.join(disk,'hello & # %.txt'),'utf8'),'after');
  await assert.rejects(remote.save(file,'stale',{expectedText:'before'}),/changed on the server/);
  await remote.save(path.join(root,'new.txt'),'created');
  await remote.mkdir(path.join(root,'sub'));
  await remote.rename(path.join(root,'new.txt'),path.join(root,'sub','renamed.txt'));
  await assert.rejects(remote.rename(file,path.join(root,'sub','renamed.txt')),{code:'EEXIST'});
  await remote.trash(path.join(root,'sub','renamed.txt'));
  assert.equal((await fs.readdir(path.join(disk,'.jotta-trash'))).length,1);
  assert.equal((await remote.reconnect(root)).root,root);
  await assert.rejects(remote.connect(server.url,undefined,{...credentials,password:'wrong-secret'}),e=>!e.message.includes('wrong-secret')&&/Could not connect/.test(e.message));
  assert.equal(await remote.readFile(file,'utf8'),'after');
  const put=server.requests.find(r=>r.method==='PUT');assert.equal(put.headers['if-none-match'],'*');
  assert.ok(server.requests.some(r=>r.method==='MOVE'&&r.headers.overwrite==='T'));
  assert.ok(server.requests.some(r=>r.method==='MOVE'&&r.headers.overwrite==='F'));
});
test('WebDAV connects directly to protected nested endpoints without probing ancestors',async t=>{
  const {disk,server,remote}=await setup(t);
  await fs.mkdir(path.join(disk,'nested'));await fs.writeFile(path.join(disk,'nested','a.txt'),'nested');
  const {root}=await remote.connect(server.url+'/nested/',undefined,credentials);
  assert.equal(await remote.readFile(path.join(root,'a.txt'),'utf8'),'nested');
  assert.equal(server.requests.some(r=>r.url==='/'),false);
});
test('WebDAV write failures preserve existing files and leave no staging files',async t=>{
  const {disk,server,remote}=await setup(t,{handle(req,res){if(req.method==='MOVE'){res.writeHead(403);res.end();return true;}return false;}});
  await fs.writeFile(path.join(disk,'file.txt'),'original');
  const {root}=await remote.connect(server.url,undefined,credentials);
  await assert.rejects(remote.save(path.join(root,'file.txt'),'new',{expectedText:'original'}),/access denied/);
  assert.equal(await fs.readFile(path.join(disk,'file.txt'),'utf8'),'original');
  assert.deepEqual(await fs.readdir(disk),['file.txt']);
});
test('WebDAV rejects redirects, unbounded downloads and XML entities, and close cancels requests',async t=>{
  const {remoteLocation}=await import('../shared/remote-location.mjs');
  let cancelled=false;
  const other=await setup(t);
  const {server}=await setup(t,{handle(req,res){
    if(req.url.includes('redirect')){res.writeHead(302,{Location:other.server.url+'/stolen'});res.end();return true;}
    if(req.url.includes('large')){res.writeHead(200,{'Content-Length':21*1024*1024});res.end();return true;}
    if(req.url.includes('entity')){res.writeHead(207);res.end('<!DOCTYPE x [<!ENTITY y "boom">]><x/>');return true;}
    if(req.url.includes('waiting')){req.on('close',()=>{cancelled=true;});return true;}
    return false;
  }});
  const client=await createRemoteClient(remoteLocation(server.url,credentials),credentials);t.after(()=>client.close());
  await assert.rejects(client.stat('/dav/redirect'));
  assert.equal(other.server.requests.length,0,'redirect target must not receive credentials or requests');
  await assert.rejects(client.read('/dav/large'));
  await assert.rejects(client.stat('/dav/entity'));
  const pending=client.stat('/dav/waiting');await new Promise(r=>setTimeout(r,30));client.close();
  await assert.rejects(pending);await new Promise(r=>setTimeout(r,30));assert.equal(cancelled,true);
});

test('WebDAV exclusive uploads preserve existing targets and accept collection slash redirects',async t=>{
  const {remoteLocation}=await import('../shared/remote-location.mjs');
  const {disk,server}=await setup(t,{handle(req,res){
    if(req.method==='PROPFIND'&&req.url==='/dav'){res.writeHead(301,{Location:'/dav/'});res.end();return true;}
    return false;
  }});
  await fs.writeFile(path.join(disk,'existing.txt'),'original');
  const client=await createRemoteClient(remoteLocation(server.url,credentials),credentials);t.after(()=>client.close());
  assert.equal((await client.stat('/dav')).isDirectory(),true);
  await assert.rejects(client.write('/dav/existing.txt',Buffer.from('replacement')),{code:'EEXIST'});
  assert.equal(await fs.readFile(path.join(disk,'existing.txt'),'utf8'),'original');
});

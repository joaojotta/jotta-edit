'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {Favourites}=require('../electron/favourites.cjs');
function encryption(){
  const key=crypto.randomBytes(32);
  return {isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',
    encryptString(text){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]);},
    decryptString(bytes){const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}};
}
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-favourites-'));t.after(()=>fs.rm(root,{force:true,recursive:true}));const file=path.join(root,'favourites.json'),safeStorage=encryption();return {root,file,safeStorage,store:new Favourites(file,{safeStorage,platform:'linux'})};}
test('local and remote favourites persist, deduplicate and remove independently of workspace files',async t=>{
  const {root,file,safeStorage,store}=await fixture(t);
  const local=await store.save({kind:'local',location:root}),remote=await store.save({kind:'remote',location:'sftp://user@host/project'});
  assert.equal((await store.save({kind:'local',location:root+path.sep})).id,local.id);
  const restored=new Favourites(file,{safeStorage,platform:'linux'});assert.equal((await restored.list()).entries.length,2);
  await restored.remove(remote.id);assert.deepEqual((await restored.list()).entries,[local]);assert.ok((await fs.stat(root)).isDirectory());
  await assert.rejects(store.save({kind:'local',location:'relative'}),/Invalid favourite/);
  await assert.rejects(store.save({kind:'remote',location:'sftp://user:password@host/path'}),/Leave passwords/);
});
test('saved credentials are encrypted, absent from listings, survive restart and can be deleted independently',async t=>{
  const {file,store,safeStorage}=await fixture(t),password='test-password-not-in-plaintext';
  const entry=await store.save({kind:'remote',location:'smb://server/share',saveCredentials:true},{username:'DOMAIN\\alice',password});
  assert.equal(entry.hasCredentials,true);assert.doesNotMatch(await fs.readFile(file,'utf8'),new RegExp(password));
  assert.equal(entry.secret,undefined);assert.equal(JSON.stringify(await store.list()).includes(password),false);
  if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o600);
  const restored=new Favourites(file,{safeStorage,platform:'linux'});
  assert.deepEqual((await restored.connection(entry.id)).credentials,{username:'DOMAIN\\alice',password});
  await restored.deleteCredentials(entry.id);assert.equal((await restored.list()).entries[0].hasCredentials,false);
  assert.deepEqual((await restored.connection(entry.id)).credentials,{});assert.equal((await restored.list()).entries[0].location,entry.location);
  assert.equal((await fs.readFile(file,'utf8')).includes('secret'),false);
});
test('anonymous favourites work without encryption, but credential persistence rejects missing and plaintext key stores',async t=>{
  const {file}=await fixture(t);
  for(const safeStorage of [undefined,{isEncryptionAvailable:()=>false},{...encryption(),getSelectedStorageBackend:()=> 'basic_text'}]){
    const store=new Favourites(file,{safeStorage,platform:'linux'});assert.equal((await store.list()).credentialsAvailable,false);
    await store.save({kind:'remote',location:'ftp://host/project'});
    await assert.rejects(store.save({kind:'remote',location:'ftp://host/project',saveCredentials:true},{username:'alice',password:'secret'}),/Secure credential storage is unavailable/);
    assert.equal((await store.list()).entries[0].hasCredentials,false);
  }
});
test('credential updates preserve entry identity; deleting favourites removes the encrypted secret',async t=>{
  const {file,store}=await fixture(t),value={kind:'remote',location:'sftp://alice@host/path',saveCredentials:true};
  const first=await store.save(value,{password:'before'}),second=await store.save(value,{password:'after'});
  assert.equal(first.id,second.id);assert.equal((await store.connection(first.id)).credentials.password,'after');
  await store.save({...value,saveCredentials:false});assert.equal((await store.connection(first.id)).credentials.password,'after');
  await store.remove(first.id);assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),[]);
});
test('unavailable or corrupt credentials remain deletable and errors never reveal secrets',async t=>{
  const {file,store,safeStorage}=await fixture(t),entry=await store.save({kind:'remote',location:'sftp://alice@host/path',saveCredentials:true},{password:'never-in-errors'});
  safeStorage.decryptString=()=>{throw new Error('never-in-errors');};
  await assert.rejects(store.connection(entry.id),error=>!error.message.includes('never-in-errors')&&/could not be read/.test(error.message));
  safeStorage.isEncryptionAvailable=()=>false;
  await assert.rejects(store.connection(entry.id),/Saved credentials are unavailable/);
  await store.deleteCredentials(entry.id);assert.equal((await store.list()).entries[0].hasCredentials,false);
  await fs.writeFile(file,'invalid JSON');await assert.rejects(store.save({kind:'local',location:'/project'}),/Could not read favourites/);assert.equal(await fs.readFile(file,'utf8'),'invalid JSON');
});
test('queued saves and credential deletions preserve all favourites across concurrent requests',async t=>{
  const {root,store}=await fixture(t);
  await Promise.all(Array.from({length:12},(_,i)=>store.save({kind:'local',location:path.join(root,String(i))})));
  assert.equal((await store.list()).entries.length,12);
});
test('server reconnect uses saved passwords only for the exact favourite and supports manual replacement when locked',async t=>{
  const {store,safeStorage}=await fixture(t),entry=await store.save({kind:'remote',location:'sftp://alice@host/path',saveCredentials:true},{password:'saved-password'});
  const calls=[],remote={async connect(location,signal,credentials){calls.push({location,credentials});return {root:'/remote',uri:location};}};
  await store.connect(remote,entry.location,{username:'alice',password:''},{favouriteId:entry.id});
  assert.equal(calls[0].credentials.password,'saved-password');
  await assert.rejects(store.connect(remote,'sftp://evil/path',{}, {favouriteId:entry.id}),/address changed/);assert.equal(calls.length,1);
  safeStorage.isEncryptionAvailable=()=>false;
  await store.connect(remote,entry.location,{username:'alice',password:'manual'},{favouriteId:entry.id});assert.equal(calls[1].credentials.password,'manual');
});
test('failed authentication never saves credentials and persistence failures retain the successful connection',async t=>{
  const {store}=await fixture(t),options={saveFavourite:true,saveCredentials:true};
  await assert.rejects(store.connect({connect:async()=>{throw new Error('Authentication failed');}},'sftp://alice@host/path',{password:'secret'},options),/Authentication failed/);
  assert.deepEqual((await store.list()).entries,[]);
  store.save=async()=>{throw new Error('Could not save favourites. Check access to the application data folder.');};
  const result=await store.connect({connect:async()=>({root:'/remote',uri:'sftp://alice@host/path'})},'sftp://alice@host/path',{password:'secret'},options);
  assert.equal(result.root,'/remote');assert.match(result.warning,/Could not save favourites/);
});
test('browser local favourites persist and reject remote credentials',async()=>{
  const {browserFavourites}=await import('../src/favourites.js'),data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const first=browserFavourites(storage),entry=await first.saveFavourite({kind:'local',location:'/native/id/project'});
  assert.equal((await first.saveFavourite({kind:'local',location:entry.location})).id,entry.id);
  const restored=browserFavourites(storage);assert.deepEqual((await restored.listFavourites()).entries,[entry]);assert.equal((await restored.listFavourites()).credentialsAvailable,false);
  await assert.rejects(restored.saveFavourite({kind:'remote',location:'sftp://host/path',password:'secret'}),/Invalid favourite/);
  await restored.removeFavourite(entry.id);assert.deepEqual((await restored.listFavourites()).entries,[]);
});

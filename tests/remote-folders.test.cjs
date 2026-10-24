'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {RemoteFolders}=require('../electron/remote-folders.cjs');
const {writeRemoteText}=require('../electron/remote-save.cjs');
async function folder(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-remote-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('remote addresses accept FTP, SFTP and SMB and reject passwords and invalid paths',async()=>{
 const {remoteLocation,smbPath}=await import('../shared/remote-location.mjs');
 assert.equal(remoteLocation('sftp://alice@host:2222/path with spaces').uri,'sftp://alice@host:2222/path%20with%20spaces');
 assert.equal(remoteLocation('ftp://host').protocol,'ftp');
 assert.equal(smbPath(remoteLocation('smb://host/share/a%20b')),'\\\\host\\share\\a b');
 for(const address of ['http://host','file:///tmp','sftp://alice:secret@host/home','smb://host','ftp://host/path?x=1','sftp://host/path#hash','sftp://host/%00','sftp://host/a%2Fb','sftp://host/%XX','sftp://host/a\nb']){
  assert.throws(()=>remoteLocation(address));
 }
 assert.throws(()=>smbPath(remoteLocation('smb://host:444/share')),/Map this SMB/);
});
test('separate credentials validate usernames and preserve URI escaping without including passwords',async()=>{
 const {remoteLocation}=await import('../shared/remote-location.mjs');
 assert.equal(remoteLocation('sftp://old@host/path',{username:'new@user /%',password:'p@ss: /%'}).uri,'sftp://new%40user%20%2F%25@host/path');
 assert.equal(remoteLocation('ftp://alice@host',{password:'secret'}).uri,'ftp://alice@host/');
 for(const credentials of [null,[],{username:1},{password:1},{username:'a\nb'},{username:'a',password:'a\0b'},{username:'a'.repeat(4097)},{username:'\ud800'},{username:'a',password:'\udfff'}])assert.throws(()=>remoteLocation('ftp://host',credentials),/valid username/);
 assert.throws(()=>remoteLocation('ftp://host',{password:'secret'}),/Enter a username/);
});
test('remote saves stage, flush and verify contents while preserving file permissions',async t=>{
 const root=await folder(t),file=path.join(root,'script.sh');await fs.writeFile(file,'old',{mode:0o755});
 await writeRemoteText(file,'new',{expectedText:'old'});assert.equal(await fs.readFile(file,'utf8'),'new');
 if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o755);
 assert.deepEqual(await fs.readdir(root),['script.sh']);
 await writeRemoteText(path.join(root,'new.txt'),'created');assert.equal(await fs.readFile(path.join(root,'new.txt'),'utf8'),'created');
});
test('stale remote files and failed server renames preserve existing data',async t=>{
 const root=await folder(t),file=path.join(root,'file.txt');await fs.writeFile(file,'external');
 await assert.rejects(writeRemoteText(file,'ours',{expectedText:'old'}),/changed on the server/);
 await assert.rejects(writeRemoteText(file,'ours',{expectedText:'external',io:{...fs,rename:async()=>{throw new Error('Server rename failed');}}}),/Server rename failed/);
 assert.equal(await fs.readFile(file,'utf8'),'external');assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('a remote edit arriving while staging is never overwritten',async t=>{
 const root=await folder(t),file=path.join(root,'file.txt');await fs.writeFile(file,'before');
 const io={...fs,open:async(...args)=>{const handle=await fs.open(...args);return {truncate:size=>handle.truncate(size),writeFile:async text=>{await handle.writeFile(text);await fs.writeFile(file,'server edit');},sync:()=>handle.sync(),close:()=>handle.close()};}};
 await assert.rejects(writeRemoteText(file,'ours',{expectedText:'before',io}),/changed on the server/);
 assert.equal(await fs.readFile(file,'utf8'),'server edit');assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('failed flushes leave original remote contents intact',async t=>{
 const root=await folder(t),file=path.join(root,'file.txt');await fs.writeFile(file,'before');
 const io={...fs,open:async(...args)=>{const handle=await fs.open(...args);return {truncate:size=>handle.truncate(size),writeFile:text=>handle.writeFile(text),sync:async()=>{throw new Error('Disconnected during upload');},close:()=>handle.close()};}};
 await assert.rejects(writeRemoteText(file,'ours',{expectedText:'before',io}),/Disconnected during upload/);
 assert.equal(await fs.readFile(file,'utf8'),'before');assert.deepEqual(await fs.readdir(root),['file.txt']);
});
test('v1.1.0 exposes remote folders, retains both palettes and has no account integration',async()=>{
 const read=name=>fs.readFile(path.join(__dirname,'..',name),'utf8');
 const {syntaxPalettes,syntaxThemeChoices}=await import('../src/syntax-themes.js');
 assert.equal(require('../package.json').version,'1.1.4');
 assert.equal(syntaxPalettes['github-dark'].background,'#0d1117');
 assert.ok(syntaxThemeChoices.some(theme=>theme.id==='github-dark'));
 assert.ok(syntaxThemeChoices.some(theme=>theme.id==='github-light'));assert.equal(syntaxPalettes['github-light'].background,'#ffffff');
 for(const file of ['index.html','web/index.html']){
  const html=await read(file);assert.match(html,/id="remote-overlay"/);assert.match(html,/id="btn-remote-folder"[^>]*hidden/);
  assert.doesNotMatch(html,/github-panel|btn-github|api\.github\.com/);
 }
 assert.doesNotMatch(await read('electron/preload.cjs'),/githubState|githubTokenHelp/);
 assert.doesNotMatch(await read('web/browser-api.js'),/connectRemoteFolder|github/i);
 assert.doesNotMatch(await read('VERSION_HISTORY.md'),/github/i);assert.match(await read('VERSION_HISTORY.md'),/1\.1\.0 — Remote folders/);
});

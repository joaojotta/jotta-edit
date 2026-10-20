'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
async function adapter(t) {
  const memory = `
    const files=new Map(), meta=new Map();let failCache=false;
    export function cacheFailure(value){failCache=value;}
    export async function getFile(path){return files.get(path);}
    export async function putFile(value){if(failCache)throw new Error('Quota exceeded');files.set(value.path,value);}
    export async function allFiles(){return [...files.values()];}
    export async function addFile(value){files.set(value.path,value);}
    export async function getMeta(key,fallback=null){return meta.get(key)??fallback;}
    export async function putMeta(key,value){meta.set(key,value);}
    export async function mutateFiles(){}
    export async function putWorkspaceContext(){}
    export async function updateHistory(fn){meta.set('local-history',fn(meta.get('local-history')||[]));}
  `;
  const url='data:text/javascript;base64,'+Buffer.from(memory+'\n//'+crypto.randomUUID()).toString('base64');
  let source=await fs.readFile(path.join(__dirname,'../web/browser-api.js'),'utf8');
  source=source.replace("'./storage.js'",JSON.stringify(url))
    .replace("'./github-workspace.js'",JSON.stringify(pathToFileURL(path.join(__dirname,'../web/github-workspace.js')).href))
    .replace("'./zip.js'",JSON.stringify(pathToFileURL(path.join(__dirname,'../web/zip.js')).href))
    .replace("'../shared/local-history.mjs'",JSON.stringify(pathToFileURL(path.join(__dirname,'../shared/local-history.mjs')).href));
  const {browserApi:api}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const originalWindow=global.window, originalDocument=global.document, originalTimeout=global.setTimeout;
  const downloads=[];
  const selected=[];
  global.window={addEventListener(){},removeEventListener(){}};
  global.document={body:{append(){}},createElement(tag){
    return {style:{},files:selected,remove(){},addEventListener(type,fn){this[type]=fn;},click(){if(tag==='a')downloads.push(this.download);else this.change();}};
  }};
  // No persistent revocation timers in the unit process.
  global.setTimeout=(fn,ms)=>ms===120000 ? 0 : originalTimeout(fn,ms);
  t.after(()=>{global.window=originalWindow;global.document=originalDocument;global.setTimeout=originalTimeout;});
  return {api,store:await import(url),downloads,selected};
}
function handle(name,text) {
  const h={name,text,permission:'granted',requests:0,aborts:0,fail:false,
    isSameEntry:async other=>h===other,queryPermission:async()=>h.permission,
    requestPermission:async()=>{h.requests++;return h.permission;},
    getFile:async()=>({name,lastModified:123,size:Buffer.byteLength(h.text),arrayBuffer:async()=>new TextEncoder().encode(h.text).buffer}),
    createWritable:async()=>{let pending;return {write:async text=>{pending=text;if(h.fail)throw new Error('Write failed');},close:async()=>{h.text=pending;},abort:async()=>{h.aborts++;}};}};
  return h;
}
test('native individual files retain identities, save directly and guard against external changes', async t => {
  const {api,store}=await adapter(t), first=handle('same.txt','original'), second=handle('same.txt','other');
  window.showOpenFilePicker=async()=>[first,second];
  const [a,b]=await api.chooseFiles();assert.notEqual(a,b);
  assert.equal((await api.readFile(a)).content,'original');
  assert.equal(await api.saveLocation(a),'Local file');
  await api.saveFile(a,'changed',{expectedText:'original'});assert.equal(first.text,'changed');assert.equal(second.text,'other');
  window.showOpenFilePicker=async()=>[first];assert.equal((await api.chooseFiles())[0],a);
  first.text='external';await assert.rejects(api.saveFile(a,'pending',{expectedText:'changed'}),/changed on disk/);
  assert.equal(first.text,'external');assert.equal((await store.getFile(a)).content,'changed');
  window.showSaveFilePicker=async()=>first;assert.equal(await api.saveAsDialog('same.txt'),a);
});
test('cancelled pickers, permission failures and failed writes do not replace saved contents', async t => {
  const {api,store}=await adapter(t), file=handle('a.txt','saved');
  window.showOpenFilePicker=async()=>[file];const [a]=await api.chooseFiles();
  window.showSaveFilePicker=async()=>{throw Object.assign(new Error('Cancelled'),{name:'AbortError'});};
  assert.equal(await api.saveAsDialog('a.txt'),null);
  file.permission='denied';
  assert.equal((await api.readFile(a)).content,'saved'); // cached recovery copy
  await assert.rejects(api.saveFile(a,'pending'),/access expired/);assert.equal(file.requests,1);
  assert.equal(file.text,'saved');
  file.permission='granted';file.fail=true;
  await assert.rejects(api.saveFile(a,'pending'),/Write failed/);
  assert.equal(file.aborts,1);assert.equal(file.text,'saved');assert.equal((await store.getFile(a)).content,'saved');
  await assert.rejects(api.saveFile('/local-files/missing/a.txt','pending'),/access expired/);
});
test('successful disk writes report cache failures without pretending the file was not saved', async t => {
  const {api,store}=await adapter(t), file=handle('a.txt','old');
  window.showOpenFilePicker=async()=>[file];const [a]=await api.chooseFiles();
  store.cacheFailure(true);const result=await api.saveFile(a,'new');
  assert.equal(file.text,'new');assert.match(result.notice,/recovery copy could not be updated/);
});
test('unsupported browsers download standalone saves and Save As copies; workspace saves stay internal', async t => {
  const {api,selected,downloads,store}=await adapter(t);
  const file=handle('a.txt','source');selected.push(await file.getFile());
  const [a]=await api.chooseFiles(), [b]=await api.chooseFiles();assert.notEqual(a,b);
  assert.equal(await api.saveLocation(a),'Download copy');
  const result=await api.saveFile(a,'edited');assert.match(result.notice,/Download started/);
  assert.deepEqual(downloads,['a.txt']);assert.equal((await store.getFile(a)).content,'edited');
  window.prompt=()=>null;assert.equal(await api.saveAsDialog('a.txt'),null);
  window.prompt=()=> 'copy.txt';const destination=await api.saveAsDialog('a.txt');
  await api.saveFile(destination,'copy');assert.deepEqual(downloads,['a.txt','copy.txt']);
  await api.saveFile('/workspace/Project/a.txt','internal');assert.equal(downloads.length,2);
  assert.equal(await api.saveLocation('/workspace/Project/a.txt'),'Browser storage');
});

test('native file pickers recognize an existing tab opened through a folder handle', async t => {
  const {api,store}=await adapter(t), file=handle('a.txt','original');
  await store.putMeta('workspace-root','/native/project');await store.putMeta('workspace-mode','native');
  await store.putMeta('workspace-handle',{queryPermission:async()=> 'granted',getFileHandle:async()=>file});
  window.showSaveFilePicker=async()=>file;window.showOpenFilePicker=async()=>[file];
  const options={openPaths:['/native/project/a.txt']};
  assert.equal(await api.saveAsDialog('a.txt',options),'/native/project/a.txt');
  assert.deepEqual(await api.chooseFiles(options),['/native/project/a.txt']);
  assert.equal(await store.getFile('/native/project/a.txt'),undefined);
});

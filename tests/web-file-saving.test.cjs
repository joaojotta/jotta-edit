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
    
    .replace("'../shared/font-files.mjs'", JSON.stringify(pathToFileURL(path.join(__dirname, '../shared/font-files.mjs')).href))
    .replace("'../shared/image-files.mjs'", JSON.stringify(pathToFileURL(path.join(__dirname, '../shared/image-files.mjs')).href))
    .replace("'../shared/markdown-paths.mjs'", JSON.stringify(pathToFileURL(path.join(__dirname, '../shared/markdown-paths.mjs')).href))
    .replace("'./markdown-export.js'", JSON.stringify(pathToFileURL(path.join(__dirname, '../web/markdown-export.js')).href))
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
test('native and imported image tabs preserve binary bytes and reject text saves', async t => {
  const {api,store,selected,downloads}=await adapter(t);
  const bytes=Uint8Array.from([137,80,78,71,0,255,128,10]);
  const file={name:'photo.png',size:bytes.length,lastModified:42,arrayBuffer:async()=>bytes.buffer};
  const native={name:file.name,queryPermission:async()=> 'granted',getFile:async()=>file};
  window.showOpenFilePicker=async()=>[native];
  const [path]=await api.chooseFiles();
  const opened=await api.readFile(path);
  assert.equal(opened.image.type,'image/png'); assert.equal(opened.content,'');
  assert.deepEqual(Buffer.from(opened.image.url.split(',')[1],'base64'),Buffer.from(bytes));
  await assert.rejects(api.saveFile(path,'destroyed'),/read-only/);
  api.downloadImage('photo.png',opened.image);assert.deepEqual(downloads,['photo.png']);
  delete window.showOpenFilePicker;selected.push(file);
  const [imported]=await api.chooseFiles();
  assert.deepEqual((await api.readFile(imported)).image,opened.image);
  await store.putFile({path:'/workspace/photo.webp',binary:bytes,mtimeMs:1});
  assert.equal((await api.readFile('/workspace/photo.webp')).image.type,'image/webp');
  await store.putFile({path:'/workspace/unknown.bin',binary:bytes});
  await assert.rejects(api.readFile('/workspace/unknown.bin'),/Binary file/);
});
test('SVG source remains editable and saved code replaces the original cached bytes', async t => {
  const {api,selected,store}=await adapter(t);
  const original='<svg xmlns="http://www.w3.org/2000/svg"><text>☕</text></svg>';
  const file=handle('drawing.svg',original);window.showOpenFilePicker=async()=>[file];
  const [path]=await api.chooseFiles();
  const before=await api.readFile(path);assert.equal(before.content,original);assert.equal(before.image.type,'image/svg+xml');
  const changed=original.replace('☕','😀');await api.saveFile(path,changed,{expectedText:original});
  assert.equal((await api.readFile(path)).content,changed);
  file.permission='denied';assert.equal((await api.readFile(path)).content,changed);
  delete window.showOpenFilePicker;selected.push(await handle('copy.svg',original).getFile());
  const [copy]=await api.chooseFiles();await api.saveFile(copy,changed,{expectedText:original});
  assert.equal((await api.readFile(copy)).content,changed);
  assert.equal((await store.getFile(copy)).binary,undefined);
});
test('native, imported and cached font previews retain bytes and cannot be saved as text',async t=>{
  const {api,store,selected,downloads}=await adapter(t);
  const bytes=Uint8Array.from([119,79,70,50,0,255,10]);
  const file={name:'sample.woff2',size:bytes.length,lastModified:42,arrayBuffer:async()=>bytes.buffer};
  const native={name:file.name,queryPermission:async()=> 'granted',getFile:async()=>file};
  window.showOpenFilePicker=async()=>[native];const [path]=await api.chooseFiles();
  const opened=await api.readFile(path);assert.equal(opened.font.type,'font/woff2');assert.equal(opened.content,'');
  assert.deepEqual(Buffer.from(opened.font.url.split(',')[1],'base64'),Buffer.from(bytes));
  await assert.rejects(api.saveFile(path,'broken'),/Fonts are read-only/);
  api.downloadImage('sample.woff2',opened.font);assert.deepEqual(downloads,['sample.woff2']);
  native.queryPermission=async()=> 'denied';assert.deepEqual((await api.readFile(path)).font,opened.font);
  delete window.showOpenFilePicker;selected.push(file);const [copy]=await api.chooseFiles();assert.deepEqual((await api.readFile(copy)).font,opened.font);
  await store.putFile({path:'/workspace/sample.ttf',binary:bytes});assert.equal((await api.readFile('/workspace/sample.ttf')).font.type,'font/ttf');
});
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
  await assert.rejects(api.readFile(a, {fresh:true}), /access expired/, 'conflict resolution must not treat a recovery copy as the latest disk version');
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

test('external changes made during browser staging abort the write before commit', async t => {
  const {api,store} = await adapter(t), file = handle('a.txt', 'original');
  window.showOpenFilePicker = async () => [file];
  const [a] = await api.chooseFiles();
  const writable = file.createWritable;
  file.createWritable = async () => {
    const writer = await writable();
    const write = writer.write;
    writer.write = async text => {await write(text); file.text = 'external during save';};
    return writer;
  };
  await assert.rejects(api.saveFile(a, 'my edits', {expectedText:'original'}), /changed on disk/);
  assert.equal(file.text, 'external during save');
  assert.equal(file.aborts, 1);
  assert.equal((await store.getFile(a)).content, 'original');
});

test('browser storage saves also reject stale expected content', async t => {
  const {api,store} = await adapter(t), file = '/workspace/Project/file.txt';
  await store.addFile({path:file, content:'external'});
  await assert.rejects(api.saveFile(file, 'my edits', {expectedText:'original'}), /changed on disk/);
  assert.equal((await store.getFile(file)).content, 'external');
  await api.saveFile(file, 'resolved', {expectedText:'external'});
  assert.equal((await store.getFile(file)).content, 'resolved');
});

test('background metadata checks use current native files without prompting for permissions or reading cached content',async t=>{
  const {api,store}=await adapter(t),file=handle('a.txt','original');
  window.showOpenFilePicker=async()=>[file];const [a]=await api.chooseFiles();
  file.text='external update';assert.deepEqual(await api.statFile(a),{exists:true,mtimeMs:123,size:15});
  assert.equal((await store.getFile(a)).content,'original');
  file.permission='denied';await assert.rejects(api.statFile(a),/access expired/);assert.equal(file.requests,0);
  file.permission='granted';file.getFile=async()=>{throw Object.assign(new Error('Missing'),{name:'NotFoundError'});};
  assert.deepEqual(await api.statFile(a),{exists:false});
  await store.addFile({path:'/workspace/Project/unicode.txt',content:'ação',mtimeMs:42});
  assert.deepEqual(await api.statFile('/workspace/Project/unicode.txt'),{exists:true,mtimeMs:42,size:6});
});

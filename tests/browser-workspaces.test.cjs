'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
test('browser reopens empty workspaces and native folders by identity; old tabs keep their own handles', async t => {
  const memory = `
    const meta = new Map(), files = new Map();
    export async function getMeta(key,fallback=null) {return meta.has(key)?meta.get(key):fallback;}
    export async function putMeta(key,value) {meta.set(key,value);}
    export async function putWorkspaceContext(entry,previous) {
      const list=meta.get('workspace-registry')||[];
      for(const item of [previous,entry].filter(e=>e?.root)) {const i=list.findIndex(e=>e.root===item.root);if(i<0)list.push(item);else list[i]=item;}
      meta.set('workspace-registry',list);meta.set('workspace-root',entry.root);meta.set('workspace-mode',entry.mode);meta.set('workspace-handle',entry.handle);
    }
    export async function getFile(path){return files.get(path);}
    export async function putFile(record){files.set(record.path,record);}
    export async function addFile(record){files.set(record.path,record);}
    export async function allFiles(){return [...files.values()];}
    export async function mutateFiles(){}
    export async function updateHistory(fn){meta.set('local-history',fn(meta.get('local-history')||[]));}
  `;
  const url='data:text/javascript;base64,'+Buffer.from(memory).toString('base64');
  let source=await fs.readFile(path.join(__dirname,'../web/browser-api.js'),'utf8');
  source=source.replace("'./storage.js'",JSON.stringify(url))
    .replace("'./github-workspace.js'",JSON.stringify(pathToFileURL(path.join(__dirname,'../web/github-workspace.js')).href))
    .replace("'./zip.js'",JSON.stringify(pathToFileURL(path.join(__dirname,'../web/zip.js')).href))
    .replace("'../shared/local-history.mjs'",JSON.stringify(pathToFileURL(path.join(__dirname,'../shared/local-history.mjs')).href));
  const {browserApi:api}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const store=await import(url);
  function directory(text) {
    const entry={name:'Same',permission:'granted',text,
      queryPermission:async()=>entry.permission,requestPermission:async()=>entry.permission,
      isSameEntry:async other=>entry===other,
      getFileHandle:async()=>({getFile:async()=>({name:'a.txt',size:entry.text.length,lastModified:1,arrayBuffer:async()=>new TextEncoder().encode(entry.text).buffer}),
        createWritable:async()=>({write:async text=>{entry.text=text;},close:async()=>{}})})};
    return entry;
  }
  const first=directory('one'), second=directory('two');let chosen=first;
  const originalWindow=global.window;t.after(()=>{global.window=originalWindow;});
  global.window={showDirectoryPicker:async()=>chosen,confirm:()=>false};
  const a=await api.chooseFolder();chosen=second;const b=await api.chooseFolder();
  assert.notEqual(a,b);assert.equal(a.split('/').pop(),b.split('/').pop());
  assert.equal((await api.readFile(a+'/a.txt')).content,'one');
  await api.saveFile(a+'/a.txt','older tab saved');
  assert.equal(first.text,'older tab saved');assert.equal(second.text,'two');
  first.permission='denied';await assert.rejects(api.reopenWorkspace(a),/access expired/);
  assert.equal(await store.getMeta('workspace-root'),b);
  first.permission='granted';chosen=first;assert.equal(await api.chooseFolder(),a);
  const empty=await api.newWorkspace('Empty'), other=await api.newWorkspace('Empty');
  assert.notEqual(empty,other);await api.reopenWorkspace(empty);
  assert.equal(await store.getMeta('workspace-root'),empty);
  assert.equal((await api.scanFolder(empty)).count,0);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const tabState=import('../src/tab-state.js');
test('pinning keeps previews, moves pinned tabs first and unpinning preserves the open document',async()=>{
  const {pinTab}=await tabState;
  const tabs=[{id:'a'},{id:'b',preview:true,previewPane:'primary'},{id:'c'}];
  const doc=tabs[1];pinTab(tabs,doc);
  assert.equal(tabs[0],doc);assert.equal(doc.pinned,true);assert.equal(doc.preview,false);
  pinTab(tabs,tabs[2]);assert.deepEqual(tabs.map(doc=>doc.id),['b','c','a']);
  pinTab(tabs,doc,false);assert.equal(doc.pinned,false);assert.ok(tabs.includes(doc));
});
test('only a clean preview in the same pane can be replaced; shared and dirty models are kept',async()=>{
  const {replaceablePreview,keepTab}=await tabState;
  const left={id:'left',preview:true,previewPane:'primary'},right={id:'right',preview:true,previewPane:'secondary'};
  assert.equal(replaceablePreview([left,right],'secondary'),right);
  assert.equal(replaceablePreview([left,right],'primary',id=>id==='left'),null);
  assert.equal(left.preview,false);right.dirty=true;
  assert.equal(replaceablePreview([right],'secondary'),null);assert.equal(right.preview,false);
  assert.equal(keepTab(right),false);
});
async function opening(readFile) {
  const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const helpers=await tabState;
  const state={tabs:[],active:null}, disposed=[], messages=[];
  let nextId=0;
  const editorLayout={activePaneId:'primary',isVisibleElsewhere:()=>false};
  const context=vm.createContext({state,fileOpenGeneration:0,api:{readFile},editorLayout,...helpers,
    addDocument(file,content,mtime,options){const doc={id:String(++nextId),path:file,content,mtime,...options,pinned:false,dirty:false};state.tabs.push(doc);if(options.activate)state.active=doc.id;return doc;},
    disposeDocument(doc){assert.equal(doc.dirty,false);state.tabs.splice(state.tabs.indexOf(doc),1);disposed.push(doc.path);},
    setActive:id=>{state.active=id;},renderTabs(){},persist(){},showStatus:message=>messages.push(message)});
  vm.runInContext(source.slice(source.indexOf('async function openFile('),source.indexOf('async function restoreSavedSession(')),context);
  return {state,editorLayout,disposed,messages,open:(...args)=>context.openFile(...args),invalidate:()=>vm.runInContext('++fileOpenGeneration',context)};
}
test('preview opening replaces clean tabs only after a successful read, preserving edited and pinned tabs',async()=>{
  const f=await opening(async file=>{if(file==='missing')throw new Error('Missing');return {path:file,content:file};});
  await f.open('a',{preview:true});await f.open('missing',{preview:true});
  assert.deepEqual(f.state.tabs.map(doc=>doc.path),['a']);
  await f.open('b',{preview:true});assert.deepEqual(f.disposed,['a']);
  f.state.tabs[0].dirty=true;
  await f.open('c',{preview:true});assert.deepEqual(f.state.tabs.map(doc=>doc.path),['b','c']);
  assert.equal(f.state.tabs[0].preview,false);
  const {pinTab}=await tabState;pinTab(f.state.tabs,f.state.tabs[1]);
  await f.open('d',{preview:true});assert.equal(f.state.tabs.length,3);
});
test('a permanent open promotes an existing preview and repeated opens never create duplicate models',async()=>{
  const pending=[];const f=await opening(file=>new Promise(resolve=>pending.push(()=>resolve({path:file,content:'same'}))));
  const preview=f.open('a',{preview:true}),permanent=f.open('a',{preview:false});
  pending[1]();await permanent;pending[0]();await preview;
  assert.equal(f.state.tabs.length,1);assert.equal(Boolean(f.state.tabs[0].preview),false);
  await f.open('a',{preview:true});assert.equal(f.state.tabs[0].preview,false);
});
test('out of order preview reads, changed selection and pane switches cannot replace the current file',async()=>{
  const pending=new Map();const f=await opening(file=>new Promise(resolve=>pending.set(file,()=>resolve({path:file,content:file}))));
  const first=f.open('a',{preview:true}),second=f.open('b',{preview:true});
  pending.get('b')();await second;pending.get('a')();assert.equal(await first,false);
  assert.deepEqual(f.state.tabs.map(doc=>doc.path),['b']);
  const third=f.open('c',{preview:true});f.invalidate();pending.get('c')();assert.equal(await third,false);
  const fourth=f.open('d',{preview:true});f.editorLayout.activePaneId='secondary';pending.get('d')();assert.equal(await fourth,false);
  assert.equal(f.state.tabs.length,1);
});
test('pin state survives session normalisation without treating untrusted flags as pinned',()=>{
  const {normalizeSession}=require('../electron/session-store.cjs');
  const session=normalizeSession({tabs:[{path:'/a',dirty:false,pinned:true},{path:'/b',dirty:false,pinned:'true'},{path:null,text:'draft',pinned:true}]});
  assert.equal(session.tabs[0].pinned,true);assert.equal(session.tabs[1].pinned,undefined);assert.equal(session.tabs[2].pinned,true);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {panelDom}=require('./fixtures/panel-dom.cjs');
const ids=['status','open','list','up','location','hidden','form','home','cancel','close','overlay','title','filter','multiple','select-all','select-none','selection'].map(name=>'folder-picker-'+name);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(overrides={},seed={}){
  const {installFolderPicker}=await import('../src/folder-picker.js');
  const {documentRef,elements}=panelDom(ids),memory=new Map(Object.entries(seed)),requests=[],validated=[];
  const api={browseFolders:async path=>{requests.push(path);return {path:path||'/home/test',parent:'/home',folders:[{name:'src',path:'/home/test/src'}],files:['a.css','b.css','c.js'].map(name=>({name,path:'/home/test/'+name}))};},selectFile:async path=>{validated.push(path);return path;},selectFolder:async path=>path,...overrides};
  let picker;picker=installFolderPicker({api,documentRef,storage:{getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)},show(){picker.hide();},close(){picker.hide();}});
  return {picker,elements,memory,requests,validated};
}
test('file picker remembers separate file and folder locations and falls back from missing directories',async()=>{
  const f=await fixture({}, {'jotta.filePickerLastFolder':'/last/files','jotta.folderPickerLastFolder':'/last/folders'});
  const files=f.picker.choose({allowFiles:true,multiple:true});await tick();assert.equal(f.requests[0],'/last/files');f.picker.hide();await files;
  const folders=f.picker.choose();await tick();assert.equal(f.requests[1],'/last/folders');f.picker.hide();await folders;
  const requests=[];const g=await fixture({browseFolders:async path=>{requests.push(path);if(path)throw new Error('Missing');return {path:'/home',parent:'/',folders:[],files:[]};}},{'jotta.filePickerLastFolder':'/missing'});
  const opening=g.picker.choose({allowFiles:true,multiple:true});await tick();
  assert.deepEqual(requests,['/missing',undefined]);assert.equal(g.memory.get('jotta.filePickerLastFolder'),'/home');g.picker.hide();await opening;
});
test('filtering is live and multi-selection validates the whole chosen batch before returning',async()=>{
  const f=await fixture();const opening=f.picker.choose({allowFiles:true,multiple:true});await tick();
  f.elements['folder-picker-filter'].value='.css';f.elements['folder-picker-filter'].dispatch('input');
  assert.equal(f.elements['folder-picker-list'].children.length,2);
  f.elements['folder-picker-select-all'].onclick();
  assert.match(f.elements['folder-picker-selection'].textContent,/2/);assert.equal(f.requests.length,1,'filtering must not fetch another listing');
  await f.elements['folder-picker-open'].onclick();assert.deepEqual(await opening,['/home/test/a.css','/home/test/b.css']);
  assert.deepEqual(f.validated,['/home/test/a.css','/home/test/b.css']);
});
test('failed batch validation preserves selection; cancellation ignores pending validations',async()=>{
  let fail=true,finish;
  const f=await fixture({selectFile:async path=>{if(fail&&path.endsWith('b.css'))throw new Error('File missing');return path;}});
  const opening=f.picker.choose({allowFiles:true,multiple:true});await tick();
  f.elements['folder-picker-select-all'].onclick();await f.elements['folder-picker-open'].onclick();
  assert.match(f.elements['folder-picker-status'].textContent,/missing/);assert.equal(f.elements['folder-picker-open'].disabled,false);
  fail=false;await f.elements['folder-picker-open'].onclick();assert.equal((await opening).length,3);
  const g=await fixture({selectFile:()=>new Promise(resolve=>{finish=resolve;})});
  const cancelled=g.picker.choose({allowFiles:true,multiple:true});await tick();
  g.elements['folder-picker-list'].children[1].onclick({});
  const pending=g.elements['folder-picker-open'].onclick();g.picker.hide();finish('/home/test/a.css');await pending;assert.equal(await cancelled,null);
});
test('shift-selection works within filtered files and switching folders clears old selections',async()=>{
  const f=await fixture();const opening=f.picker.choose({allowFiles:true,multiple:true});await tick();
  f.elements['folder-picker-list'].children[1].onclick({});
  f.elements['folder-picker-list'].children[3].onclick({shiftKey:true});
  assert.match(f.elements['folder-picker-selection'].textContent,/3/);
  await f.elements['folder-picker-list'].children[0].onclick();
  assert.match(f.elements['folder-picker-selection'].textContent,/0/);f.picker.hide();await opening;
});

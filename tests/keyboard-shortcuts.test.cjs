'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const keyboard=import('../shared/keyboard-shortcuts.mjs');
const event=(key,options={})=>({key,ctrlKey:true,...options});
function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
test('shortcuts normalize key combinations, support Cmd and keypad zoom, and ignore composition/AltGraph',async()=>{
  const {normalizeShortcut,shortcutFromEvent,matchShortcut,shortcutLabel}=await keyboard;
  assert.equal(normalizeShortcut('Shift+Alt+f'),'Alt+Shift+F');
  assert.equal(shortcutFromEvent(event('+',{shiftKey:true})),'Ctrl+Plus');
  assert.equal(shortcutFromEvent(event('=',{})),'Ctrl+Plus');
  assert.equal(shortcutFromEvent(event('?',{shiftKey:true})),'Ctrl+Shift+/');
  assert.equal(shortcutFromEvent(event('Add',{code:'NumpadAdd'})),'Ctrl+Plus');
  assert.equal(shortcutLabel('Ctrl+Plus'),'Ctrl++');
  assert.equal(matchShortcut(event('s',{ctrlKey:false,metaKey:true})).id,'save');
  assert.equal(shortcutFromEvent(event('e',{getModifierState:()=>true})),null);
  assert.equal(shortcutFromEvent(event('e',{isComposing:true})),null);
  for(const invalid of ['A','Shift+A','Ctrl+Ctrl+S','Ctrl+Escape','Ctrl+','bad','Ctrl+F25'])assert.throws(()=>normalizeShortcut(invalid));
});
test('reassignment removes old commands, catches collisions with defaults, and safely resets persisted changes',async()=>{
  const {createKeyboardShortcuts}=await import('../src/keyboard-shortcuts.js');
  const {matchShortcut,validateShortcutOverrides}=await keyboard;
  const store=storage(),shortcuts=createKeyboardShortcuts(store);
  shortcuts.set('save','Ctrl+Alt+S');assert.equal(matchShortcut(event('s'),shortcuts.overrides),null);
  assert.equal(matchShortcut(event('s',{altKey:true}),shortcuts.overrides).id,'save');
  assert.throws(()=>shortcuts.set('save','Ctrl+O'),/conflict/);
  assert.equal(shortcuts.binding('save'),'Ctrl+Alt+S');
  const restored=createKeyboardShortcuts(store);assert.equal(restored.binding('save'),'Ctrl+Alt+S');
  restored.set('open-file','');restored.set('save','Ctrl+O');
  assert.throws(()=>restored.reset('open-file'),/conflict/);
  restored.resetAll();assert.equal(restored.binding('save'),'Ctrl+S');
  assert.throws(()=>validateShortcutOverrides({unknown:'Ctrl+Alt+U'}));
  store.setItem('jotta.keyboardShortcuts','{"save":"Ctrl+O"}');restored.reload();assert.equal(restored.binding('save'),'Ctrl+S');
});
test('portable settings round trip shortcut overrides and reject conflicts before applying',async()=>{
  const {exportSettings,parseSettingsImport,storeSettingsImport}=await import('../src/settings-transfer.js');
  const store=storage();store.setItem('jotta.keyboardShortcuts','{"save":"Ctrl+Alt+S","sidebar":""}');
  const incoming=parseSettingsImport(exportSettings(store));assert.deepEqual(incoming.keyboardShortcuts,{save:'Ctrl+Alt+S',sidebar:''});
  const destination=storage();storeSettingsImport(destination,incoming);assert.equal(JSON.parse(destination.getItem('jotta.keyboardShortcuts')).save,'Ctrl+Alt+S');
  assert.throws(()=>parseSettingsImport(JSON.stringify({format:'jotta-edit-settings',version:1,preferences:{keyboardShortcuts:{save:'Ctrl+O'}}})),/Invalid/);
});
test('recorder detects conflicts without saving and Assign commits only the recorded combination',async()=>{
  const {panelDom}=require('./fixtures/panel-dom.cjs');
  const {documentRef}=panelDom([]),create=documentRef.createElement;
  documentRef.createElement=tag=>{const node=create(tag);node.appendChild=function(child){this.append(child);return child;};return node;};
  const {createKeyboardShortcuts,installKeyboardShortcutEditor}=await import('../src/keyboard-shortcuts.js');
  const shortcuts=createKeyboardShortcuts(storage()),host=documentRef.createElement('div');
  installKeyboardShortcutEditor({host,shortcuts,documentRef});
  const list=host.children.at(-1),row=list.children.find(row=>row.children[0].textContent==='Save');
  const input=row.children[0].children[0],assign=row.children[1];
  input.dispatch('keydown',event('o',{stopPropagation(){},preventDefault(){}}));assert.equal(assign.disabled,true);assert.equal(shortcuts.binding('save'),'Ctrl+S');
  input.dispatch('keydown',event('s',{altKey:true,stopPropagation(){},preventDefault(){}}));assert.equal(assign.disabled,false);
  assign.onclick();assert.equal(shortcuts.binding('save'),'Ctrl+Alt+S');
});

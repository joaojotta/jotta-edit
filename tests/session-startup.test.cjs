'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(files = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const state = {tabs:[], active:null, nextUntitled:1, folders:[]};
  const metrics = {activations:0, renders:0};
  const context = vm.createContext({state, crypto:require('node:crypto'),
    api:{readFile:async file => {
      if (!(file in files)) throw new Error('File missing');
      return {path:file, content:files[file], mtimeMs:1};
    }},
    basename:file => file.split('/').pop(), languageOf:file => file.endsWith('.css') ? 'css' : 'plaintext',
    detectLanguage:() => 'plaintext', modelUri:() => ({}), applyIndentToModel(){},
    monaco:{languages:{getLanguages:() => [{id:'css'}, {id:'plaintext'}]}, editor:{
      createModel(content, language) {let changed=()=>{};return {getValue:() => content, setValue(value){content=value;changed();}, getLanguageId:() => language,
        onDidChangeContent(listener){changed=listener;},
        setLanguage(value){language=value;}};},
      setModelLanguage(model, language){model.setLanguage(language);}
    }},
    attachDocumentListener(doc){doc.model.onDidChangeContent(()=>{doc.dirty=doc.model.getValue()!==doc.savedText;});},
    folderFor:() => null, keepTab:doc => {doc.preview=false;},
    setActive(id){state.active=id;metrics.activations++;}, selectDocument(id){context.setActive(id);},
    renderTabs(){metrics.renders++;}, persist(){}, showStatus(){},
    openFolder:async()=>{}, activateWorkspaceFolder(){},
    openFile:async file => {try {const data=await context.api.readFile(file);context.addDocument(data.path,data.content);} catch {}}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/session-files.js'), 'utf8').replace('export async function*', 'async function*'), context);
  vm.runInContext(source.slice(source.indexOf('function addDocument('), source.indexOf('function newMarkdown(')), context);
  vm.runInContext(source.slice(source.indexOf('async function restoreSavedSession('), source.indexOf('async function chooseFile(')), context);
  return {state, metrics, restore:saved => context.restoreSavedSession(saved)};
}

test('recovery selects the saved document after earlier clean files disappeared', async () => {
  const f = fixture({'/selected.txt':'selected', '/last.txt':'last'});
  await f.restore({tabs:[{path:'/missing.txt'}, {path:'/selected.txt'}, {path:'/last.txt'}], activeIndex:1});
  assert.equal(f.state.tabs.find(doc => doc.id === f.state.active).path, '/selected.txt');
});

test('a missing selected file falls back to an available tab without losing drafts', async () => {
  const f = fixture({'/first.txt':'first', '/last.txt':'last'});
  await f.restore({tabs:[{path:'/first.txt'}, {path:'/missing.txt'}, {path:null, text:'draft', dirty:true}, {path:'/last.txt'}], activeIndex:1});
  assert.ok(f.state.tabs.some(doc => doc.id === f.state.active));
  assert.equal(f.state.tabs.find(doc => !doc.path).model.getValue(), 'draft');
});

test('recovery constructs tabs without activating each editor or repeatedly rendering the tab strip', async () => {
  const files = Object.fromEntries(Array.from({length:50}, (_,i) => [`/${i}.txt`, `file ${i}`]));
  const f = fixture(files);
  await f.restore({tabs:Object.keys(files).map(path => ({path})), activeIndex:20});
  assert.equal(f.state.tabs.length, 50);
  assert.equal(f.metrics.activations, 1);
  assert.ok(f.metrics.renders <= 2, `Rendered ${f.metrics.renders} times`);
});

test('dirty file recovery preserves the original baseline, pin and text', async () => {
  const f = fixture({'/style.css':'external edits'});
  await f.restore({tabs:[{path:'/style.css', text:'my edits', savedText:'original', dirty:true, pinned:true}], activeIndex:0});
  const doc = f.state.tabs[0];
  assert.equal(doc.model.getValue(), 'my edits');
  assert.equal(doc.savedText, 'original');
  assert.equal(doc.dirty, true);
  assert.equal(doc.pinned, true);
});

test('many dirty recovery buffers are restored without intermediate tab renders', async () => {
  const files = Object.fromEntries(Array.from({length:50}, (_,i) => [`/${i}.txt`, 'external changes']));
  const f = fixture(files);
  await f.restore({tabs:Object.keys(files).map(path => ({path, dirty:true, text:'draft', savedText:'original'})), activeIndex:0});
  assert.equal(f.metrics.activations, 1);
  assert.ok(f.metrics.renders <= 2, `Rendered ${f.metrics.renders} times`);
  assert.ok(f.state.tabs.every(doc => doc.dirty && doc.savedText === 'original' && doc.model.getValue() === 'draft'));
});

test('legacy dirty recovery uses the disk baseline when no saved baseline exists', async () => {
  const f = fixture({'/style.css':'saved'});
  await f.restore({tabs:[{path:'/style.css', text:'draft', dirty:true}], activeIndex:0});
  assert.equal(f.state.tabs[0].savedText, 'saved');
  assert.equal(f.state.tabs[0].dirty, true);
});

test('recovered missing files retain their source language and unsaved text', async () => {
  const f = fixture();
  await f.restore({tabs:[{path:'/missing.css', text:'body {color:red}', dirty:true}], activeIndex:0});
  const doc = f.state.tabs[0];
  assert.equal(doc.path, null);
  assert.equal(doc.name, 'recovered-missing.css');
  assert.equal(doc.model.getLanguageId(), 'css');
  assert.equal(doc.model.getValue(), 'body {color:red}');
  assert.equal(doc.dirty, true);
});

test('untitled recovery retains its name, pinned language and numbering', async () => {
  const f = fixture();
  await f.restore({tabs:[{path:null, name:'notes', text:'draft', language:'css'}], activeIndex:0, nextUntitled:8});
  const doc = f.state.tabs[0];
  assert.equal(doc.name, 'notes');
  assert.equal(doc.model.getLanguageId(), 'css');
  assert.equal(doc.languagePinned, true);
  assert.equal(doc.dirty, true);
  assert.equal(f.state.nextUntitled, 8);
});

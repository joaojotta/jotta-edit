'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');

class Element {
  constructor() {
    this.children = []; this.hidden = false; this.style = {setProperty() {}};
    this.classList = {add() {}, toggle() {}};
  }
  appendChild(child) {
    if (child.parentElement) child.parentElement.children = child.parentElement.children.filter(c => c !== child);
    this.children.push(child); child.parentElement = this; return child;
  }
  setAttribute() {}
  addEventListener() {}
  replaceChildren() { this.children = []; }
}
function fakeEditor() {
  let model = null, view = null, focus;
  return {
    onDidFocusEditorText(fn) { focus = fn; }, focus() { focus?.(); },
    getModel:() => model, setModel(value) { model = value; },
    saveViewState:() => view, restoreViewState(value) { view = value; },
    layout() {}, updateOptions() {}
  };
}
async function fixture() {
  global.document = {createElement:() => new Element()};
  const {installEditorLayout} = await import('../src/editor-layout.js');
  const root = new Element(), host = root.appendChild(new Element());
  let docs = ['a','b'].map(id => ({id, name:id, savedText:`saved ${id}`, model:{getLanguageId:() => 'plaintext'}}));
  const primary = fakeEditor(), editors = [primary];
  let active, diff, baseline;
  const monaco = {editor:{
    create() { const editor = fakeEditor(); editors.push(editor); return editor; },
    createModel(text, language) { baseline = {text, language, disposed:false, dispose() {this.disposed = true;}}; return baseline; },
    createDiffEditor() {
      const modified = fakeEditor(), original = fakeEditor();
      diff = {getModifiedEditor:() => modified, getOriginalEditor:() => original,
        setModel(pair) {this.pair = pair; modified.setModel(pair?.modified || null);}, layout() {}, updateOptions() {}};
      return diff;
    }
  }};
  const layout = installEditorLayout({monaco, primary, host, getDocuments:() => docs, options:() => ({}), configure() {},
    activate(editor, doc) {active = {editor, doc};}});
  layout.selectDocument(docs[0]);
  return {layout, docs, editors, get active() {return active;}, get diff() {return diff;}, get baseline() {return baseline;}, remove(id) {docs = docs.filter(d => d.id !== id);}};
}
test('split opens another file and maintains independent per-pane positions for shared models', async () => {
  const f = await fixture();
  f.editors[0].restoreViewState({cursor:12});
  f.layout.toggleSplit();
  assert.equal(f.active.doc.id, 'b');
  assert.equal(f.editors[0].getModel(), f.docs[0].model);
  f.layout.selectDocument(f.docs[0]);
  f.editors[1].restoreViewState({cursor:30});
  f.layout.selectDocument(f.docs[1]);
  f.layout.selectDocument(f.docs[0]);
  assert.deepEqual(f.editors[1].saveViewState(), {cursor:30});
  assert.deepEqual(f.editors[0].saveViewState(), {cursor:12});
  f.editors[0].focus();
  assert.equal(f.active.editor, f.editors[0]);
  f.layout.toggleSplit();
  assert.equal(f.editors[1].getModel(), null);
  assert.deepEqual(f.editors[0].saveViewState(), {cursor:12});
});
test('comparison owns only its saved snapshot and returns working selection to the originating pane', async () => {
  const f = await fixture(); f.layout.toggleSplit();
  f.editors[1].restoreViewState({cursor:8});
  f.layout.compareSaved(f.docs[1]);
  const snapshot = f.baseline;
  assert.equal(snapshot.text, 'saved b');
  assert.equal(f.diff.pair.modified, f.docs[1].model);
  f.diff.getOriginalEditor().focus();
  assert.equal(f.active.editor, f.diff.getModifiedEditor());
  assert.equal(f.active.doc.id, 'b');
  f.diff.getModifiedEditor().restoreViewState({cursor:19});
  f.layout.closeComparison();
  assert.ok(snapshot.disposed);
  assert.equal(f.diff.pair, null);
  assert.equal(f.active.editor, f.editors[1]);
  assert.deepEqual(f.editors[1].saveViewState(), {cursor:19});
});
test('Save As and rename rebind every view before the old model is disposed', async () => {
  const f = await fixture(); f.layout.toggleSplit(); f.layout.selectDocument(f.docs[0]);
  f.layout.compareSaved(f.docs[0]);
  const old = f.docs[0].model; f.docs[0].model = {getLanguageId:() => 'css'};
  f.layout.rebind(f.docs[0], old);
  assert.ok(f.editors.every(e => e.getModel() === f.docs[0].model));
  assert.equal(f.diff.pair.modified, f.docs[0].model);
});
test('closing a shared file removes references from both panes and the diff, including the final tab', async () => {
  const f = await fixture(); f.layout.toggleSplit(); f.layout.selectDocument(f.docs[0]);
  f.layout.compareSaved(f.docs[0]); const snapshot = f.baseline;
  f.remove('a'); f.layout.removeDocument('a', f.docs[1]);
  assert.ok(snapshot.disposed);
  assert.ok(f.editors.every(e => e.getModel() === f.docs[1].model));
  f.remove('b'); f.layout.removeDocument('b', null);
  assert.ok(f.editors.every(e => e.getModel() === null));
  assert.equal(f.active.doc, null);
});

test('history comparisons display the selected immutable revision against the live working model', async () => {
  const f = await fixture();
  f.layout.compareSaved(f.docs[0], {text:'historic text', label:'History version'});
  assert.equal(f.baseline.text, 'historic text');
  assert.equal(f.diff.pair.modified, f.docs[0].model);
  assert.equal(f.docs[0].savedText, 'saved a');
  f.layout.closeComparison();
  assert.ok(f.baseline.disposed);
});

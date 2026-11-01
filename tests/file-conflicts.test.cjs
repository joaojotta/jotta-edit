'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');

async function fixture() {
  const {createFileConflicts} = await import('../src/file-conflicts.js');
  let value = 'my edits', undo = [], latest = 'external edits', open = true;
  const doc = {path:'/project/file.txt', savedText:'original', dirty:true, model:{
    getValue:() => value, getFullModelRange:() => ({}), pushStackElement() {},
    pushEditOperations(_selections, edits) {undo.push(value); value = edits[0].text; doc.dirty = value !== doc.savedText;}
  }};
  const shown = [], backups = [], updates = [];
  const api = {readFile:async (_path, options) => {
    assert.equal(options.fresh, true, 'conflict reviews must not use browser recovery copies');
    return {content:latest, mtimeMs:123};
  }, captureHistory:async (path, text) => backups.push({path, text})};
  const conflicts = createFileConflicts({api, isOpen:item => open && item === doc,
    present:(...args) => shown.push(args), changed:item => updates.push(item)});
  return {doc, api, conflicts, shown, backups, updates, setLatest(text) {latest = text;},
    edit(text) {value = text;}, close() {open = false;}, undo() {value = undo.pop(); doc.dirty = value !== doc.savedText;}};
}

test('review keeps the saved baseline and working copy intact and only authorizes the reviewed external text', async () => {
  const f = await fixture(), review = await f.conflicts.check(f.doc);
  assert.equal(review.text, 'external edits');
  assert.equal(f.doc.model.getValue(), 'my edits');
  assert.equal(f.doc.savedText, 'original');
  assert.equal(f.shown.length, 0);
  f.conflicts.show(f.doc);
  assert.equal(f.shown[0][1], review);
  assert.equal(f.conflicts.expectedText(f.doc, review), 'external edits');
  assert.equal(await f.conflicts.check(f.doc), review, 'unchanged latest file retains the existing review');
  f.conflicts.clear(f.doc);
  assert.throws(() => f.conflicts.expectedText(f.doc, review), /Refresh the comparison/);
  assert.equal(f.doc.model.getValue(), 'my edits', 'closing a review never discards edits');
});

test('using the latest file creates a backup and an undoable edit without writing to the file', async () => {
  const f = await fixture(), review = await f.conflicts.check(f.doc);
  assert.equal(await f.conflicts.useLatest(f.doc, review), true);
  assert.deepEqual(f.backups, [{path:f.doc.path, text:'my edits'}]);
  assert.equal(f.doc.model.getValue(), 'external edits');
  assert.equal(f.doc.savedText, 'external edits');
  assert.equal(f.doc.mtimeMs, 123);
  assert.equal(f.doc.dirty, false);
  assert.equal(f.conflicts.current(f.doc), null);
  assert.deepEqual(f.updates, [f.doc]);
  f.undo();
  assert.equal(f.doc.model.getValue(), 'my edits');
  assert.equal(f.doc.dirty, true);
});

test('a second external edit refreshes the review and cannot be silently accepted', async () => {
  const f = await fixture(), review = await f.conflicts.check(f.doc);
  f.setLatest('newer external edits');
  await assert.rejects(f.conflicts.useLatest(f.doc, review), /file changed again/);
  assert.equal(f.doc.model.getValue(), 'my edits');
  assert.equal(f.doc.savedText, 'original');
  assert.equal(f.conflicts.current(f.doc).text, 'newer external edits');
  assert.equal(f.shown.length, 1);
  assert.throws(() => f.conflicts.expectedText(f.doc, review), /Refresh/);
});

test('edits made while backing up are preserved and failed backups never replace the working copy', async () => {
  const f = await fixture(), review = await f.conflicts.check(f.doc);
  f.api.captureHistory = async () => f.edit('typed while loading');
  await assert.rejects(f.conflicts.useLatest(f.doc, review), /Your edits changed/);
  assert.equal(f.doc.model.getValue(), 'typed while loading');
  assert.equal(f.doc.savedText, 'original');
  f.api.captureHistory = async () => {throw new Error('Backup failed');};
  await assert.rejects(f.conflicts.useLatest(f.doc, review), /Backup failed/);
  assert.equal(f.doc.model.getValue(), 'typed while loading');
});

test('late reads cannot resurrect reviews after Save As, close, model replacement or a successful save', async () => {
  for (const invalidate of [f => f.doc.path = '/new.txt', f => f.close(),
    f => f.doc.model = {...f.doc.model}, f => f.doc.savedText = 'saved elsewhere', f => f.conflicts.clear(f.doc)]) {
    const f = await fixture(); let finish;
    f.api.readFile = () => new Promise(resolve => {finish = resolve;});
    const request = f.conflicts.check(f.doc);
    invalidate(f); finish({content:'external edits'});
    assert.equal(await request, null);
    assert.equal(f.conflicts.current(f.doc), null);
    assert.equal(f.shown.length, 0);
  }
});

test('out-of-order reads never replace a newer comparison', async () => {
  const f = await fixture(), pending = [];
  f.api.readFile = () => new Promise(resolve => pending.push(resolve));
  const old = f.conflicts.check(f.doc), newer = f.conflicts.check(f.doc);
  pending[1]({content:'newest'});
  const review = await newer;
  pending[0]({content:'stale'});
  assert.equal(await old, null);
  assert.equal(f.conflicts.current(f.doc), review);
  assert.equal(review.text, 'newest');
});

test('read errors and files reverting to the saved baseline do not alter unsaved edits', async () => {
  const f = await fixture(); await f.conflicts.check(f.doc);
  f.setLatest('original');
  assert.equal(await f.conflicts.check(f.doc), null);
  assert.equal(f.conflicts.current(f.doc), null);
  f.api.readFile = async () => {throw new Error('Disconnected');};
  await assert.rejects(f.conflicts.check(f.doc), /Disconnected/);
  assert.equal(f.doc.model.getValue(), 'my edits');
  assert.equal(f.doc.savedText, 'original');
});

test('conflict errors survive IPC wrapping without misclassifying connection or permission errors', async () => {
  const {isFileConflict} = await import('../src/file-conflicts.js');
  assert.ok(isFileConflict(new Error("Error invoking remote method 'file:write': Error: File changed on disk. Compare or reload it before saving.")));
  assert.ok(isFileConflict(new Error('File changed on the server. Compare or reload it before saving.')));
  assert.equal(isFileConflict(new Error('Permission denied')), false);
  assert.equal(isFileConflict(new Error('Cannot verify the remote file.')), false);
});

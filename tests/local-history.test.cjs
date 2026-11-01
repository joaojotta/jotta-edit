'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {LocalHistory} = require('../electron/local-history.cjs');

test('history keeps changed saves, empty files and literal text; metadata excludes source', async () => {
  const {appendHistory, historyList} = await import('../shared/local-history.mjs');
  const now = Date.now(); let id = 0;
  let records = appendHistory([], '/a', [{text:'',kind:'before-save'},{text:'é <script>$1',kind:'save'}], now, () => String(++id));
  records = appendHistory(records, '/a', [{text:'é <script>$1'},{text:'é <script>$1'}], now, () => String(++id));
  assert.equal(records.length, 2);
  assert.equal(records[0].text, '');
  const list = historyList(records, '/a');
  assert.equal(list[0].id, '2'); assert.equal(list[0].bytes, Buffer.byteLength('é <script>$1'));
  assert.ok(list.every(record => !Object.hasOwn(record, 'text')));
});
test('retention enforces age, UTF-8 file size, per-file count and shared byte/count limits', async () => {
  const {appendHistory, pruneHistory, HISTORY_LIMITS} = await import('../shared/local-history.mjs');
  const now = Date.now(), limits = {...HISTORY_LIMITS, perFile:2, entries:3, fileBytes:6, totalBytes:10};
  const make = (id, file, text, time = now) => ({id, path:file, text, time});
  const records = [make('old','/a','x',now-31*86400000),make('1','/a','a'),make('2','/a','b'),make('3','/a','c'),make('4','/b','ééé'),make('large','/b','éééé')];
  assert.deepEqual(pruneHistory(records, now, limits).map(r => r.id), ['2','3','4']);
  assert.deepEqual(pruneHistory([...records,make('5','/c','12345')], now, limits).map(r => r.id), ['2','3','5']);
  assert.deepEqual(appendHistory([], '/a', [{text:'éééé'}], now, () => 'id', limits), []);
  assert.deepEqual(pruneHistory([null, {}, {id:'x',path:'/a',text:'x',time:NaN}], now, limits), []);
});
test('history follows directory moves without moving similarly named siblings', async () => {
  const {moveHistory} = await import('../shared/local-history.mjs');
  const records = ['/project/a','/project/a/file','/project/ab/file'].map(path => ({path, id:path}));
  assert.deepEqual(moveHistory(records, '/project/a', '/project/new').map(r => r.path), ['/project/new','/project/new/file','/project/ab/file']);
  assert.equal(records[0].path, '/project/a');
});
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'jotta-history-'));
  t.after(() => fs.rm(directory, {recursive:true,force:true}));
  const file = path.join(directory,'history.json');
  return {directory, file, store:new LocalHistory(file)};
}
test('desktop history survives restart and serializes concurrent writes without lost revisions', async t => {
  const {store, file} = await fixture(t);
  await Promise.all(Array.from({length:20}, (_, i) => store.capture('/project/a', [{text:`version ${i}`}])));
  const reloaded = new LocalHistory(file), list = await reloaded.list('/project/a');
  assert.equal(list.length,20);
  assert.equal((await reloaded.get('/project/a', list[0].id)).text,'version 19');
  await assert.rejects(reloaded.get('/project/b', list[0].id), /no longer available/);
  await store.move('/project', '/renamed');
  assert.equal((await store.list('/project/a')).length, 0);
  assert.equal((await store.list('/renamed/a')).length, 20);
  if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});
test('failed atomic history writes preserve the last valid store and allow later retries', async t => {
  const {store, file} = await fixture(t);
  await store.capture('/a', [{text:'original'}]);
  await fs.mkdir(file+'.tmp');
  await assert.rejects(store.capture('/a', [{text:'failed'}]));
  assert.equal((await store.list('/a')).length,1);
  await fs.rmdir(file+'.tmp');
  await store.capture('/a', [{text:'retry'}]);
  assert.equal((await store.list('/a')).length,2);
});
test('corrupt history is reported and preserved instead of silently replaced', async t => {
  const {store, file} = await fixture(t);
  await fs.writeFile(file, '{broken');
  await assert.rejects(store.capture('/a', [{text:'new'}]));
  assert.equal(await fs.readFile(file,'utf8'),'{broken');
});

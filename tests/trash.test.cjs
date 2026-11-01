'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const {createTrashHandler} = require('../electron/trash.cjs');
async function fixture(t, base = os.tmpdir()) {
  const folder = await fs.mkdtemp(path.join(base, '.jotta-trash-test-'));
  t.after(() => fs.rm(folder, {recursive:true, force:true, maxRetries:10, retryDelay:100}));
  const file = path.join(folder, 'file with spaces.txt');
  await fs.writeFile(file, 'recoverable content');
  return {folder, file};
}
test('Flatpak sends Trash requests to the host desktop with separate arguments', async t => {
  const {file} = await fixture(t);
  let called;
  const trash = createTrashHandler({platform:'linux', flatpakId:'pt.jotta.edit', run:async (command, args) => { called = [command, args]; await fs.rename(file, file + '.trashed'); }});
  await trash(file);
  assert.deepEqual(called, ['flatpak-spawn', ['--host', 'gio', 'trash', '--', file]]);
  assert.equal(await fs.readFile(file + '.trashed', 'utf8'), 'recoverable content');
});
test('failed Linux helper falls back to native Trash and verifies the move', async t => {
  const {file} = await fixture(t);
  let calls = 0;
  const trash = createTrashHandler({platform:'linux', flatpakId:'', run:async () => { calls++; throw new Error('helper unavailable'); }, shell:{trashItem:source => fs.rename(source, source + '.trashed')}});
  await trash(file);
  assert.equal(calls, 4);
  assert.equal(await fs.readFile(file + '.trashed', 'utf8'), 'recoverable content');
});
test('Trash failure or false success leaves original contents intact and rejects', async t => {
  const {file} = await fixture(t);
  const trash = createTrashHandler({platform:'linux', flatpakId:'', run:async () => {}, shell:{trashItem:async () => {}}});
  await assert.rejects(trash(file), /did not remove/);
  assert.equal(await fs.readFile(file, 'utf8'), 'recoverable content');
});
test('Windows uses the native Recycle Bin API', async t => {
  const {file} = await fixture(t);
  const trash = createTrashHandler({platform:'win32', run:async () => assert.fail('No Linux helpers on Windows'), shell:{trashItem:source => fs.rename(source, source + '.recycled')}});
  await trash(file);
  assert.equal(await fs.readFile(file + '.recycled', 'utf8'), 'recoverable content');
});
test('real Linux Trash keeps recoverable file contents and original-path metadata', {skip:process.platform !== 'linux'}, async t => {
  try { await exec('gio', ['version']); }
  catch { t.skip('gio is not installed'); return; }
  const {folder, file} = await fixture(t, path.join(__dirname, '..'));
  // Isolate the integration test from the user's Trash entirely.
  const data = path.join(folder, 'data'); await fs.mkdir(data);
  const trash = createTrashHandler({platform:'linux', flatpakId:'', run:(command, args) => exec(command, args, {env:{...process.env, XDG_DATA_HOME:data}})});
  await trash(file);
  await assert.rejects(fs.stat(file), {code:'ENOENT'});
  const saved = await fs.readdir(path.join(data, 'Trash/files'));
  assert.equal(saved.length, 1);
  assert.equal(await fs.readFile(path.join(data, 'Trash/files', saved[0]), 'utf8'), 'recoverable content');
  const info = await fs.readdir(path.join(data, 'Trash/info'));
  const metadata = await fs.readFile(path.join(data, 'Trash/info', info[0]), 'utf8');
  assert.ok(decodeURIComponent(metadata).includes(file));
});

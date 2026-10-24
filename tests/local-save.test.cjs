'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {writeLocalText} = require('../electron/local-save.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jotta-local-save-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const file = path.join(root, 'file.txt');
  await fs.writeFile(file, 'original');
  return {root, file};
}

test('guarded local saves reject external edits and do not recreate deleted files', async t => {
  const {root, file} = await fixture(t);
  await fs.writeFile(file, 'external');
  await assert.rejects(writeLocalText(file, 'my edits', {expectedText:'original'}), /changed on disk/);
  assert.equal(await fs.readFile(file, 'utf8'), 'external');
  assert.deepEqual(await fs.readdir(root), ['file.txt']);
  await fs.rm(file);
  await assert.rejects(writeLocalText(file, 'my edits', {expectedText:'original'}), {code:'ENOENT'});
  assert.deepEqual(await fs.readdir(root), []);
});

test('a file changing while the new content is staged is preserved and the stage is removed', async t => {
  const {root, file} = await fixture(t);
  const io = {...fs, open:async (...args) => {
    const handle = await fs.open(...args);
    return {writeFile:async (...values) => {await handle.writeFile(...values); await fs.writeFile(file, 'external during save');},
      chmod:mode => handle.chmod(mode), sync:() => handle.sync(), close:() => handle.close()};
  }};
  await assert.rejects(writeLocalText(file, 'my edits', {expectedText:'original', io}), /changed on disk/);
  assert.equal(await fs.readFile(file, 'utf8'), 'external during save');
  assert.deepEqual(await fs.readdir(root), ['file.txt']);
});

test('replacement failures keep the original file and remove temporary content', async t => {
  const {root, file} = await fixture(t);
  await assert.rejects(writeLocalText(file, 'my edits', {expectedText:'original', io:{...fs,
    rename:async () => {throw new Error('File locked');}}}), /File locked/);
  assert.equal(await fs.readFile(file, 'utf8'), 'original');
  assert.deepEqual(await fs.readdir(root), ['file.txt']);
});

test('reviewed saves still reject newer edits and succeed against the latest reviewed baseline', async t => {
  const {file} = await fixture(t);
  const {createFileConflicts} = await import('../src/file-conflicts.js');
  const doc = {path:file, model:{getValue:() => 'merged'}, savedText:'original'};
  const conflicts = createFileConflicts({api:{readFile:async file => ({content:await fs.readFile(file, 'utf8')})},
    isOpen:() => true, present() {}, changed() {}});
  await fs.writeFile(file, 'external');
  const review = await conflicts.check(doc);
  await fs.writeFile(file, 'newer');
  await assert.rejects(writeLocalText(file, 'merged', {expectedText:conflicts.expectedText(doc, review)}), /changed on disk/);
  assert.equal(doc.savedText, 'original');
  const next = await conflicts.check(doc);
  await writeLocalText(file, 'merged', {expectedText:conflicts.expectedText(doc, next)});
  assert.equal(await fs.readFile(file, 'utf8'), 'merged');
});

test('guarded saves follow symbolic links and preserve the target permissions', {skip:process.platform === 'win32'}, async t => {
  const {root, file} = await fixture(t), link = path.join(root, 'link.txt');
  await fs.chmod(file, 0o664); await fs.symlink(file, link);
  await writeLocalText(link, 'resolved', {expectedText:'original'});
  assert.equal((await fs.lstat(link)).isSymbolicLink(), true);
  assert.equal(await fs.readFile(file, 'utf8'), 'resolved');
  assert.equal((await fs.stat(file)).mode & 0o777, 0o664);
});

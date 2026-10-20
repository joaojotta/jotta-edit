'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { renameEntry, moveEntry, deleteEntry, safeName } = require('../electron/file-operations.cjs');

async function workspace(callback) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'jotta-rc2-'));
  try {
    const root = path.join(tmp,'project'); await fs.mkdir(root);
    await callback(root, tmp);
  } finally { await fs.rm(tmp,{recursive:true,force:true,maxRetries:10,retryDelay:100}); }
}
test('RC2 renames files and directories permanently without losing their contents', async () => {
  await workspace(async root => {
    await fs.writeFile(path.join(root,'a.txt'),'hello');
    const renamed = await renameEntry(root,path.join(root,'a.txt'),'b.txt');
    assert.equal(await fs.readFile(renamed.path,'utf8'),'hello');
    await assert.rejects(fs.stat(path.join(root,'a.txt')), {code:'ENOENT'});
    await fs.mkdir(path.join(root,'images'));
    await fs.writeFile(path.join(root,'images','icon.svg'),'content');
    await renameEntry(root,path.join(root,'images'),'assets');
    assert.equal(await fs.readFile(path.join(root,'assets','icon.svg'),'utf8'),'content');
  });
});
test('RC2 drag moves entries into folders but not into themselves or existing targets', async () => {
  await workspace(async root => {
    const first = path.join(root,'first'), second = path.join(root,'second');
    await fs.mkdir(first); await fs.mkdir(second);
    await fs.writeFile(path.join(first,'a.txt'),'hello');
    const result = await moveEntry(root,path.join(first,'a.txt'),second);
    assert.equal(await fs.readFile(result.path,'utf8'),'hello');
    await fs.writeFile(path.join(first,'a.txt'),'conflict');
    await assert.rejects(moveEntry(root,path.join(first,'a.txt'),second), /already exists/);
    assert.equal(await fs.readFile(result.path,'utf8'),'hello');
    await fs.mkdir(path.join(first,'nested'));
    await assert.rejects(moveEntry(root,first,path.join(first,'nested')), /into itself/);
  });
});
test('Explorer moves entries to Trash, preserves contents and leaves files intact on Trash failure', async () => {
  await workspace(async (root,tmp) => {
    const outside = path.join(tmp,'private.txt'); await fs.writeFile(outside,'secret');
    await assert.rejects(deleteEntry(root,root), /Cannot modify/);
    await assert.rejects(deleteEntry(root,outside), /outside path/);
    await fs.mkdir(path.join(root,'nested')); await fs.writeFile(path.join(root,'nested','data.txt'),'text');
    const trash = path.join(tmp, 'trash');
    await deleteEntry(root,path.join(root,'nested'), target => fs.rename(target, trash));
    assert.equal(await fs.readFile(path.join(trash,'data.txt'),'utf8'), 'text');
    await fs.writeFile(path.join(root, 'keep.txt'), 'keep');
    await assert.rejects(deleteEntry(root, path.join(root, 'keep.txt'), async () => { throw new Error('Trash unavailable'); }), /Trash unavailable/);
    assert.equal(await fs.readFile(path.join(root, 'keep.txt'), 'utf8'), 'keep');
    await assert.rejects(fs.stat(path.join(root,'nested')), {code:'ENOENT'});
    assert.equal(await fs.readFile(outside,'utf8'),'secret');
  });
});
test('RC2 rejects invalid names and symlinks', async () => {
  for (const name of ['','../escape','a/b','a\\b','CON','.','..','bad?.txt','trailing.']) {
    assert.throws(() => safeName(name));
  }
  await workspace(async (root,tmp) => {
    const outside = path.join(tmp,'outside'); await fs.mkdir(outside);
    const link = path.join(root,'linked');
    try { await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') return; throw error; }
    await assert.rejects(deleteEntry(root,link));
    await assert.rejects(moveEntry(root,link,root));
  });
});
test('RC2 JSX is wired for colour sliders, dragging, unsaved highlighting and themed context actions', async () => {
  const source = await fs.readFile(path.join(__dirname,'../src/main.js'),'utf8');
  const mixer = await fs.readFile(path.join(__dirname,'../src/color-picker.js'),'utf8');
  const html = await fs.readFile(path.join(__dirname,'../index.html'),'utf8');
  assert.match(mixer, /data-slider="s"/);
  assert.match(mixer, /data-slider="l"/);
  assert.match(mixer, /header\.setPointerCapture/);
  assert.match(mixer, /model\.uri\.scheme !== 'inmemory'/);
  assert.match(source, /detectLanguage\(doc\.model\.getValue\(\)\)/);
  assert.match(source, /row\.addEventListener\('contextmenu'/);
  assert.match(source, /row\.addEventListener\('dragstart'/);
  assert.match(source, /api\.deleteEntry\(state\.root/);
  assert.match(html, /id="explorer-action-overlay"/);
});

test('Explorer creates empty files and folders in the root or a nested folder', async () => {
  const {createEntry} = require('../electron/file-operations.cjs');
  await workspace(async root => {
    const folder = await createEntry(root, root, 'assets', 'folder');
    assert.equal(folder.dir, true);
    assert.equal((await fs.stat(folder.path)).isDirectory(), true);
    const file = await createEntry(root, folder.path, 'style.css', 'file');
    assert.equal(file.dir, false);
    assert.equal(await fs.readFile(file.path, 'utf8'), '');
    await fs.writeFile(file.path, 'keep this content');
    await assert.rejects(createEntry(root, folder.path, 'style.css', 'file'), /already exists/);
    assert.equal(await fs.readFile(file.path, 'utf8'), 'keep this content');
    await assert.rejects(createEntry(root, root, 'assets', 'folder'), /already exists/);
    await assert.rejects(createEntry(root, root, 'assets', 'file'), /already exists/);
    await assert.rejects(createEntry(root, folder.path, 'style.css', 'folder'), /already exists/);
  });
});
test('Explorer creation rejects invalid names, outside folders and symlink destinations', async () => {
  const {createEntry} = require('../electron/file-operations.cjs');
  await workspace(async (root, tmp) => {
    await assert.rejects(createEntry(root, tmp, 'outside.txt', 'file'), /outside/);
    await assert.rejects(createEntry(root, root, '../escape', 'file'), /Invalid/);
    await assert.rejects(createEntry(root, root, 'CON', 'file'), /Invalid/);
    await assert.rejects(createEntry(root, root, 'invalid', 'other'), /Invalid/);
    const file = await createEntry(root, root, 'plain.txt', 'file');
    await assert.rejects(createEntry(root, file.path, 'child.txt', 'file'), /folder/);
    const link = path.join(root, 'link');
    try { await fs.symlink(tmp, link, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') return; throw error; }
    await assert.rejects(createEntry(root, link, 'escape.txt', 'file'));
    await assert.rejects(fs.stat(path.join(tmp, 'escape.txt')), {code:'ENOENT'});
  });
});

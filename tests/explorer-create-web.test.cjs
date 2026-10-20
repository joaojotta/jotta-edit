'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

test('browser workspace preserves empty folders and supports creating, moving and deleting their contents', async () => {
  // Run the actual adapter with an in-memory storage boundary, without a DOM.
  const memory = `
    const records = new Map();
    let history = [], rejectHistory = false;
    export function failHistory(value) { rejectHistory = value; }
    export async function updateHistory(operation) { if (rejectHistory) throw new Error('Quota exceeded'); history = operation(history); }
    export async function getMeta(key) { return key === 'local-history' ? history : key === 'workspace-root' ? '/workspace/project' : key === 'workspace-mode' ? 'virtual' : null; }
    export async function putMeta() {}
    export async function putWorkspaceContext() {}
    export async function getFile(path) { return records.get(path); }
    export async function putFile(record) { records.set(record.path, record); }
    export async function addFile(record) { if (records.has(record.path)) throw new Error('Destination already exists'); records.set(record.path, record); }
    export async function allFiles() { return [...records.values()]; }
    export async function mutateFiles(removals, additions) { for (const key of removals) records.delete(key); for (const item of additions) records.set(item.path, item); }
  `;
  const storageUrl = 'data:text/javascript;base64,' + Buffer.from(memory).toString('base64');
  const zipUrl = pathToFileURL(path.join(__dirname, '../web/zip.js')).href;
  const source = (await fs.readFile(path.join(__dirname, '../web/browser-api.js'), 'utf8'))
    .replace("'../shared/local-history.mjs'", JSON.stringify(pathToFileURL(path.join(__dirname, '../shared/local-history.mjs')).href))
    .replace("'./storage.js'", JSON.stringify(storageUrl)).replace("'./github-workspace.js'",JSON.stringify(pathToFileURL(path.join(__dirname,'../web/github-workspace.js')).href))
    .replace("'./zip.js'", JSON.stringify(zipUrl));
  const {browserApi:api} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const root = '/workspace/project';
  await api.createEntry(root, root, 'assets', 'folder');
  let tree = await api.scanFolder(root);
  assert.equal(tree.nodes[0].dir, true);
  assert.deepEqual(tree.nodes[0].children, []);
  await api.createEntry(root, root + '/assets', 'style.css', 'file');
  assert.equal((await api.readFile(root + '/assets/style.css')).content, '');
  await api.saveFile(root + '/assets/style.css', 'preserve');
  await assert.rejects(api.createEntry(root, root + '/assets', 'style.css', 'file'), /already exists/);
  assert.equal((await api.readFile(root + '/assets/style.css')).content, 'preserve');
  await assert.rejects(api.createEntry(root, root, 'assets', 'file'), /already exists/);
  await assert.rejects(api.createEntry(root, '/workspace/other', 'bad.txt', 'file'), /outside/);
  await assert.rejects(api.createEntry(root, root + '/assets/style.css', 'bad.txt', 'file'), /folder/);
  await assert.rejects(api.createEntry(root, root, '../escape', 'file'), /Invalid/);
  await api.renameEntry(root, root + '/assets', 'styles');
  tree = await api.scanFolder(root);
  assert.equal(tree.nodes[0].name, 'styles');
  assert.equal(tree.nodes[0].children[0].name, 'style.css');
  const versions = await api.listHistory(root + '/styles/style.css');
  assert.equal(versions.length, 2);
  assert.equal((await api.getHistory(root + '/styles/style.css', versions[0].id)).text, 'preserve');
  assert.equal((await api.listHistory(root + '/assets/style.css')).length, 0);
  const storage = await import(storageUrl);
  storage.failHistory(true);
  const saved = await api.saveFile(root + '/quota.txt', 'saved despite history failure');
  assert.match(saved.historyWarning, /could not be updated/);
  assert.equal((await api.readFile(root + '/quota.txt')).content, 'saved despite history failure');
  storage.failHistory(false);
  await api.deleteEntry(root, root + '/quota.txt');
  const removed = await api.deleteEntry(root, root + '/styles/style.css');
  assert.equal((await api.readFile(removed.trashPath)).content, 'preserve');
  tree = await api.scanFolder(root);
  assert.equal(tree.nodes[0].dir, true);
  assert.deepEqual(tree.nodes[0].children, []);
  await api.deleteEntry(root, root + '/styles');
  assert.deepEqual((await api.scanFolder(root)).nodes, []);
  await api.createEntry(root, root, 'restore.json', 'file');
  await api.saveFile(root + '/restore.json', 'original metadata filename');
  const collision = await api.deleteEntry(root, root + '/restore.json');
  assert.equal((await api.readFile(collision.trashPath)).content, 'original metadata filename');
  const metadataPath = collision.trashPath.replace('/entry/restore.json', '/restore.json');
  assert.equal(JSON.parse((await api.readFile(metadataPath)).content).originalPath, root + '/restore.json');
});

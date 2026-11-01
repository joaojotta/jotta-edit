'use strict';
// All mutations stay within the Explorer root after resolving parent folders.
// Source links, existing destinations and the workspace root cannot be modified.
const fs = require('./project-fs.cjs');
const path = require('node:path');
const { constants } = require('node:fs');

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
function safeName(name) {
  if (typeof name !== 'string' || !name || name.trim() !== name || name === '.' || name === '..' ||
    /[\\/\x00-\x1f<>:"|?*]/.test(name) || /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Invalid file or folder name');
  return name;
}
async function scope(root, source) {
  if (typeof root !== 'string' || typeof source !== 'string' || !path.isAbsolute(root) || !path.isAbsolute(source)) throw new Error('Absolute paths required');
  const realRoot = await fs.realpath(root);
  const realSource = await fs.realpath(source);
  if (!within(realRoot, realSource) || realSource === realRoot) throw new Error('Cannot modify the Explorer root or an outside path');
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink() || !(stat.isDirectory() || stat.isFile())) throw new Error('Unsupported file type');
  return { realRoot, realSource, stat };
}
async function destinationFor(realRoot, parent, name) {
  safeName(name);
  const realParent = await fs.realpath(parent);
  if (!within(realRoot, realParent)) throw new Error('Destination is outside Explorer');
  const parentStat = await fs.stat(parent);
  if (!parentStat.isDirectory()) throw new Error('Destination must be a folder');
  const target = path.join(realParent, name);
  if (!within(realRoot, target)) throw new Error('Destination is outside Explorer');
  try { await fs.lstat(target); throw new Error('Destination already exists'); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
  return target;
}
async function createEntry(root, folder, name, kind) {
  if (typeof root !== 'string' || typeof folder !== 'string' || !path.isAbsolute(root) || !path.isAbsolute(folder)) throw new Error('Absolute paths required');
  if (!['file', 'folder'].includes(kind)) throw new Error('Invalid entry type');
  const realRoot = await fs.realpath(root);
  const target = await destinationFor(realRoot, folder, name);
  if (kind === 'folder') await fs.mkdir(target);
  else { const handle = await fs.open(target, 'wx'); await handle.close(); }
  return {path:target, name, dir:kind === 'folder'};
}
async function renameEntry(root, source, name) {
  const {realRoot, realSource} = await scope(root, source);
  safeName(name);
  if (path.basename(realSource) === name) return {oldPath:source, path:source};
  const target = await destinationFor(realRoot, path.dirname(realSource), name);
  await fs.rename(realSource, target);
  return {oldPath: source, path: target};
}
async function moveEntry(root, source, destinationFolder) {
  const {realRoot, realSource, stat} = await scope(root, source);
  if (typeof destinationFolder !== 'string' || !path.isAbsolute(destinationFolder)) throw new Error('Absolute folder path required');
  const realFolder = await fs.realpath(destinationFolder);
  if (path.dirname(realSource) === realFolder) return {oldPath:source, path:source};
  const target = await destinationFor(realRoot, destinationFolder, path.basename(realSource));
  if (stat.isDirectory() && within(realSource, target)) throw new Error('Cannot move a folder into itself');
  if (path.dirname(realSource) === path.dirname(target)) return {oldPath:source, path:source};
  await fs.rename(realSource, target); // preserve contents/permissions; cross-volume moves fail safely
  return {oldPath:source, path:target};
}
async function deleteEntry(root, source, trashItem) {
  const {realSource} = await scope(root, source);
  if (typeof trashItem !== 'function') throw new Error('System Trash is unavailable');
  await trashItem(realSource);
  return {path:source};
}
module.exports = {createEntry, renameEntry, moveEntry, deleteEntry, within, safeName};

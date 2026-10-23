'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { listPathCandidates } = require('../electron/path-completion.cjs');
const get = async () => import('../src/path-completion.js');
test('local URL and path contexts work in HTML/CSS/JS/PHP; external URLs ignored', async () => {
  const { pathContext } = await get();
  for (const [line, lang, expected] of [
    ['<img src="assets/icons/lo', 'html', 'assets/icons/lo'],
    ['.hero { background: url(./images/ico', 'css', './images/ico'],
    ["import thing from './src/hel", 'javascript', './src/hel'],
    ["require '../vendor/f", 'php', '../vendor/f'],
    ['<link href="https://example.com/css', 'html', null],
    ['<img src="data:image/png', 'html', null]
  ]) {
    assert.equal(pathContext(line, line.length + 1, lang)?.typed || null, expected);
  }
  const ctx = pathContext('<img src="assets/icons/lo', 26, 'html');
  assert.equal(ctx?.segment, 'lo');
  assert.equal(ctx?.startColumn, 24);
});
test('relative nested filesystem completion includes folders, excludes symlinks and stays within project', async () => {
  const { filterPathItems } = await get();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jotta-path-'));
  try {
    const root = path.join(tmp, 'project');
    const file = path.join(root, 'site', 'index.html');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.mkdirSync(path.join(root, 'site', 'assets', 'icons'), {recursive: true});
    fs.writeFileSync(file, '');
    fs.writeFileSync(path.join(root, 'site', 'assets', 'icons', 'logo.svg'), '');
    fs.writeFileSync(path.join(root, 'site', 'assets', 'icons', 'lock.png'), '');
    const icons = await listPathCandidates({root, file, typed:'assets/icons/lo'});
    assert.deepEqual(filterPathItems(icons, 'lo').map(x => x.label).sort(), ['lock.png','logo.svg']);
    const folders = await listPathCandidates({root, file, typed:'assets/i'});
    assert.deepEqual(filterPathItems(folders,'i').map(x => x.insertText), ['icons/']);
    assert.deepEqual(await listPathCandidates({root,file,typed:'../../'}), []);
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'private.txt'), '');
    fs.symlinkSync(outside, path.join(root, 'site', 'external'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.deepEqual(await listPathCandidates({root,file,typed:'external/'}), []);
    assert.deepEqual(await listPathCandidates({root,file,typed:'https://example.com'}), []);
  } finally { fs.rmSync(tmp, {force:true, recursive:true}); }
});
test('Windows portable EXE metadata and font discovery are wired', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.version, '1.1.3');
  assert.equal(pkg.build.win.target[0], 'portable');
  assert.equal(pkg.build.win.icon, 'assets/icon.ico');
  assert.ok(fs.statSync(path.join(__dirname,'../assets/icon.ico')).size > 1000);
  const electron = fs.readFileSync(path.join(__dirname,'../electron/main.cjs'), 'utf8');
  assert.match(electron, /HKCU.*SOFTWARE/);
  assert.match(electron, /paths:complete/);
  const main = fs.readFileSync(path.join(__dirname,'../src/main.js'), 'utf8');
  assert.match(main, /addExtraSpaceOnTop: false/);
  assert.match(main, /setupPathCompletion/);
});

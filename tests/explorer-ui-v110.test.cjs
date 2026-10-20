'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const pkg = require('../package.json');

test('release references and About version match package metadata', () => {
  assert.equal(pkg.version, '1.1.0');
  assert.match(read('index.html'), /Version 1\.1\.0/);
  assert.equal(pkg.build.flatpak.artifactName, 'Jotta-Edit-${version}-linux-${arch}.flatpak');
  assert.equal(pkg.build.win.artifactName, 'Jotta-Edit-${version}-Windows-${arch}-Portable.${ext}');
  assert.match(read('scripts/install-flatpak.sh'), /Jotta-Edit-\$\{version\}-linux-x64\.flatpak/);
  assert.match(read('scripts/build-windows.ps1'), /Jotta-Edit-\$Version-Windows-x64-Portable\.exe/);
});

test('all explorer SVG file icons exist and use SVG markup', () => {
  const js = read('src/main.js');
  const html = read('index.html');
  const references = new Set([...js.matchAll(/['"](\/(?:file-icons|ui-icons)\/[^'"]+?\.svg)['"]/g), ...html.matchAll(/['"](\/(?:file-icons|ui-icons)\/[^'"]+?\.svg)['"]/g)].map(match => match[1]));
  assert.ok(references.size >= 12, 'expected supplied and generated icon references');
  for (const url of references) {
    const source = read(`public${url}`);
    assert.match(source, /<svg\b/);
    assert.match(source, /<\/svg>/);
  }
});

test('show hidden files is persisted and passed to the native folder scanner', () => {
  const renderer = read('src/main.js');
  const preload = read('electron/preload.cjs');
  const native = read('electron/main.cjs');
  const html = read('index.html');
  assert.match(html, /id="setting-hidden-files"/);
  assert.match(renderer, /showHidden: stored\('showHidden'/);
  assert.match(renderer, /remember\('showHidden', state\.showHidden\)/);
  assert.match(renderer, /scanFolder\(state\.root, \{ showHidden: state\.showHidden \}\)/);
  assert.match(preload, /scanFolder: \(folder, options\)/);
  assert.match(native, /options\.showHidden === true/);
  assert.match(renderer, /Show Hidden Files/);
});

test('custom menus respect shared dark and light theme variables', () => {
  const css = read('src/style.css');
  const js = read('src/main.js');
  assert.match(css, /\.menu-panel[^\n]*background: var\(--surface\)/);
  assert.match(js, /function openCustomMenu\(/);
  assert.match(js, /function setTheme\(/);
  assert.match(js, /document\.documentElement\.dataset\.theme = state\.theme/);
});

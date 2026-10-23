"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const pkg = require('../package.json');

test('final version, About and build artifact names are consistent', () => {
  assert.equal(pkg.version, '1.1.4');
  assert.match(read('index.html'), /Version 1\.1\.4/);
  assert.match(read('VERSION_HISTORY.md'), /1\.1\.0 — Remote folders/);
  assert.match(read('package.json'), /Jotta-Edit-\$\{version\}-linux-\$\{arch\}\.flatpak/);
  assert.match(read('scripts/build-flatpak.sh'), /node -p.*package\.json/);
  assert.match(read('scripts/build-windows.ps1'), /Jotta-Edit-\$Version-Windows-x64-Portable\.exe/);
});

test('Explorer icon filtering and zoom are scoped to sidebar', () => {
  const js = read('src/main.js');
  const css = read('src/style.css');
  assert.match(js, /explorerFontSize: boundedExplorerSize\(stored\('explorerFontSize'/);
  assert.match(js, /function setupExplorerZoom\(\)/);
  assert.match(js, /sidebar\.addEventListener\('wheel'/);
  assert.match(js, /explorerZoomTarget\(event\) \? adjustExplorerFont\(1\) : adjustFont\(1\)/);
  assert.match(js, /explorerZoomTarget\(event\) \? adjustExplorerFont\(-1\) : adjustFont\(-1\)/);
  assert.match(js, /remember\('explorerFontSize', state\.explorerFontSize\)/);
  assert.match(css, /:root\[data-theme="dark"\] \.sidebar img\[src\^="\/file-icons\/"\]/);
  assert.match(css, /:root\[data-theme="light"\] \.sidebar img\[src\^="\/file-icons\/"\]/);
  assert.match(css, /\.sidebar \.file-row \.file-symbol img/);
});

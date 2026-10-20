'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('custom Jotta Edit icon is bundled for Flatpak and frontend', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.build.linux.icon, 'assets/icons');
  assert.equal(pkg.desktopName, 'pt.jotta.edit.desktop');
  assert.equal(Object.hasOwn(pkg.build.linux, 'syncDesktopName'), false);
  for (const location of ['assets/icon.png', 'public/icon.png']) {
    const image = fs.readFileSync(path.join(root, location));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(image.readUInt32BE(16) >= 256);
    assert.equal(image.readUInt32BE(16), image.readUInt32BE(20));
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /class="logo" src="\/icon.png"/);
  assert.match(html, /class="welcome-mark" src="\/icon.png"/);
  assert.match(html, /rel="icon"[^>]*href="\/icon.png"/);
});

test('npm 12 approves esbuild postinstall as required by Vite', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.allowScripts['esbuild@0.27.7'], true);
});

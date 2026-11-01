'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { verifyWebBuild } = require('../scripts/verify-web-build.cjs');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('web publishing requires compiled CSS/JS and fails on unbuilt source HTML', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jotta-web-deploy-'));
  try {
    assert.throws(() => verifyWebBuild(directory), /Missing compiled index\.html/);
    fs.writeFileSync(path.join(directory, 'index.html'), read('web/index.html'));
    assert.throws(() => verifyWebBuild(directory), /source entrypoints|No compiled CSS link/);
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><link rel="stylesheet" href="./assets/site.css"><script type="module" src="./assets/site.js"></script>');
    fs.writeFileSync(path.join(directory, 'assets/site.css'), '.sidebar{color:inherit}.jotta-web{display:flex}');
    fs.writeFileSync(path.join(directory, 'assets/site.js'), 'console.log("compiled")');
    for (const file of ['icon.png', 'manifest.webmanifest', 'sw.js']) fs.writeFileSync(path.join(directory, file), 'asset');
    assert.deepEqual(verifyWebBuild(directory), {stylesheets:1, modules:1});
    fs.unlinkSync(path.join(directory, 'assets/site.css'));
    assert.throws(() => verifyWebBuild(directory), /Missing generated CSS/);
  } finally { fs.rmSync(directory, {recursive:true, force:true}); }
});

test('web assets remain relative and source versus deploy archives are clearly separated', () => {
  const html = read('web/index.html');
  const entry = read('src/web-entry.js');
  for (const css of ['style.css', 'color-picker.css', 'font-menu.css', 'editor.main.css', 'web.css']) {
    assert.ok(entry.includes(css), `${css} must be imported in the initial web bundle`);
  }
  assert.doesNotMatch(html, /(?:href|src)="\/(?:icon\.png|file-icons\/|refresh\.svg)/);
  assert.match(read('src/main.js'), /function interfaceAssetUrl\(path\)/);
  assert.match(read('src/main.js'), /interfaceAssetUrl\(path\)/);
  assert.match(read('scripts/build-web.sh'), /-DEPLOY\.zip/);
  assert.match(read('package.json'), /verify-web-build\.cjs/);
  assert.match(read('docs/web-app.md'), /Do not upload the project source ZIP or `web\/` directly/);
});

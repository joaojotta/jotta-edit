'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');

test('startup guard identifies missing UI element and otherwise returns DOM element', async () => {
  const { requiredElement } = await import('../src/dom-guards.js');
  const present = { addEventListener() {} };
  assert.equal(requiredElement({ getElementById: id => id === 'ok' ? present : null }, 'ok'), present);
  assert.throws(() => requiredElement({ getElementById: () => null }, 'missing'), /missing #missing/);
});

test('editor wheel listener falls back to editor host if Monaco DOM node is null', async () => {
  const { editorInputTarget } = await import('../src/dom-guards.js');
  const host = { addEventListener(type, listener) { assert.equal(type,'wheel'); assert.equal(typeof listener,'function'); } };
  assert.equal(editorInputTarget({ getDomNode: () => null }, host), host);
  assert.equal(editorInputTarget(null, host), host);
  const real = { addEventListener() {} };
  assert.equal(editorInputTarget({ getDomNode: () => real }, host), real);
  editorInputTarget({ getDomNode: () => null }, host).addEventListener('wheel',()=>{});
});

test('all statically-referenced UI element IDs exist in the packaged HTML', () => {
  const main = read('src/main.js');
  const html = read('index.html');
  const named = [...main.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]);
  const lists = ['settings-close','settings-done','about-close','about-done','settings-overlay','about-overlay'];
  for (const id of new Set([...named,...lists])) {
    assert.ok(html.includes(`id="${id}"`), `Missing ${id} in index.html`);
  }
  assert.match(main, /editorInputTarget\(editor, host\)/);
  assert.doesNotMatch(main, /editor\.getDomNode\(\)\.addEventListener/);
});

test('launcher still provides X11 socket and does not add broad D-Bus permissions', () => {
 const pkg = JSON.parse(read('package.json'));
 assert.equal(pkg.version, '1.1.6');
 assert.ok(pkg.build.flatpak.finishArgs.includes('--socket=x11'));
 assert.ok(!pkg.build.flatpak.finishArgs.includes('--socket=system-bus'));
});

test('renderer startup errors are forwarded to the terminal', () => {
 const electronMain = read('electron/main.cjs');
 assert.match(electronMain, /webContents\.on\('console-message'/);
 assert.match(electronMain, /\[Jotta Edit renderer\]/);
 assert.match(read('src/main.js'), /console\.error\('Jotta Edit startup failed:'/);
});

"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const pkg = require('../package.json');
test('final release About text, localisation and package metadata', () => {
  assert.equal(pkg.version, '1.1.4');
  assert.equal(pkg.author, 'João Jotta');
  const html = read('index.html');
  assert.match(html, /Version 1\.1\.4/);
  assert.match(html, /Developed by João Jotta/);
  assert.doesNotMatch(html, /Application ID:|Domain namespace:/);
  assert.match(read('src/i18n.js'), /'Developed by João Jotta':'Desenvolvido por João Jotta'/);
});
test('all platform branding images match the primary logo', () => {
  const png=fs.readFileSync(path.join(root, 'assets/icon.png'));
  assert.deepEqual(png, fs.readFileSync(path.join(root, 'public/icon.png')));
  const ico=fs.readFileSync(path.join(root, 'assets/icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  for (const size of [16,24,32,48,64,128,256,512]) {
    const data=fs.readFileSync(path.join(root, `assets/icons/${size}x${size}.png`));
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
});

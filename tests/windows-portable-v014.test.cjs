"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('portable Windows target produces a single EXE, not an NSIS installer', () => {
  assert.equal(pkg.version, '1.1.3');
  assert.deepEqual(pkg.build.win.target, ['portable']);
  assert.equal(pkg.build.win.icon, 'assets/icon.ico');
  assert.equal(pkg.build.win.artifactName, 'Jotta-Edit-${version}-Windows-${arch}-Portable.${ext}');
  assert.ok(!('nsis' in pkg.build));
  assert.match(pkg.scripts['dist:windows'], /--win portable --x64/);
  assert.doesNotMatch(pkg.scripts['dist:windows'], /nsis/);
});

test('Windows build script checks portable output rather than installer output', () => {
  const script = read('scripts/build-windows.ps1');
  assert.match(script, /Jotta-Edit-\$Version-Windows-x64-Portable\.exe/);
  assert.match(script, /Test-Path \$Artifact/);
  assert.match(script, /npm\.cmd.*'run','dist:windows'/);
  assert.doesNotMatch(script, /Windows-x64-Setup/);
});

test('portable build docs describe no-install launch', () => {
  assert.match(read('README.md'), /No installation required|no installation is necessary/i);
  assert.match(read('docs/windows-build-review.md'), /No installation required/i);
});

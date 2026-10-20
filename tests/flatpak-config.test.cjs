'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

test('Flatpak target and runtime are configured', () => {
  assert.deepEqual(pkg.build.linux.target, ['flatpak']);
  assert.equal(pkg.build.flatpak.runtimeVersion, '25.08');
  assert.equal(pkg.build.flatpak.baseVersion, '25.08');
  assert.ok(pkg.build.flatpak.finishArgs.includes('--filesystem=home'));
  assert.ok(pkg.build.flatpak.finishArgs.includes('--talk-name=org.freedesktop.Flatpak'));
  assert.equal(pkg.dependencies['monaco-editor'], '0.55.1');
  assert.equal(pkg.devDependencies.vite, '7.3.5');
  const script = fs.readFileSync(path.resolve(__dirname, '../scripts/build-flatpak.sh'), 'utf8');
  assert.match(script, /dist:flatpak/);
  assert.doesNotMatch(script, /--linux AppImage/);
});

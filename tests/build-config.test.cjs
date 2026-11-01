'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const { validateBuildConfiguration } = require('../scripts/validate-build-config.cjs');
test('electron-builder 26 configuration excludes unsupported Linux options', () => {
  assert.deepEqual(validateBuildConfiguration(pkg.build), []);
  assert.equal(Object.hasOwn(pkg.build.linux, 'syncDesktopName'), false);
  assert.equal(pkg.desktopName, 'pt.jotta.edit.desktop');
  assert.deepEqual(validateBuildConfiguration({ ...pkg.build, linux: { ...pkg.build.linux, syncDesktopName: true }}),
    ['Unsupported electron-builder 26.0.12 linux option: syncDesktopName']);
});

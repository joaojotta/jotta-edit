'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const pkg = require('../package.json');
const root = path.resolve(__dirname, '..');
const source = 'assets/linux/pt.jotta.edit.metainfo.xml';

test('Flatpak ships Discover metadata matching the application identity and licence', () => {
  const xml = fs.readFileSync(path.join(root, source), 'utf8');
  assert.ok(xml.includes(`<id>${pkg.build.appId}</id>`));
  assert.ok(xml.includes(`<name>${pkg.productName}</name>`));
  assert.ok(xml.includes(`<name>${pkg.author}</name>`));
  assert.ok(xml.includes(`<project_license>${pkg.license}</project_license>`));
  assert.ok(xml.includes(`<launchable type="desktop-id">${pkg.desktopName}</launchable>`));
  assert.ok(xml.includes(`<release version="${pkg.version}"`));
  assert.ok(pkg.build.flatpak.files.some(([from, to]) => from === source && to === `/share/metainfo/${pkg.build.appId}.metainfo.xml`));
  const license = pkg.build.flatpak.files.find(([from]) => from === 'LICENSE');
  assert.equal(license?.[1], `/share/licenses/${pkg.build.appId}/LICENSE`);
});

test('AppStream validates the Discover metadata', t => {
  const result = spawnSync('appstreamcli', ['validate', '--no-net', path.join(root, source)], {encoding:'utf8'});
  if (result.error?.code === 'ENOENT') { t.skip('appstreamcli is not installed'); return; }
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

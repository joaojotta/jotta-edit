'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pkg = require('../package.json');
const lock = require('../package-lock.json');
const {generateLicenseNotices} = require('../scripts/generate-license-notices.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('application GPLv2-or-later declarations agree across packages, About dialogs and Discover', () => {
  assert.equal(pkg.license, 'GPL-2.0-or-later');
  assert.equal(lock.packages[''].license, pkg.license);
  assert.match(read('LICENSE'), /either version 2 of the License, or \(at your\noption\) any later version/);
  assert.match(read('LICENSE'), /GNU GENERAL PUBLIC LICENSE/);
  for (const file of ['index.html', 'web/index.html']) {
    assert.match(read(file), /GNU General Public License, version 2 or later/);
    assert.doesNotMatch(read(file), /MIT License\./);
  }
  assert.match(read('assets/linux/pt.jotta.edit.metainfo.xml'), /<metadata_license>CC0-1.0<\/metadata_license>/);
  assert.match(read('assets/linux/pt.jotta.edit.metainfo.xml'), /<project_license>GPL-2.0-or-later<\/project_license>/);
});

test('frontend licence assets preserve upstream notices verbatim', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'jotta-licences-'));
  t.after(() => fs.rmSync(output, {recursive:true, force:true}));
  assert.ok(generateLicenseNotices(output) >= Object.keys(pkg.dependencies).length);
  assert.equal(fs.readFileSync(path.join(output, 'LICENSE.txt'), 'utf8'), read('LICENSE'));
  const notices = fs.readFileSync(path.join(output, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
  for (const file of ['monaco-editor/LICENSE', 'monaco-editor/ThirdPartyNotices.txt', 'emmet/LICENSE', '@emmetio/scanner/LICENSE', 'prettier/LICENSE', 'prettier/THIRD-PARTY-NOTICES.md', '@prettier/plugin-php/LICENSE', '@fontsource/rubik/LICENSE']) {
    assert.ok(notices.includes(read('node_modules/' + file)), `must retain ${file}`);
  }
});

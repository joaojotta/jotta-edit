'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const source = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Release candidate Flatpak identity, app data and desktop integration', () => {
  assert.equal(pkg.name, 'jotta-edit');
  assert.equal(pkg.version, '1.1.4');
  assert.equal(pkg.build.appId, 'pt.jotta.edit');
  assert.equal(pkg.desktopName, 'pt.jotta.edit.desktop');
  assert.equal(pkg.build.linux.executableName, 'jotta-edit');
  assert.equal(Object.hasOwn(pkg.build.linux, 'syncDesktopName'), false);
  assert.ok(pkg.build.files.includes('assets/icon.png'));
  assert.match(pkg.build.flatpak.artifactName, /^Jotta-Edit-/);
  const iconDir = path.join(root, 'assets/icons');
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
    const data = fs.readFileSync(path.join(iconDir, `${size}x${size}.png`));
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
  }
});

test('native menubar and custom menubar share all seven menus', () => {
  const main = source('electron/main.cjs');
  const html = source('index.html');
  for (const label of ['File','Edit','Selection','View','Go','Tools','Help']) {
    assert.ok(main.includes(`label: '${label}'`));
    assert.ok(html.includes(`data-menu="${label}"`));
  }
  assert.match(main, /frame: preferences\.nativeFrame/);
  assert.match(main, /Menu\.setApplicationMenu/);
  assert.match(main, /menu:popup/);
});

test('preferences update and persist typography, indentation, and frame', () => {
  const code = source('src/main.js');
  const html = source('index.html');
  for (const id of ['setting-font','setting-size','setting-leading','setting-indent','setting-tab-size','setting-frame','setting-format-save']) assert.ok(html.includes(`id="${id}"`));
  assert.match(code, /function applyTypography\(\)/);
  assert.match(code, /lineHeight:?.*lineHeight/);
  assert.match(code, /function applyIndentation\(\)/);
  assert.match(code, /insertSpaces: state\.indentMode === 'spaces'/);
  assert.match(code, /state\.tabSize/);
  assert.match(code, /applyIndentToModel\(model\)/);
  assert.match(code, /api\.setWindowPrefs/);
  assert.match(code, /api\.restartConfirmed/);
  assert.match(code, /wordWrapColumn: wrapColumn/);
  assert.match(html, /id="btn-open-file"/);
  assert.match(html, /id="about-overlay"/);
});

test('Emmet expansions set caret inside generated tags', async () => {
  const { insertionForExpansion, snippetForExpansion } = await import('../src/emmet-caret.js');
  const div = '<div class="this"></div>';
  const one = insertionForExpansion(div);
  assert.equal(div.slice(one.caretOffset), '</div>');
  assert.equal(snippetForExpansion(div), '<div class="this">$0</div>');
  const five = new Array(5).fill('<div class="content"></div>').join('\n');
  assert.equal(five.slice(insertionForExpansion(five).caretOffset).startsWith('</div>'), true);
  const nested = '<ul>\n  <li class="item1"></li>\n  <li class="item2"></li>\n</ul>';
  assert.equal(nested.slice(insertionForExpansion(nested).caretOffset).startsWith('</li>'), true);
  assert.equal(snippetForExpansion('<span>$value</span>'), '<span>$0\\$value</span>');
  const main = source('src/main.js');
  assert.match(main, /editor\.setPosition\(model\.getPositionAt\(startOffset \+ insertion\.caretOffset\)\)/);
  assert.match(main, /insertText: snippetForExpansion/);
});

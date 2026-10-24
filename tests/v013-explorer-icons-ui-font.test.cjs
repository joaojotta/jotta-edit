'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('new user SVG icons and refresh file exist', () => {
  const names = ['folder','file','html5','css3','js','json','php','txt','fonts','png','jpeg','gif','svg','webp','image','audio','video','package','folder-add','search','formatter','command','theme','close'];
  for (const name of names) {
    const content = read(`public/${['folder-add','search','formatter','command','theme','close'].includes(name) ? 'ui-icons' : 'file-icons'}/${name}.svg`);
    assert.match(content, /<svg\b/);
  }
  assert.match(read('public/ui-icons/refresh.svg'), /<svg\b/);
  assert.match(read('index.html'), /src="\/ui-icons\/refresh\.svg"/);
});

test('icon colours persist per icon type and use the same colour editor popup', () => {
  const main = read('src/main.js'), picker = read('src/color-picker.js');
  assert.match(main, /state\.iconColours = readIconColours\(\)/);
  assert.ok(main.indexOf('const iconTypeNames') < main.indexOf('state.iconColours = readIconColours()'), 'avoid startup TDZ');
  assert.match(main, /remember\('iconColours', JSON\.stringify\(state\.iconColours\)\)/);
  assert.match(main, /colorEditor\.openForChoice\(/);
  assert.match(picker, /function openForChoice\(/);
  assert.match(picker, /editing\.external/);
  assert.match(main, /-webkit-mask-image|webkitMaskImage/);
  assert.match(read('index.html'), /id="setting-icon-type"/);
  assert.match(read('index.html'), /id="setting-icon-reset"/);
});

test('explorer close hides subfolders and closes root without closing open editor tabs', () => {
  const main = read('src/main.js');
  assert.match(main, /function removeFolderFromView\(path\)/);
  assert.match(main, /state\.removedFolders\.add\(path\)/);
  assert.match(main, /state\.root = null; state\.nodes = \[\]; state\.files = \[\]/);
  assert.match(main, /function filterRemovedFolders\(nodes\)/);
  assert.match(main, /refreshFolder\(\{restoreFolders:true\}\)/);
  assert.doesNotMatch(main.match(/function removeFolderFromView\(path\) \{[\s\S]*?\n\}/)?.[0] || '', /closeDocument\(/);
  assert.match(read('index.html'), /id="btn-close-project"/);
});

test('Rubik is installed as a build dependency and separate UI font selection is live', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.version, '1.1.5');
  assert.ok(pkg.dependencies['@fontsource/rubik']);
  assert.match(read('src/main.js'), /import '@fontsource\/rubik\/400.css'/);
  assert.match(read('src/main.js'), /remember\('uiFontFamily', state\.uiFontFamily\)/);
  assert.match(read('src/main.js'), /'--ui-font-family'/);
  assert.match(read('index.html'), /id="setting-ui-font"/);
  assert.match(read('src/font-menu.js'), /'ui-font-menu'/);
  assert.match(read('scripts/check-install.cjs'), /node_modules\/@fontsource\/rubik\/package.json/);
  assert.match(read('scripts/build-flatpak.sh'), /node_modules\/@fontsource\/rubik\/package.json/);
});

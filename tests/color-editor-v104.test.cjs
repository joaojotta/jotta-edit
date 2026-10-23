'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
test('CSS colours parse and format in HEX, RGB, HSL and alpha formats', async () => {
  const { parseCssColor, formatCssColor, findCssColors } = await import('../src/color-utils.js');
  const hsl = parseCssColor('hsl(78, 75%, 47%)');
  assert.deepEqual([hsl.r,hsl.g,hsl.b],[156,210,30]);
  assert.equal(formatCssColor(hsl,'hsl'), 'hsl(78, 75%, 47%)');
  assert.equal(formatCssColor(parseCssColor('#ffc107'),'hex'), '#ffc107');
  assert.equal(formatCssColor(parseCssColor('rgba(255, 0, 0, 0.5)'),'rgb'), 'rgba(255, 0, 0, 0.5)');
  assert.equal(formatCssColor(parseCssColor('#1234'),'hex'),'#11223344');
  const hits = findCssColors('p{color:hsl(78, 75%, 47%); background:#ffc107; opacity:rgba(255, 0, 0, .5)}');
  assert.equal(hits.length,3);
  assert.equal(hits[0].text,'hsl(78, 75%, 47%)');
  assert.equal(hits[2].color.a, .5);
  assert.equal(parseCssColor('var(--accent)'),null);
});
test('Custom colour editor replaces Monaco hover and uses theme variables',()=>{
  const main=read('src/main.js'), picker=read('src/color-picker.js'), css=read('src/color-picker.css');
  assert.match(main,/colorDecorators: false/);
  assert.match(main,/installColorEditor\(editor, monaco/);
  assert.match(picker,/editor\.executeEdits\('jotta\.colour'/);
  assert.match(picker,/editor\.createDecorationsCollection\(\)/);
  assert.match(picker,/editorHost\.addEventListener\('pointerdown'/);
  assert.match(picker,/jc-preview/);
  assert.match(picker,/jc-rgb/);
  assert.match(picker,/jc-hsl/);
  assert.match(css,/background:var\(--surface\)/);
  assert.doesNotMatch(css,/backdrop-filter/);
});
test('Font picker offers an explicit clickable list and editable input',()=>{
  const html=read('index.html'), picker=read('src/font-menu.js');
  assert.match(html,/id="font-toggle"/);
  assert.match(html,/role="combobox"/);
  assert.doesNotMatch(html,/list="font-options"/);
  assert.match(picker,/showAll = !filter/);
  assert.match(picker,/font\.toLowerCase\(\)\.includes/);
  assert.match(picker,/installFontMenu/);
});
test('Windows script rejects Node 22.11 before npm install',()=>{
  const script=read('scripts/build-windows.ps1'), check=read('scripts/check-node-version.cjs');
  assert.ok(script.indexOf('check-node-version.cjs') < script.indexOf("@('install'"));
  assert.match(check,/minor < 12/);
});

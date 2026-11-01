'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('UI font size is separate from editor font, persisted and defaults 2px larger', () => {
  const html = read('index.html'), main = read('src/main.js'), css = read('src/style.css');
  assert.match(html, /id="setting-ui-size"/);
  assert.match(main, /uiFontSize: boundedUiSize\(stored\('uiFontSize', '14'\)\)/);
  assert.match(main, /remember\('uiFontSize', state\.uiFontSize\)/);
  assert.match(main, /applyUiTypography\(\)/);
  assert.match(css, /--ui-font-size: 14px/);
  assert.match(css, /font-size: var\(--ui-font-size\)/);
  assert.match(main, /\.settings-dialog'\)\.focus/);
  assert.doesNotMatch(main, /\$\('setting-font'\)\.focus\(\)/);
});
test('Ctrl+wheel zoom adjusts editor typography, preventing Chromium zoom', () => {
  const main=read('src/main.js');
  assert.match(main, /addEventListener\('wheel'/);
  assert.match(main, /event\.ctrlKey/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.match(main, /adjustFont\(\(wheelAccum/);
  assert.match(main, /mouseWheelZoom: false/);
});
test('CSS coloured squares occupy injected text slots and remain clickable', () => {
  const picker = read('src/color-picker.js');
  assert.match(picker, /getPositionAt\(hit\.start\)/);
  assert.match(picker, /decorations\.set\(items\.map/);
  assert.match(picker, /before: \{ content: '■ '/);
  assert.match(picker, /cursorStops: monaco\.editor\.InjectedTextCursorStops\.None/);
  assert.match(picker, /editorHost\.addEventListener\('pointerdown'/);
  assert.doesNotMatch(picker, /addContentWidget/);
  const css = read('src/color-picker.css');
  assert.match(css, /\.monaco-editor \.jotta-inline-swatch/);
  assert.match(css, /cursor:pointer !important/);
  assert.doesNotMatch(css, /left:-14px/);
});
test('Tabbed colour editor supports HEX, RGBA, HSL and CMYK with theme sizing', async () => {
  const code = read('src/color-picker.js'), css = read('src/color-picker.css');
  for(const format of ['hex','rgba','hsl','cmyk']) assert.ok(code.includes(`data-format="${format}"`));
  assert.match(code, /aria-selected/);
  assert.match(code, /role="tabpanel"/);
  assert.match(code, /role="tablist"/);
  assert.match(code, /CMYK is an approximate screen conversion/);
  assert.match(css, /font:calc\(var\(--ui-font-size\) \+ 1px\)/);
  const { rgbToCmyk, cmykToRgb } = await import('../src/color-utils.js');
  assert.deepEqual(rgbToCmyk({r:0,g:0,b:0}),{c:0,m:0,y:0,k:100});
  assert.deepEqual(rgbToCmyk({r:255,g:0,b:0}),{c:0,m:100,y:100,k:0});
  assert.deepEqual(cmykToRgb(0,100,100,0),{r:255,g:0,b:0});
  assert.deepEqual(cmykToRgb(0,0,0,100),{r:0,g:0,b:0});
});

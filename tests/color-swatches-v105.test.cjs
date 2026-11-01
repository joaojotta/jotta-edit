"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
test('CSS swatches are in-text decorated squares instead of floating buttons', () => {
  const source = read('src/color-picker.js');
  const style = read('src/color-picker.css');
  const main = read('src/main.js');
  assert.match(source, /editor\.createDecorationsCollection\(\)/);
  assert.match(source, /decorations\.set\(items\.map/);
  assert.match(source, /before: \{ content: '■ '/);
  assert.match(source, /inlineClassName: `jotta-inline-swatch jotta-color-token-/);
  assert.match(source, /getPositionAt\(hit\.start\)/);
  assert.match(source, /closest\('\.jotta-inline-swatch'\)/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /editor\.onDidChangeModelContent\(refresh\)/);
  assert.doesNotMatch(source, /editor\.addContentWidget\(/);
  assert.doesNotMatch(style, /left:-1[47]px/);
  assert.match(style, /\.monaco-editor \.jotta-inline-swatch/);
  assert.match(main, /colorDecorators: false/);
});
test('HEX, rgb() and hsl() CSS colour literals are matched for swatches', async () => {
  const { findCssColors } = await import('../src/color-utils.js');
  const matches = findCssColors('body { color: #ffc107; background: rgb(10, 20, 30); border: hsl(120, 50%, 40%); }');
  assert.deepEqual(matches.map(m => m.text), ['#ffc107', 'rgb(10, 20, 30)', 'hsl(120, 50%, 40%)']);
});

test('colour value text stays readable over opaque and transparent backgrounds', async () => {
  const {parseCssColor, colorTextContrast} = await import('../src/color-utils.js');
  const white = parseCssColor('#ffffff'), black = parseCssColor('#000000');
  assert.equal(colorTextContrast(white), '#000000');
  assert.equal(colorTextContrast(black), '#ffffff');
  assert.equal(colorTextContrast(parseCssColor('#00ccaa')), '#000000');
  assert.equal(colorTextContrast(parseCssColor('rgba(255,255,255,0)'), black), '#ffffff');
  assert.equal(colorTextContrast(parseCssColor('rgba(0,0,0,0)'), white), '#000000');
  assert.equal(colorTextContrast(parseCssColor('rgba(255,255,255,0.1)'), black), '#ffffff');
});

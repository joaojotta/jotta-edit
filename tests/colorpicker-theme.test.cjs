"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('only app modal overlays receive fixed translucent scrim styling', () => {
  const css = read('src/style.css');
  const html = read('index.html');
  assert.doesNotMatch(css, /(^|[\n,])\s*\.overlay(?:\.|\s|\{)/m);
  assert.match(css, /\.jotta-modal-overlay\s*\{\s*position:\s*fixed/);
  assert.match(css, /\.jotta-modal-overlay\.hidden\s*\{\s*display:\s*none/);
  for (const id of ['overlay', 'confirm-overlay', 'settings-overlay', 'about-overlay']) {
    assert.match(html, new RegExp(`id="${id}" class="jotta-modal-overlay `));
  }
  assert.doesNotMatch(html, /class="overlay(?:\s|\")/);
});

test('custom Jotta colour editor replaces Monaco default hover without translucent scrims', () => {
  const css = read('src/color-picker.css');
  const js = read('src/main.js');
  assert.match(js, /colorDecorators: false/);
  assert.match(css, /\.jotta-color-editor/);
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.match(css, /var\(--surface\)/);
});

test('dark and light Monaco hover widget themes match Jotta surfaces', async () => {
  const main = read('src/main.js');
  const { syntaxPalettes, createMonacoTheme } = await import('../src/syntax-themes.js');
  assert.match(main, /registerSyntaxThemes\(monaco\)/);
  assert.match(main, /monaco\.editor\.setTheme\(resolveSyntaxTheme\(state\.syntaxTheme, state\.theme\)\)/);
  assert.equal(createMonacoTheme(syntaxPalettes['jotta-dark']).colors['editorHoverWidget.background'], '#242529');
  assert.equal(createMonacoTheme(syntaxPalettes['jotta-light']).colors['editorHoverWidget.background'], '#f5f5f6');
});

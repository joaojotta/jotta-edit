"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

test('colour indicator is clickable inline Monaco text; no viewport overlay', () => {
  const code = src('src/color-picker.js');
  const css = src('src/color-picker.css');
  assert.match(code, /editor\.createDecorationsCollection\(\)/);
  assert.match(code, /before: \{ content: '■ '/);
  assert.match(code, /inlineClassName: `jotta-inline-swatch jotta-color-token-/);
  assert.match(code, /editorHost\.addEventListener\('pointerdown'/);
  assert.match(code, /openAt\(items\[index\]/);
  assert.match(css, /font-size:\.85em/);
  assert.doesNotMatch(css, /position:absolute|left:-17px/);
});

test('Windows LSP teardown waits for process close and retries cleanup', () => {
  const lsp = src('electron/lsp.cjs');
  const testCode = src('tests/lsp.test.cjs');
  assert.match(lsp, /async shutdown\(\)/);
  assert.match(lsp, /child\.once\('close', finish\)/);
  assert.match(testCode, /await bridge\.shutdown\(\)/);
  assert.match(testCode, /maxRetries: 12, retryDelay: 150/);
});

test('Explorer icons use theme monochrome and the top-right controls are use themed icons', () => {
  const html = src('index.html');
  const css = src('src/style.css');
  for (const id of ['btn-format','btn-quick','btn-palette','status-theme']) {
    assert.match(html, new RegExp('id="' + id + '"[^>]*><(?:svg|img)'));
  }
  assert.match(css, /:root\[data-theme="dark"\] \.sidebar img\[src\^="\/file-icons\/"\]/);
  assert.match(css, /:root\[data-theme="light"\] \.sidebar img\[src\^="\/file-icons\/"\]/);
  assert.match(css, /#status-theme \{ width:39px; height:100%; \}/);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('formatting width defaults to unrestricted and validates recognised column sizes', async () => {
  const { normalizeFormatterWidth, prettierPrintWidth } = await import('../src/editor-behaviour.js');
  assert.equal(normalizeFormatterWidth('none'), 'none');
  assert.equal(normalizeFormatterWidth('invalid'), 'none');
  assert.equal(prettierPrintWidth(undefined), 10000);
  for (const size of [80, 100, 120]) assert.equal(prettierPrintWidth(String(size)), size);
  assert.doesNotMatch(read('src/formatting.js'), /printWidth:\s*100\s*,/);
  assert.match(read('src/formatting.js'), /proseWrap:\s*'never'/);
  assert.match(read('src/formatting.js'), /printWidth:\s*prettierPrintWidth\(printWidth\)/);
});

test('Plain Text default highlights only selected words; code-language highlight is unaffected', async () => {
  const { normalizePlainTextHighlight, plainTextHighlightOptions } = await import('../src/editor-behaviour.js');
  assert.equal(normalizePlainTextHighlight('bad'), 'selection');
  assert.deepEqual(plainTextHighlightOptions('plaintext', 'selection'), {occurrencesHighlight:'off', selectionHighlight:true});
  assert.deepEqual(plainTextHighlightOptions('plaintext', 'cursor'), {occurrencesHighlight:'singleFile', selectionHighlight:true});
  assert.deepEqual(plainTextHighlightOptions('plaintext', 'off'), {occurrencesHighlight:'off', selectionHighlight:false});
  assert.deepEqual(plainTextHighlightOptions('html', 'off'), {occurrencesHighlight:'singleFile', selectionHighlight:true});
});

test('format settings are persisted and passed to both formatting entry points', () => {
  const main = read('src/main.js'), html = read('index.html');
  assert.match(html, /id="setting-plaintext-highlights"/);
  assert.match(html, /id="setting-format-width"/);
  assert.match(main, /remember\('plainTextHighlights', state\.plainTextHighlights\)/);
  assert.match(main, /remember\('formatWidth', state\.formatWidth\)/);
  assert.match(main, /applyPlainTextHighlights\(\)/);
  assert.match(main, /formatCode\(original,[\s\S]*?printWidth: state\.formatWidth/);
  assert.match(main, /formatCode\(source,[\s\S]*?printWidth: state\.formatWidth/);
  assert.equal(require('../package.json').version, '1.1.3');
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');
const modulePromise = import('../src/syntax-themes.js');

test('all Monaco syntax palettes and Follow interface setting resolve correctly', async () => {
  const { syntaxThemeChoices, syntaxPalettes, normalizeSyntaxTheme, resolveSyntaxTheme } = await modulePromise;
  assert.equal(syntaxThemeChoices.length, Object.keys(syntaxPalettes).length + 1);
  assert.ok(Object.keys(syntaxPalettes).length >= 19);
  assert.equal(normalizeSyntaxTheme('unknown-value'), 'auto');
  assert.equal(normalizeSyntaxTheme(null), 'auto');
  assert.equal(resolveSyntaxTheme('auto', 'dark'), 'jotta-dark');
  assert.equal(resolveSyntaxTheme('auto', 'light'), 'jotta-light');
  assert.equal(resolveSyntaxTheme('dracula', 'light'), 'dracula');
  assert.equal(resolveSyntaxTheme('solarized-light', 'dark'), 'solarized-light');
  for (const entry of syntaxThemeChoices.slice(1)) {
    assert.equal(resolveSyntaxTheme(entry.id, 'dark'), entry.id);
    assert.equal(resolveSyntaxTheme(entry.id, 'light'), entry.id);
    assert.equal(entry.mode, syntaxPalettes[entry.id].mode);
  }
});

test('Monaco theme registration sets legible token colours, including hover widgets', async () => {
  const { syntaxPalettes, createMonacoTheme, registerSyntaxThemes } = await modulePromise;
  const names = [];
  registerSyntaxThemes({ editor: { defineTheme(name, config) {
    names.push(name);
    assert.deepEqual(config, createMonacoTheme(syntaxPalettes[name]));
  } } });
  assert.deepEqual(names.sort(), Object.keys(syntaxPalettes).sort());
  const validHex = /^#[0-9a-f]{6}$/i;
  function lightness(colour) {
    const rgb = [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16) / 255);
    const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  }
  function contrast(foreground, background) {
    const a = lightness(foreground), b = lightness(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  }
  for (const [key, palette] of Object.entries(syntaxPalettes)) {
    const data = createMonacoTheme(palette);
    assert.equal(data.base, palette.mode === 'light' ? 'vs' : 'vs-dark');
    assert.equal(data.colors['editor.background'], palette.background);
    assert.equal(data.colors['editorHoverWidget.background'], palette.widget);
    if (palette.inheritSyntax) assert.deepEqual(data.rules, [], 'preserve Monaco default syntax tokens for Jotta presets');
    else {
      assert.ok(data.rules.some(rule => rule.token === 'keyword'));
      assert.ok(data.rules.some(rule => rule.token === 'comment'));
    }
    for (const token of ['foreground', 'keyword', 'comment', 'string', 'number', 'type', 'function', 'variable', 'tag', 'attribute', 'operator']) {
      assert.match(palette[token], validHex, `${key}.${token}`);
      assert.ok(contrast(palette[token], palette.background) >= 4.5, `${key}.${token} contrast should be >= 4.5:1`);
    }
  }
});

test('settings theme is independent of UI theme, persists and applies without restart', () => {
  const main = read('src/main.js');
  const html = read('index.html');
  const i18n = read('src/i18n.js');
  const css = read('src/style.css');
  assert.match(html, /id="setting-syntax-theme"/);
  assert.match(html, /id="setting-syntax-preview"/);
  assert.match(main, /syntaxTheme: normalizeSyntaxTheme\(stored\('syntaxTheme', 'auto'\)\)/);
  assert.match(main, /remember\('syntaxTheme', state.syntaxTheme\)/);
  assert.match(main, /monaco\.editor\.setTheme\(resolveSyntaxTheme\(state\.syntaxTheme, state\.theme\)\)/);
  assert.match(main, /syntaxSelect\.addEventListener\('change', event => setSyntaxTheme\(event\.target\.value\)\)/);
  assert.match(main, /document\.addEventListener\('jotta:locale-changed'/);
  assert.match(main, /registerSyntaxThemes\(monaco\)/);
  assert.match(css, /\.syntax-theme-preview/);
  assert.match(i18n, /'Code syntax theme':'Tema de realce de sintaxe'/);
  assert.doesNotMatch(main, /window\.location\.reload\(\)/);
  assert.equal(require('../package.json').version, '1.1.4');
});

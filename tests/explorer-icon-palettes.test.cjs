'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const iconModule = import('../src/explorer-icon-palettes.js');
const syntaxModule = import('../src/syntax-themes.js');

test('syntax-theme-matched icon palettes cover all supplied Explorer file types', async () => {
  const { explorerIconNames, explorerIconPalettes, explorerIconColour, resolveExplorerIconPalette, explorerIconPaletteChoices } = await iconModule;
  const { syntaxThemeChoices, resolveSyntaxTheme } = await syntaxModule;
  assert.equal(resolveExplorerIconPalette('auto', 'jotta-dark', 'dark'), 'jotta-dark');
  assert.equal(resolveExplorerIconPalette('auto', 'jotta-light', 'light'), 'jotta-light');
  assert.equal(resolveExplorerIconPalette('auto', 'vscode-dark-plus', 'dark'), 'seti-dark');
  assert.equal(resolveExplorerIconPalette('auto', 'vscode-light-plus', 'light'), 'seti-light');
  assert.equal(resolveExplorerIconPalette('auto', 'nord', 'dark'), 'nord');
  assert.equal(resolveExplorerIconPalette('auto', 'solarized-light', 'light'), 'solarized-light');
  assert.equal(resolveExplorerIconPalette('auto', 'monokai-pro', 'dark'), 'monokai-pro');
  assert.equal(resolveExplorerIconPalette('auto', 'catppuccin-mocha', 'dark'), 'catppuccin-mocha');
  for (const { id } of explorerIconPaletteChoices) {
    for (const name of explorerIconNames) {
      const colour = explorerIconColour(name, {}, id, 'jotta-dark', 'dark');
      assert.match(colour, /^#[0-9a-f]{6}$/i, `${id}.${name}`);
    }
  }
  for (const [name, palette] of Object.entries(explorerIconPalettes)) {
    for (const icon of explorerIconNames) {
      assert.match(palette[icon], /^#[0-9a-f]{6}$/i, `${name}.${icon}`);
    }
  }
  for (const theme of syntaxThemeChoices.slice(1)) {
    const paletteId = resolveExplorerIconPalette('auto', resolveSyntaxTheme(theme.id, 'dark'), 'dark');
    assert.ok(paletteId in explorerIconPalettes, `Syntax theme ${theme.id} must have an icon palette`);
  }
  for (const name of explorerIconNames) assert.match(read(`public/file-icons/${name}`), /<svg\b/);
});

test('automatic icons stay visible across opposite syntax and UI modes', async () => {
  const { explorerIconNames, explorerIconPalettes, explorerIconColour, iconContrast } = await iconModule;
  for (const syntaxPalette of Object.keys(explorerIconPalettes)) {
    for (const mode of ['dark', 'light']) {
      for (const icon of explorerIconNames) {
        const result = explorerIconColour(icon, {}, 'auto', syntaxPalette, mode);
        assert.ok(iconContrast(result, mode) >= 3, `${syntaxPalette} ${icon} on ${mode} must be visible: ${result}`);
      }
    }
  }
});

test('manual icon colours override automatic palettes and reset falls back to palette', async () => {
  const { explorerIconColour, normalizeExplorerIconPalette, resolveExplorerIconPalette } = await iconModule;
  assert.equal(normalizeExplorerIconPalette('random'), 'auto');
  assert.equal(normalizeExplorerIconPalette('seti-light'), 'seti-light');
  assert.equal(resolveExplorerIconPalette('monochrome', 'jotta-dark', 'dark'), 'monochrome');
  assert.equal(explorerIconColour('js.svg', { 'js.svg': '#123abc' }, 'auto', 'solarized-light', 'dark'), '#123abc');
  assert.equal(explorerIconColour('js.svg', { 'js.svg': '#123abc88' }, 'seti-light', 'vscode-dark-plus', 'light'), '#123abc88');
  assert.notEqual(explorerIconColour('js.svg', {}, 'auto', 'solarized-light', 'dark'), '#123abc');
  assert.equal(explorerIconColour('../unrecognized.svg', {}, 'auto', 'solarized-light', 'dark'), null);
  assert.equal(explorerIconColour('js.svg', {}, 'monochrome', 'jotta-dark', 'light'), '#4A5564');
});

test('Explorer palette selection persists; syntax and interface theme changes repaint icons', () => {
  const main = read('src/main.js'), html = read('index.html'), css = read('src/style.css');
  assert.equal(require('../package.json').version, '1.1.5');
  assert.match(main, /explorerIconPalette: normalizeExplorerIconPalette\(stored\('explorerIconPalette', 'auto'\)\)/);
  assert.match(main, /remember\('explorerIconPalette', state\.explorerIconPalette\)/);
  assert.match(main, /iconPaletteChoice\.addEventListener\('change'/);
  assert.match(main, /explorerIconColour\(/);
  assert.match(main, /function applySyntaxTheme\(\) \{[\s\S]*?renderTree\(\);[\s\S]*?updateIconColourPreview\(\);/);
  assert.match(main, /saveIconColour\(iconChoice\.value, null\)/);
  assert.match(html, /id="setting-icon-palette"/);
  assert.match(html, /id="setting-icon-palette-preview"/);
  assert.match(html, /id="setting-icon-colour-value"/);
  assert.match(css, /\.icon-palette-preview/);
  assert.match(read('src/i18n.js'), /'Explorer icon palette':'Paleta de ícones do Explorador'/);
});

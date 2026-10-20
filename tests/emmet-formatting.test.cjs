'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const installed = ['emmet', 'prettier', '@prettier/plugin-php']
  .every(name => fs.existsSync(path.join(root, 'node_modules', name, 'package.json')));

test('Emmet/formatter packages are pinned and installed locally by build script', () => {
  assert.equal(manifest.dependencies.emmet, '2.4.11');
  assert.equal(manifest.dependencies.prettier, '3.9.6');
  assert.equal(manifest.dependencies['@prettier/plugin-php'], '0.25.0');
  const script = fs.readFileSync(path.join(root, 'scripts/build-flatpak.sh'), 'utf8');
  for (const name of ['node_modules/emmet', 'node_modules/prettier', 'node_modules/@prettier/plugin-php']) {
    assert.ok(script.includes(name));
  }
});

test('Emmet expands .this, .content*5 and nested/numbered elements', { skip: !installed && 'Install npm dependencies first to run expansion test' }, async () => {
  const { abbreviationAt } = await import('../src/emmet.js');
  const one = abbreviationAt('.this', 5, 'html');
  assert.ok(one, 'Expected .this expansion to be recognized');
  assert.match(one.result, /<div class="this"><\/div>/);
  const five = abbreviationAt('.content*5', 10, 'html');
  assert.ok(five, 'Expected .content*5 expansion to be recognized');
  assert.equal((five.result.match(/<div class="content">/g) || []).length, 5);
  const nested = abbreviationAt('ul>li.item$*3', 13, 'html');
  assert.ok(nested, 'Expected nested/numbered expansion');
  assert.match(nested.result, /item1/);
  assert.match(nested.result, /item3/);
  assert.equal(abbreviationAt('ordinaryWord', 12, 'html'), null, 'Tab must remain indent for ordinary text');
  assert.equal(abbreviationAt('.this', 5, 'php', 'index.php', false, '<?php\n$this = '), null, 'No markup expansion in PHP code');
});

test('PHP/HTML autoformat safety check', async () => {
  const { hasMixedPhpHtml } = await import('../src/formatting.js');
  assert.equal(hasMixedPhpHtml('<?php echo 1;'), false);
  assert.equal(hasMixedPhpHtml('<?php echo 1; ?><div>Content</div>'), true);
  assert.equal(hasMixedPhpHtml('<!DOCTYPE html>\n<?php echo 1; ?>'), true);
});

test('Prettier formats JS/JSON/CSS/HTML/PHP with local plugins', { skip: !installed && 'Install npm dependencies first to run formatter test' }, async () => {
  const { formatCode } = await import('../src/formatting.js');
  const cases = [
    ['javascript', 'let n=1', /let n = 1/],
    ['json', '{"x":1}', /"x": 1/],
    ['html', '<div><span>Hi</span></div>', /<div>/],
    ['css', '.a{color:red}', /color: red/],
    ['php', '<?php $a=1;', /\$a = 1/]
  ];
  for (const [language, source, expected] of cases) {
    const result = await formatCode(source, { language, filename: `test.${language === 'javascript' ? 'js' : language}` });
    assert.match(result, expected, `${language} formatter should work`);
  }
});


test('Emmet nesting operator is allowed by source validation', () => {
  const source = fs.readFileSync(path.join(root, 'src/emmet.js'), 'utf8');
  assert.match(source, /if \(\/\[<;\]\/\.test\(abbreviation\)/, 'Do not reject >: it is the Emmet child operator');
});

test('PHP standalone plugin is passed as namespace to Prettier', () => {
  const source = fs.readFileSync(path.join(root, 'src/formatting.js'), 'utf8');
  assert.match(source, /import\('\@prettier\/plugin-php\/standalone'\)/);
  assert.match(source, /unwrapPhpPlugin\(await import\('\@prettier\/plugin-php\/standalone'\)\)/);
  assert.match(source, /plugins\.push\(await getPhp\(\)\)/);
  assert.doesNotMatch(source, /\(await getPhp\(\)\)\.default/);
});


test('PHP plugin normalization accepts both UMD default and direct module exports', async () => {
  const { unwrapPhpPlugin } = await import('../src/formatting.js');
  const plugin = { parsers: { php: {} }, printers: { php: {} } };
  assert.equal(unwrapPhpPlugin(plugin), plugin);
  assert.equal(unwrapPhpPlugin({ default: plugin }), plugin);
  assert.throws(() => unwrapPhpPlugin({ default: {} }), /does not expose a php parser/);
});

test('HTML formatting preserves long paragraph text when no width limit is selected', { skip: !installed && 'Install npm dependencies first to run HTML formatting test' }, async () => {
  const { formatCode } = await import('../src/formatting.js');
  const paragraph = 'O curso de Técnico Auxiliar de Farmácia veio em 2026 para ajudar no negócio familiar mas também conhecer um pouco mais do ramo para criar plataformas de gestão e planeamento.';
  const original = `<p>${paragraph}</p>`;
  const formatted = await formatCode(original, { language: 'html', filename: 'index.html', printWidth: 'none' });
  assert.ok(formatted.includes(paragraph), 'The formatter must not insert newlines inside the paragraph');
});

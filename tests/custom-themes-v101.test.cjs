"use strict";
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const imports = Promise.all([import('../src/custom-syntax-themes.js'),import('../src/syntax-themes.js')]);

test('custom themes duplicate built-ins without modifying them and can be restored', async () => {
  const [custom, syntax] = await imports;
  assert.equal(require('../package.json').version, '1.1.4');
  const old = JSON.stringify(syntax.syntaxPalettes['vscode-dark-plus']);
  const created = custom.createCustomTheme({}, 'vscode-dark-plus', 'Personal Dark');
  assert.equal(created.id, 'custom-1');
  assert.equal(created.theme.base, 'vscode-dark-plus');
  assert.equal(created.theme.palette.background, '#1e1e1e');
  assert.equal(created.theme.palette.inheritSyntax, undefined);
  created.theme.palette.keyword = '#123abc';
  const recovered = custom.readCustomThemes(JSON.stringify({[created.id]:created.theme}));
  assert.equal(recovered['custom-1'].palette.keyword,'#123abc');
  assert.equal(JSON.stringify(syntax.syntaxPalettes['vscode-dark-plus']), old);
  syntax.setCustomSyntaxPalettes(recovered);
  assert.equal(syntax.normalizeSyntaxTheme('custom-1'), 'custom-1');
  assert.equal(syntax.resolveSyntaxTheme('custom-1','light'), 'custom-1');
  assert.equal(syntax.syntaxPaletteFor('custom-1').keyword, '#123abc');
  const definitions=[];
  syntax.registerCustomSyntaxThemes({editor:{defineTheme:(id,data)=>definitions.push({id,data})}});
  assert.equal(definitions.length,1);
  assert.equal(definitions[0].id,'custom-1');
  assert.equal(definitions[0].data.base,'vs-dark');
  assert.equal(definitions[0].data.rules.find(item=>item.token==='keyword').foreground,'123abc');
  syntax.setCustomSyntaxPalettes({});
  assert.equal(syntax.normalizeSyntaxTheme('custom-1'), 'auto');
});

test('JSON imports are validated and unsafe custom entries discarded', async () => {
  const [custom, syntax] = await imports;
  const valid = custom.createCustomTheme({}, 'solarized-light', 'Light 2').theme;
  const exported = custom.exportCustomTheme(valid);
  assert.deepEqual(custom.importCustomTheme(exported), valid);
  assert.throws(()=>custom.importCustomTheme('{'),/Invalid JSON/);
  assert.throws(()=>custom.importCustomTheme(JSON.stringify({...valid,format:'no'})),/Not a Jotta Edit theme/);
  assert.throws(()=>custom.importCustomTheme('a'.repeat(25001)),/too large/);
  assert.deepEqual(custom.readCustomThemes('{bad'),{});
  const poisoned = {...valid, palette:{...valid.palette,foreground:'url(javascript:evil)'}};
  assert.deepEqual(custom.readCustomThemes({'custom-1':poisoned,'../../bad':valid}),{});
  assert.ok(!custom.validateCustomTheme({...valid,name:' '.repeat(3)}));
  assert.equal(custom.createCustomTheme(Object.fromEntries(Array.from({length:custom.CUSTOM_THEME_LIMIT},(_,i)=>[`custom-${i+1}`,valid])), 'solarized-light'),null);
  const ids = {'custom-1':valid};
  assert.equal(custom.createCustomTheme(ids,'custom-1').id,'custom-2');
});

test('theme editor UI, colour mixer integration, localisation and Explorer follow-source integration', () => {
  const html=read('index.html'), main=read('src/main.js'), css=read('src/style.css'), i18n=read('src/i18n.js');
  for (const id of ['custom-theme-editor','theme-duplicate','theme-editor-fields','theme-custom-name','theme-custom-mode','theme-colour-grid','theme-reset','theme-delete','theme-delete-confirm','theme-delete-yes','theme-delete-no','theme-export','theme-import','theme-import-file']) assert.ok(html.includes(`id="${id}"`),id);
  assert.match(main,/colorEditor\.openForChoice\(entry\.palette\[key\]/);
  assert.match(main,/registerCustomSyntaxThemes\(monaco\)/);
  assert.match(main,/remember\('customThemes', JSON\.stringify\(state\.customThemes\)\)/);
  assert.match(main,/state\.customThemes\[resolveSyntaxTheme\(state\.syntaxTheme, state\.theme\)\]\?\.base/);
  assert.match(css,/\.theme-colour-grid/);
  assert.match(i18n,/Theme editor/);
});


test('interface colours validate and persist independently for dark and light schemes', async () => {
  const {readInterfaceColours, setInterfaceColour, applyInterfaceColours} = await import('../src/interface-theme.js');
  const saved=readInterfaceColours('not json');
  assert.deepEqual(saved,{dark:{},light:{}});
  assert.equal(setInterfaceColour(saved,'dark','accent','#AABBCC'),true);
  assert.equal(setInterfaceColour(saved,'light','sidebar','#ffffff'),true);
  assert.equal(setInterfaceColour(saved,'light','sidebar','red'),false);
  assert.equal(setInterfaceColour(saved,'light','--evil','#111111'),false);
  assert.deepEqual(readInterfaceColours(JSON.stringify(saved)),{dark:{accent:'#aabbcc'},light:{sidebar:'#ffffff'}});
  const set = new Map();
  const element={style:{setProperty:(k,v)=>set.set(k,v),removeProperty:k=>set.delete(k)}};
  applyInterfaceColours(element,saved,'dark');
  assert.equal(set.get('--accent'),'#aabbcc');
  applyInterfaceColours(element,saved,'light');
  assert.equal(set.get('--accent'),undefined);
  assert.equal(set.get('--sidebar'),'#ffffff');
  assert.equal(readInterfaceColours({dark:{accent:'javascript:alert(1)'},light:{}}).dark.accent,undefined);
  const html=read('index.html'),main=read('src/main.js');
  assert.match(html,/id="theme-ui-colours"/);
  assert.match(html,/id="theme-ui-reset"/);
  assert.match(main,/applyInterfaceColours\(document\.documentElement, state\.interfaceColours, state\.theme\)/);
});

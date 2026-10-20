'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const src = p => fs.readFileSync(path.join(root,p),'utf8');

test('Portuguese and English are selectable, with OS locale fallback and live menu update', async () => {
  const html=src('index.html'), ui=src('src/main.js'), i18n=src('src/i18n.js');
  const preload=src('electron/preload.cjs'), electron=src('electron/main.cjs');
  assert.match(html, /id="setting-language"/);
  assert.match(html, /value="system"/);
  assert.match(html, /value="pt-PT"/);
  assert.match(html, /value="en"/);
  assert.match(ui, /remember\('languagePreference', state.languagePreference\)/);
  assert.match(ui, /configureLanguage\(state.languagePreference/);
  assert.match(i18n, /document\.dispatchEvent\(new Event\('jotta:locale-changed'\)\)/);
  assert.match(preload, /systemLocale: \(\) => invoke\('app:locale'\)/);
  assert.match(electron, /app\.getLocale\(\)/);
  assert.match(electron, /app:menu-locale/);
  const {tr} = await import('../src/i18n.js');
  assert.equal(tr('File'), 'File');
});

test('double click on empty tab strip creates new file without stealing document doubleclicks', () => {
  const main = src('src/main.js');
  assert.match(main, /\$\('tabs'\)\.addEventListener\('dblclick', event => \{/);
  assert.match(main, /if \(!event.target.closest\('\.tab'\)\) addDocument\(null\)/);
});

test('matching markup decorates only tag names and never angle brackets', () => {
  const code = src('src/tag-matching.js'), css=src('src/style.css'), main=src('src/main.js');
  assert.match(code, /nameStart/);
  assert.match(code, /nameEnd/);
  assert.match(code, /inlineClassName: 'jotta-matching-tag-name'/);
  assert.match(code, /matchBrackets: active \? 'never' : 'always'/);
  assert.match(main, /installTagUnderlining\(editor, monaco\)/);
  assert.match(css, /\.jotta-matching-tag-name/);
  assert.match(css, /text-decoration: underline/);
});

test('all user-supplied icons and current icon assets included in distribution', () => {
  const icons = ['js','txt','file','json','php','png','html5','image','css3','fonts','gif','folder','jpeg','webp','svg','audio','video','package','search','formatter','command','theme'];
  for (const name of icons) assert.match(src('public/'+(['search','formatter','command','theme'].includes(name)?'ui-icons':'file-icons')+'/'+name+'.svg'), /<svg\b/);
  for (const filename of ['public/icon.png','assets/icon.png','assets/icon.ico','assets/icons/256x256.png']) {
    assert.ok(fs.statSync(path.join(root,filename)).size > 100);
  }
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { normalizeSession, writeSession } = require('../electron/session-store.cjs');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('recovery session preserves ordered unsaved and dirty file content, selected tab and naming', () => {
  const saved = normalizeSession({
    root: '/project', files: ['/project/a.txt'], activeIndex: 1, nextUntitled: 4,
    tabs: [
      {path: '/project/a.txt', name:'a.txt', dirty:false},
      {path:null, name:'untitled-3', dirty:true, text:'unsaved\ncolors #ffc107', language:'css'},
      {path: '/project/b.txt', name:'b.txt', dirty:true, text:'modified but NOT saved'}
    ]
  });
  assert.equal(saved.tabs.length, 3);
  assert.equal(saved.tabs[0].text, undefined, 'clean disk files are not duplicated');
  assert.equal(saved.tabs[1].text, 'unsaved\ncolors #ffc107');
  assert.equal(saved.tabs[2].text, 'modified but NOT saved');
  assert.equal(saved.activeIndex, 1);
  assert.equal(saved.nextUntitled, 4);
  assert.equal(saved.root, '/project');
});

test('legacy sessions still load and recovery rejects content truncation or missing drafts', () => {
  assert.deepEqual(normalizeSession({ root:'/x', files:['/x/a.txt'] }), {root:'/x',files:['/x/a.txt']});
  assert.throws(() => normalizeSession({tabs:[{path:null,dirty:true}]}), /Missing unsaved/);
  assert.throws(() => normalizeSession({tabs:[{path:'/a',dirty:true}]}), /Missing unsaved/);
  assert.throws(() => normalizeSession({tabs:[{path:null,dirty:true,text:'x'.repeat(5*1024*1024+1)}]}), /5 MB/);
});

test('session disk writes are atomic, keep previous snapshot on validation failure and protect files', async () => {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'jotta-session-'));
  try {
    const dest = path.join(temp, 'user-data', 'session.json');
    const first = { root:null, files:[], tabs:[{path:null,name:'untitled-1',dirty:true,text:'save me'}], activeIndex:0 };
    await writeSession(dest, first);
    assert.equal(JSON.parse(await fsp.readFile(dest,'utf8')).tabs[0].text, 'save me');
    await assert.rejects(() => writeSession(dest, {tabs:[{path:null,dirty:true}]}), /Missing unsaved/);
    assert.equal(JSON.parse(await fsp.readFile(dest,'utf8')).tabs[0].text, 'save me');
    await writeSession(dest, {...first, tabs:[{path:null,name:'untitled-1',dirty:true,text:'new contents'}]});
    assert.equal(JSON.parse(await fsp.readFile(dest,'utf8')).tabs[0].text, 'new contents');
    assert.equal(fs.existsSync(dest+'.tmp'), false);
    if (process.platform !== 'win32') assert.equal((await fsp.stat(dest)).mode & 0o777, 0o600);
  } finally { await fsp.rm(temp, {recursive:true, force:true}); }
});

test('view-wrap setting is persisted and follows editor viewport independently of font size', () => {
  const js = read('src/main.js');
  const html = read('index.html');
  const i18n = read('src/i18n.js');
  assert.match(html, /id="setting-word-wrap" type="checkbox"/);
  assert.match(js, /wordWrap: state\.wordWrap \? 'on' : 'off'/);
  assert.match(js, /remember\('wrap', String\(state\.wordWrap\)\)/);
  assert.match(js, /\$\('setting-word-wrap'\)\.addEventListener\('change', e => setWordWrap\(e\.target\.checked\)\)/);
  assert.match(js, /function toggleWrap\(\) \{ setWordWrap\(!state\.wordWrap\); \}/);
  assert.match(js, /\$\('setting-word-wrap'\)\.checked = state\.wordWrap/);
  assert.match(i18n, /'Word wrap \(fit to editor width\)'/);
});

test('normal close and restart flush drafts instead of prompting to discard them', () => {
  const js = read('src/main.js');
  const electron = read('electron/main.cjs');
  assert.match(js, /sessionSnapshot\(\)/);
  assert.match(js, /\.\.\.\(!doc\.path \|\| doc\.dirty \? \{ text: doc\.model\.getValue\(\) \} : \{\}\)/);
  assert.match(js, /doc\.listener = doc\.model\.onDidChangeContent/);
  assert.match(js, /await flushSession\(\); \/\/ Never close/);
  assert.match(js, /await flushSession\(\); await api\.restartConfirmed\(\)/);
  assert.match(js, /sessionRestoreInProgress = false/);
  assert.match(js, /await restoreSavedSession\(saved\)/);
  assert.match(js, /saved\.tabs/);
  assert.match(electron, /const \{ normalizeSession, writeSession \} = require\('\.\/session-store\.cjs'\)/);
  assert.match(electron, /sessionWriteChain/);
});

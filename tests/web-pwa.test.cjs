'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=require('../package.json');

test('browser API initialises and exposes every editor bridge operation',async()=>{
  // Import the actual ESM adapter. Text-based name checks alone miss undefined
  // object shorthand members that crash the whole web app at module evaluation.
  const {browserApi}=await import('../web/browser-api.js');
  assert.equal(browserApi.platform,'web');
  for(const method of [
    'getSession','setSession','chooseFolder','scanFolder','chooseFiles',
    'readFile','saveFile','saveAsDialog','renameEntry','moveEntry',
    'deleteEntry','searchProject','completePath','complete',
    'importDirectory','importZip','exportProject','newWorkspace',
    'getWindowPrefs','setWindowPrefs','restartConfirmed','listFonts',
    'systemLocale','menuLocale','popupMenu','windowAction',
    'closeConfirmed','onBeforeClose','onMenuCommand','onOpenFile','rendererReady'
  ]) assert.equal(typeof browserApi[method],'function',`${method} must be callable`);
});

test('web build is separate from Electron and has a Vite/PWA entrypoint',()=>{
  assert.equal(pkg.version,'1.1.5');
  assert.match(pkg.scripts['build:pwa'],/vite build --config vite.web.config.mjs/);
  const html=read('web/index.html');
  assert.match(html,/src="\.\.\/src\/web-entry\.js"/);
  assert.match(html,/rel="manifest"/);
  for(const id of ['web-new-project','web-open-folder','web-import-folder','web-import-zip','web-export-zip'])assert.match(html,new RegExp(`id="${id}"`));
  const entry=read('src/web-entry.js');
  assert.match(entry,/window\.slate = browserApi/);
  assert.match(entry,/await import\('\.\/main\.js'\)/);
  const plugin=read('vite.web.config.mjs');
  assert.match(plugin,/caches\.open\(VERSION\)/);
  assert.match(plugin,/sw\.js/);
});
test('web adapter supports offline session and browser filesystem operations',()=>{
  const adapter=read('web/browser-api.js');
  for(const method of ['getSession','setSession','chooseFolder','scanFolder','readFile','saveFile','saveAsDialog','renameEntry','moveEntry','deleteEntry','searchProject','completePath','importDirectory','importZip','exportProject','newWorkspace'])
    assert.match(adapter,new RegExp(`\\b${method}\\b`));
  assert.match(read('web/storage.js'),/indexedDB\.open/);
  assert.match(read('src/main.js'),/api\.platform === 'web'/);
  assert.match(adapter,/allEntries\.some\(e=>e\.path===dest\) \|\| await nativeExists\(dest\)/);
});
test('PWA has icon assets and root-scoped offline shell',()=>{
  assert.match(read('web/manifest.webmanifest'),/"display": "standalone"/);
  for(const size of [192,512]) {
    const data=fs.readFileSync(path.join(root,`assets/icons/${size}x${size}.png`));
    assert.equal(data.readUInt32BE(16),size);
  }
  assert.match(read('vite.web.config.mjs'),/self\.addEventListener\('fetch'/);
});
test('browser ZIP round trips text and blocks path traversal',async()=>{
  const {writeZip,readZip,safeArchivePath}=await import('../web/zip.js');
  assert.equal(safeArchivePath('../evil.js'),false);
  assert.equal(safeArchivePath('/etc/passwd'),false);
  assert.equal(safeArchivePath('assets/main.js'),true);
  const input=[{name:'src/index.js',content:'const x = "olá";\n'},{name:'README.md',content:'# Test\n'},{name:'image.png',content:new Uint8Array([137,80,78,71,0,1,2])}];
  const blob=writeZip(input);
  assert.equal(blob.type,'application/zip');
  assert.deepEqual(await readZip(blob),input);
  assert.throws(()=>writeZip([{name:'../../bad',content:'a'}]),/Invalid ZIP/);
});

test('individual web downloads preserve the filename and unsaved UTF-8 content', async t => {
  const {browserApi} = await import('../web/browser-api.js');
  let blob, clicked = false, attached = false, removed = false;
  const anchor = {click() { clicked = true; }, remove() { removed = true; }};
  t.mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:download-test'; });
  t.mock.method(globalThis, 'setTimeout', () => 0);
  const original = globalThis.document;
  globalThis.document = {createElement:() => anchor, body:{append() { attached = true; }}};
  t.after(() => { if (original === undefined) delete globalThis.document; else globalThis.document = original; });
  browserApi.downloadFile('example.php', '<?php echo "Olá 🎲";');
  assert.equal(anchor.download, 'example.php');
  assert.equal(anchor.href, 'blob:download-test');
  assert.equal(await blob.text(), '<?php echo "Olá 🎲";');
  assert.ok(clicked && attached && removed);
  assert.throws(() => browserApi.downloadFile('../escape.txt', 'text'), /Invalid file/);
  assert.equal(browserApi.startPreview, undefined);
  assert.equal(browserApi.stopPreview, undefined);
});

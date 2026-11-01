'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {LivePreview, openBrowser} = require('../electron/live-preview.cjs');
async function fixture(t, hostVisible = false) {
  const root = await fs.mkdtemp(path.join(hostVisible ? path.resolve(__dirname, '..') : os.tmpdir(), 'jotta-preview-test-'));
  const preview = new LivePreview();
  t.after(async () => { await preview.stop(); await fs.rm(root, {recursive:true, force:true}); });
  await fs.writeFile(path.join(root, 'index.html'), '<html><body>Saved</body></html>');
  await fs.writeFile(path.join(root, 'style.css'), 'body {color: red}');
  return {root, preview, entry:path.join(root, 'index.html')};
}
test('preview serves unsaved HTML and CSS without modifying the project', async t => {
  const {root, preview, entry} = await fixture(t);
  const url = await preview.start({root, entry, buffers:[{path:entry, content:'<body>Unsaved</body>'}, {path:path.join(root,'style.css'), content:'body {color: blue}'}]});
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Unsaved/); assert.match(html, /EventSource/);
  const css = await fetch(new URL('style.css', url));
  assert.match(await css.text(), /blue/);
  assert.match(await fs.readFile(entry, 'utf8'), /Saved/);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const rootAsset = await fetch(new URL('/style.css', url), {headers:{cookie}});
  assert.equal(rootAsset.status, 200);
  assert.equal((await fetch(new URL('/style.css', url))).status, 403);
});
test('buffer edits notify a live browser and disk changes are detected', async t => {
  const {root, preview, entry} = await fixture(t);
  const url = await preview.start({root, entry});
  await fetch(url);
  const events = await fetch(new URL('__jotta_events', url));
  const reader = events.body.getReader();
  await reader.read();
  preview.update([{path:entry, content:'<body>Changed</body>'}]);
  assert.match(new TextDecoder().decode((await reader.read()).value), /data: reload/);
  assert.match(await (await fetch(url)).text(), /Changed/);
  preview.update([]); await reader.read();
  await fs.writeFile(entry, '<body>Changed on disk with another length</body>');
  await preview.checkDisk();
  assert.match(new TextDecoder().decode((await reader.read()).value), /data: reload/);
  await reader.cancel();
});
test('preview rejects outside files, symlink escapes, dotfiles, and foreign origins', async t => {
  const {root, preview, entry} = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'jotta-outside-'));
  t.after(() => fs.rm(outside, {recursive:true, force:true}));
  await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
  await fs.writeFile(path.join(outside, 'secret.php'), '<?php echo \"secret\";');
  await fs.symlink(outside, path.join(root, 'escape'), 'dir');
  await fs.writeFile(path.join(root, '.env'), 'secret');
  const url = await preview.start({root, entry, buffers:[{path:path.join(root, 'escape', 'secret.php'), content:'<?php dirty'}]});
  assert.equal((await fetch(new URL('escape/secret.php', url))).status, 403);
  assert.equal((await fetch(new URL('escape/secret.txt', url))).status, 403);
  assert.equal((await fetch(new URL('.env', url))).status, 403);
  assert.equal((await fetch(url, {headers:{Origin:'https://example.com'}})).status, 403);
  await assert.rejects(preview.start({root, entry:path.join(outside, 'secret.txt')}), /inside/);
});
test('untitled HTML can be previewed and updated without a saved file', async t => {
  const preview = new LivePreview(); t.after(() => preview.stop());
  const url = await preview.start({root:null, entry:null, buffers:[{path:null, content:'<body>Untitled</body>'}]});
  assert.match(await (await fetch(url)).text(), /Untitled/);
  preview.update([{path:null, content:'<body>Still unsaved</body>'}]);
  assert.match(await (await fetch(url)).text(), /Still unsaved/);
});
test('default browser uses the system launcher and invalid choices fail', async () => {
  let opened;
  await openBrowser('http://127.0.0.1:1234', 'default', {openExternal:async url => {opened=url;}});
  assert.equal(opened, 'http://127.0.0.1:1234');
  await assert.rejects(openBrowser('http://127.0.0.1:1234', 'bad', {}), /Invalid/);
});

test('PHP previews proxy requests, preserve responses, reload HTML and stop the runtime', async t => {
  const {spawn} = require('node:child_process');
  const {root, entry} = await fixture(t);
  let child;
  const preview = new LivePreview({spawnProcess(command, args, options) {
    assert.ok(args.includes('-S'));
    assert.ok(args.includes(root));
    const address = args[args.indexOf('-S') + 1];
    child = spawn(process.execPath, ['-e', `
      const http = require('node:http');
      const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          if (req.url.includes('json')) {
            res.writeHead(201, {'Content-Type':'application/json'});
            return res.end(JSON.stringify({url:req.url, body}));
          }
          if (req.url.includes('empty-error')) { res.writeHead(500); return res.end(); }
          if (req.url.includes('explicit-error')) { res.writeHead(500, {'Content-Type':'text/html'}); return res.end('<p>Missing required PHP extension</p>'); }
          if (req.url.includes('redirect')) { res.writeHead(302, {Location:'/index.php'}); return res.end(); }
          res.writeHead(200, {'Content-Type':'text/html; charset=UTF-8', 'Set-Cookie':'PHPSESSID=example; Path=/'});
          res.end('<body>Executed PHP</body>');
        });
      });
      server.listen(${Number(address.split(':')[1])}, '127.0.0.1', () => process.stderr.write('PHP Development Server (http://127.0.0.1) started\\n'));
    `], options);
    return child;
  }});
  t.after(() => preview.stop());
  const php = path.join(root, 'index.php');
  await fs.writeFile(php, '<?php echo "Saved PHP";');
  const url = await preview.start({root, entry:php, buffers:[{path:php, content:'<?php UNSAVED SOURCE'}]});
  const response = await fetch(url);
  const html = await response.text();
  assert.match(html, /Executed PHP/);
  assert.match(html, /EventSource/);
  assert.doesNotMatch(html, /UNSAVED SOURCE/);
  assert.match(response.headers.get('set-cookie'), /jotta_preview=/);
  assert.match(response.headers.get('set-cookie'), /PHPSESSID=/);
  const json = await fetch(url + '?json=yes', {method:'POST', body:'name=Jotta', headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  assert.equal(json.status, 201);
  assert.deepEqual(await json.json(), {url:'/index.php?json=yes', body:'name=Jotta'});
  const redirect = await fetch(url + '?redirect=yes', {redirect:'manual'});
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/index.php');
  const emptyError = await fetch(url + '?empty-error=yes');
  assert.equal(emptyError.status, 500);
  assert.match(await emptyError.text(), /PHP returned HTTP 500/);
  const explicitError = await fetch(url + '?explicit-error=yes');
  assert.equal(explicitError.status, 500);
  assert.match(await explicitError.text(), /Missing required PHP extension/);
  const folder = await fetch(new URL('./', url));
  // index.html remains preferred when both entry points exist.
  assert.match(await folder.text(), /Saved/);
  await fs.unlink(entry);
  assert.match(await (await fetch(new URL('./', url))).text(), /Executed PHP/);
  let reloads = 0;
  preview.reload = () => reloads++;
  await fs.writeFile(php, '<?php echo "Changed saved PHP";');
  await preview.checkDisk();
  assert.equal(reloads, 1);
  await preview.stop();
  assert.notEqual(child.exitCode === null && child.signalCode === null, true);
});

test('missing PHP fails clearly without leaking source or leaving a running preview', async t => {
  const {spawn} = require('node:child_process');
  const {root, entry} = await fixture(t);
  const preview = new LivePreview({spawnProcess() { return spawn(path.join(root, 'missing-php'), []); }});
  t.after(() => preview.stop());
  const php = path.join(root, 'index.php');
  await fs.writeFile(php, '<?php echo "private source";');
  await assert.rejects(preview.start({root, entry:php}), /Install PHP/);
  assert.equal(preview.server, null);
  const url = await preview.start({root, entry});
  const response = await fetch(new URL('index.php', url));
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Install PHP/);
});

test('installed PHP executes includes and query strings from saved project files', async t => {
  const {spawnSync} = require('node:child_process');
  const {serverSpawnSpec} = require('../electron/lsp.cjs');
  const spec = serverSpawnSpec(['php', '-v'], null);
  if (spawnSync(spec.executable, spec.args).status !== 0) { t.skip('PHP is not installed'); return; }
  const {root, preview} = await fixture(t, Boolean(process.env.FLATPAK_ID));
  const entry = path.join(root, 'index.php');
  await fs.writeFile(path.join(root, 'message.php'), '<?php $message = "Rendered";');
  await fs.writeFile(entry, '<?php require __DIR__ . "/message.php"; echo "<body>" . $message . ":" . $_GET["name"] . "</body>";');
  const url = await preview.start({root, entry});
  const html = await (await fetch(url + '?name=Jotta')).text();
  assert.match(html, /Rendered:Jotta/);
  assert.match(html, /EventSource/);
  assert.doesNotMatch(html, /<\?php/);
  await fs.writeFile(path.join(root, 'broken.php'), '<?php require __DIR__ . \"/not-present.php\";');
  const broken = await (await fetch(new URL('broken.php', url))).text();
  assert.match(broken, /Fatal error|Uncaught Error/);
  assert.match(broken, /not-present\.php/);
});

test('PHP startup failures retain stderr details', async t => {
  const {spawn} = require('node:child_process');
  const {root} = await fixture(t);
  const preview = new LivePreview({spawnProcess(_command, _args, options) {
    return spawn(process.execPath, ['-e', 'process.stderr.write("Failed to listen: Address already in use\\n"); process.exitCode = 1;'], options);
  }});
  t.after(() => preview.stop());
  await assert.rejects(preview.start({root, entry:path.join(root, 'index.php')}), /Failed to listen: Address already in use/);
  assert.equal(preview.phpChild, null);
});

test('preview IPC errors reach the renderer without the remote method wrapper', async () => {
  const vm = require('node:vm');
  let api;
  let result = {error:'PHP was not found. Install PHP on your system.'};
  const context = {
    require() { return {
      contextBridge:{exposeInMainWorld(_name, value) { api = value; }},
      ipcRenderer:{invoke:async () => result}
    }; }
  };
  vm.runInNewContext(await fs.readFile(path.join(__dirname, '../electron/preload.cjs'), 'utf8'), context);
  await assert.rejects(api.startPreview({}), error => error.message === result.error);
  result = 'http://127.0.0.1:1234/token/index.php';
  assert.equal(await api.startPreview({}), result);
});

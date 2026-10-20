'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const os = require('node:os');
const net = require('node:net');
const { serverSpawnSpec } = require('./lsp.cjs');
const TYPES = { '.html':'text/html', '.htm':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.mp4':'video/mp4', '.webm':'video/webm', '.wasm':'application/wasm' };
const within = (root, file) => file === root || file.startsWith(root + path.sep);
class LivePreview {
  constructor({spawnProcess = spawn} = {}) { this.spawnProcess = spawnProcess; this.buffers = new Map(); this.clients = new Set(); this.tracked = new Map(); }
  async start({root, entry, buffers = []}) {
    await this.stop();
    if (!root) { this.temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jotta-preview-')); root = this.temporaryRoot; }
    if (!entry) { entry = path.join(root, '__untitled_preview__.html'); this.virtualEntry = entry; }
    if (!path.isAbsolute(root) || !path.isAbsolute(entry)) throw new Error('Preview requires a project folder and an HTML or PHP file');
    this.root = path.resolve(root);
    this.realRoot = await fs.realpath(root);
    this.entry = path.resolve(entry);
    if (!within(this.root, this.entry)) throw new Error('Preview file must be inside the project folder');
    if (/\.php$/i.test(this.entry)) {
      try { await this.startPhp(); } catch (error) { await this.stop(); throw error; }
    }
    this.token = randomBytes(24).toString('hex');
    this.update(buffers);
    this.server = http.createServer((req, res) => { this.serve(req, res).catch(() => { if (!res.headersSent) res.writeHead(404); res.end('File not found'); }); });
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve); });
    this.origin = `http://127.0.0.1:${this.server.address().port}`;
    this.timer = setInterval(() => this.checkDisk(), 700);
    return `${this.origin}/${this.token}/${path.relative(this.root, this.entry).split(path.sep).map(encodeURIComponent).join('/')}`;
  }
  update(buffers) {
    const next = new Map();
    for (let item of buffers) {
      if (item.path === null && this.virtualEntry) item = {...item, path: this.virtualEntry};
      if (typeof item.path !== 'string' || typeof item.content !== 'string' || Buffer.byteLength(item.content) > 5 * 1024 * 1024) continue;
      const file = path.resolve(item.path);
      if (within(this.root, file)) next.set(file, item.content);
    }
    const changed = next.size !== this.buffers.size || [...next].some(([file, text]) => this.buffers.get(file) !== text);
    this.buffers = next;
    if (changed) this.reload();
  }
  reload() { for (const client of this.clients) client.write('data: reload\n\n'); }
  async checkDisk() {
    if (this.checking) return;
    this.checking = true;
    try {
      let changed = false;
      for (const [file, previous] of this.tracked) {
        const stamp = await this.stamp(file);
        if (stamp !== previous) { this.tracked.set(file, stamp); if (!this.buffers.has(file) || /\.php$/i.test(file)) changed = true; }
      }
      if (changed) this.reload();
    } finally { this.checking = false; }
  }
  async stamp(file) { try { const stat = await fs.stat(file); return `${stat.mtimeMs}:${stat.size}`; } catch { return 'missing'; } }
  async serve(req, res) {
    const host = `127.0.0.1:${this.server.address().port}`;
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) { res.writeHead(403); return res.end(); }
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
    const prefix = `/${this.token}/`;
    // A cookie allows root-relative project assets while keeping the server private.
    const authorized = pathname.startsWith(prefix) || (req.headers.cookie || '').split(';').some(c => c.trim() === `jotta_preview=${this.token}`);
    if (!authorized) { res.writeHead(403); return res.end(); }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', `jotta_preview=${this.token}; Path=/; HttpOnly; SameSite=Strict`);
    const relative = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname.slice(1);
    if (relative === '__jotta_events') {
      res.writeHead(200, {'Content-Type':'text/event-stream', 'Connection':'keep-alive'});
      res.write(': connected\n\n'); this.clients.add(res);
      req.on('close', () => this.clients.delete(res)); return;
    }
    let file = path.resolve(this.root, relative || '.');
    if (!within(this.root, file) || path.relative(this.root, file).split(path.sep).some(p => p.startsWith('.'))) { res.writeHead(403); return res.end(); }
    if ((await fs.stat(file).catch(() => null))?.isDirectory()) {
      const index = (await fs.stat(path.join(file, 'index.html')).catch(() => null)) ? 'index.html' : 'index.php';
      file = path.join(file, index);
    }
    const real = await fs.realpath(file).catch(() => file);
    if (!within(this.realRoot, real) && (!this.buffers.has(file) || /\.php$/i.test(file))) { res.writeHead(403); return res.end(); }
    this.tracked.set(file, await this.stamp(file));
    if (/\.php$/i.test(file)) {
      try { await this.startPhp(); } catch (error) { res.writeHead(503, {'Content-Type':'text/plain; charset=utf-8'}); return res.end(error.message); }
      return this.servePhp(req, res, file);
    }
    if (req.method === 'POST') { res.writeHead(405); return res.end(); }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    let data = this.buffers.has(file) ? Buffer.from(this.buffers.get(file)) : await fs.readFile(file);
    if (type === 'text/html') {
      const script = `<script>(()=>{const events=new EventSource('/${this.token}/__jotta_events');events.onmessage=()=>location.reload();})();</script>`;
      const html = data.toString('utf8');
      data = Buffer.from(/<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, script + '</body>') : html + script);
    }
    res.writeHead(200, {'Content-Type': /^(text\/|application\/json|image\/svg)/.test(type) ? type + '; charset=utf-8' : type, 'X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  }
  async startPhp() {
    if (this.phpReady) return this.phpReady;
    this.phpReady = this.launchPhp();
    try { await this.phpReady; } catch (error) { this.phpReady = null; throw error; }
  }
  async launchPhp() {
    const reservation = net.createServer();
    await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
    this.phpPort = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const spec = serverSpawnSpec(['php', '-d', 'display_errors=1', '-d', 'display_startup_errors=1', '-d', 'error_reporting=-1', '-S', `127.0.0.1:${this.phpPort}`, '-t', this.root], this.root);
    const child = this.spawnProcess(spec.executable, spec.args, {cwd:this.root, windowsHide:true, stdio:['ignore', 'ignore', 'pipe']});
    this.phpChild = child;
    await new Promise((resolve, reject) => {
      let output = '';
      const failure = reason => {
        const detail = output.trim() || reason || 'No startup details were reported.';
        const missing = /ENOENT|execvp.*php|php.*(?:not found|No such file)/i.test(detail);
        const message = missing
          ? 'PHP was not found. Install PHP on your system and ensure php is on PATH.'
          : 'PHP preview could not start.';
        return new Error(`${message}${spec.host ? ' Flatpak previews use PHP installed on the host.' : ''}\n\n${detail}`);
      };
      const timer = setTimeout(() => { child.kill(); reject(failure('PHP did not become ready within 5 seconds.')); }, 5000);
      child.stderr.on('data', chunk => {
        output = (output + chunk.toString()).slice(-8192);
        if (/Development Server .*started/i.test(output)) { clearTimeout(timer); resolve(); }
      });
      child.once('error', error => { clearTimeout(timer); if (this.phpChild === child) this.phpChild = null; reject(failure(error.message)); });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        if (this.phpChild === child) { this.phpChild = null; this.phpReady = null; }
        reject(failure(`PHP exited with ${signal ? 'signal ' + signal : 'code ' + code}.`));
      });
    });
  }
  async servePhp(req, res, file) {
    const requestUrl = new URL(req.url, this.origin);
    const pathname = '/' + path.relative(this.root, file).split(path.sep).map(encodeURIComponent).join('/');
    await new Promise((resolve, reject) => {
      const headers = {...req.headers, 'accept-encoding':'identity'};
      const upstream = http.request({hostname:'127.0.0.1', port:this.phpPort, path:pathname + requestUrl.search, method:req.method, headers}, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          let data = Buffer.concat(chunks);
          const outgoing = {...response.headers};
          delete outgoing['content-length']; delete outgoing['transfer-encoding']; delete outgoing.connection;
          // Keep authentication when PHP also sets session cookies.
          outgoing['set-cookie'] = [res.getHeader('Set-Cookie'), ...(outgoing['set-cookie'] || [])];
          outgoing['cache-control'] = 'no-store';
          if (response.statusCode >= 400 && req.method !== 'HEAD' && !data.toString('utf8').trim()) {
            outgoing['content-type'] = 'text/html; charset=utf-8';
            delete outgoing['content-encoding'];
            data = Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><title>PHP preview error</title></head><body><h1>PHP returned HTTP ${response.statusCode}</h1><p>The PHP page failed without returning any content. Check its required files, PHP extensions and database configuration.</p></body></html>`);
          }
          if (/^text\/html\b/i.test(outgoing['content-type'] || '') && !outgoing['content-encoding']) {
            data = Buffer.concat([data, Buffer.from(`<script>(()=>{const events=new EventSource('/${this.token}/__jotta_events');events.onmessage=()=>location.reload();})();</script>`)]);
          }
          res.writeHead(response.statusCode, outgoing);
          res.end(req.method === 'HEAD' ? undefined : data);
          resolve();
        });
      });
      upstream.setTimeout(30000, () => upstream.destroy(new Error('PHP preview timed out')));
      upstream.on('error', reject);
      req.pipe(upstream);
    });
  }
  async stop() {
    clearInterval(this.timer);
    if (this.phpChild) {
      const child = this.phpChild; this.phpChild = null;
      await new Promise(resolve => { child.once('close', resolve); child.kill(); });
    }
    this.phpReady = null;
    for (const client of this.clients) client.end();
    this.clients.clear(); this.tracked.clear(); this.buffers.clear();
    const server = this.server; this.server = null;
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    this.virtualEntry = null;
    if (this.temporaryRoot) { await fs.rm(this.temporaryRoot, {recursive:true, force:true}); this.temporaryRoot = null; }
  }
}
function execute(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {windowsHide:true, detached:true, stdio:'ignore'});
    const timer = setTimeout(() => { child.unref(); resolve(); }, 500);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Browser launch failed')); });
  });
}
async function openBrowser(url, browser, shell) {
  if (browser === 'default') return shell.openExternal(url);
  if (!['firefox', 'chrome'].includes(browser)) throw new Error('Invalid preview browser');
  let candidates;
  if (process.platform === 'darwin') return execute('open', ['-a', browser === 'firefox' ? 'Firefox' : 'Google Chrome', url]);
  if (process.platform === 'win32') {
    const dirs = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    candidates = dirs.map(dir => path.join(dir, browser === 'firefox' ? 'Mozilla Firefox/firefox.exe' : 'Google/Chrome/Application/chrome.exe'));
  } else candidates = browser === 'firefox' ? ['firefox'] : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const executable of candidates) {
    try { await execute(process.env.FLATPAK_ID ? 'flatpak-spawn' : executable, process.env.FLATPAK_ID ? ['--host', executable, url] : [url]); return; } catch { /* try next installed browser */ }
  }
  throw new Error(`${browser === 'firefox' ? 'Firefox' : 'Chrome'} could not be opened. Install it or choose System default in Preferences.`);
}
module.exports = { LivePreview, openBrowser };

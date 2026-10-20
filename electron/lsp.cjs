'use strict';
/** Minimal stdio LSP client. Third-party servers are optional and installed by the user. */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEFAULT_SERVERS = Object.freeze({
  python: ['pylsp'],
  php: ['intelephense', '--stdio'],
  go: ['gopls', 'serve'],
  rust: ['rust-analyzer'],
  c: ['clangd', '--background-index'],
  cpp: ['clangd', '--background-index'],
  ruby: ['solargraph', 'stdio'],
  lua: ['lua-language-server']
});

// Flatpak isolates /usr/bin. Run optional user-installed LSP binaries on the
// host when the app has explicit org.freedesktop.Flatpak DBus permission.
// This permits host command execution and is explained in README.md.
function serverSpawnSpec(command, root, flatpakId = process.env.FLATPAK_ID) {
  if (flatpakId) return {
    executable: 'flatpak-spawn',
    args: ['--host', ...(root ? [`--directory=${root}`] : []), ...command],
    host: true
  };
  return { executable: command[0], args: command.slice(1), host: false };
}

class LspProcess {
  constructor(command, root) {
    this.command = command;
    this.root = root;
    this.child = null;
    this.pending = new Map();
    this.sequence = 0;
    this.buffer = Buffer.alloc(0);
    this.documents = new Map();
    this.dead = false;
    this.closed = false;
    this.ready = null;
  }
  start() {
    const cwd = this.root && fs.existsSync(this.root) ? this.root : process.cwd();
    const spec = serverSpawnSpec(this.command, this.root && fs.existsSync(this.root) ? this.root : null);
    this.child = spawn(spec.executable, spec.args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
    });
    this.child.stdout.on('data', chunk => this.parse(chunk));
    this.child.stderr.on('data', () => {});
    this.child.on('error', error => this.fail(error));
    this.child.on('close', () => { this.closed = true; this.fail(new Error('Language server exited')); });
    const rootUri = this.root ? pathToFileURL(this.root).toString() : null;
    this.ready = this.request('initialize', {
      processId: process.env.FLATPAK_ID ? null : process.pid, rootUri, rootPath: this.root,
      workspaceFolders: this.root ? [{ uri: rootUri, name: path.basename(this.root) }] : null,
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false },
          completion: { completionItem: { snippetSupport: true, documentationFormat: ['plaintext', 'markdown'] } }
        },
        workspace: { workspaceFolders: true }
      },
      clientInfo: { name: 'Jotta Edit', version: require('../package.json').version }
    }, 7500).then(() => { this.notify('initialized', {}); return true; });
    return this.ready;
  }
  send(obj) {
    if (this.dead || !this.child || this.child.stdin.destroyed) throw new Error('Language server unavailable');
    const json = JSON.stringify(obj);
    const body = Buffer.from(json, 'utf8');
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.child.stdin.write(body);
  }
  notify(method, params) { this.send({ jsonrpc: '2.0', method, params }); }
  request(method, params, timeoutMs = 4500) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ jsonrpc: '2.0', id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  parse(chunk) {
    if (this.dead) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const length = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(header);
      if (!length) { this.fail(new Error('Invalid LSP response header')); return; }
      const n = Number(length[1]);
      if (!Number.isSafeInteger(n) || n < 0 || n > 16 * 1024 * 1024) { this.fail(new Error('LSP message too large')); return; }
      const end = headerEnd + 4 + n;
      if (this.buffer.length < end) return;
      const bytes = this.buffer.subarray(headerEnd + 4, end);
      this.buffer = this.buffer.subarray(end);
      try { this.message(JSON.parse(bytes.toString('utf8'))); } catch { /* malformed LSP packet */ }
    }
  }
  message(message) {
    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const task = this.pending.get(message.id);
      clearTimeout(task.timer); this.pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message || 'LSP error'));
      else task.resolve(message.result);
    } else if (typeof message.id !== 'undefined' && message.method) {
      // Accept optional server-to-client requests without hanging the server.
      try { this.send({ jsonrpc: '2.0', id: message.id, result: null }); } catch { /* shutting down */ }
    }
  }
  fail(error) {
    if (this.dead) return;
    this.dead = true;
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(error); }
    this.pending.clear();
    if (this.child && !this.child.killed) this.child.kill();
  }
  async complete(file, lang, content, line, column) {
    await this.ready;
    const uri = pathToFileURL(file).toString();
    const existing = this.documents.get(uri);
    if (!existing) {
      this.documents.set(uri, { text: content, version: 1 });
      this.notify('textDocument/didOpen', { textDocument: { uri, languageId: lang, version: 1, text: content } });
    } else if (existing.text !== content) {
      existing.text = content; existing.version++;
      this.notify('textDocument/didChange', {
        textDocument: { uri, version: existing.version },
        contentChanges: [{ text: content }]
      });
    }
    const result = await this.request('textDocument/completion', {
      textDocument: { uri }, position: { line: line - 1, character: column - 1 },
      context: { triggerKind: 1 }
    });
    return Array.isArray(result) ? result : (result?.items || []);
  }
  stop() { this.fail(new Error('Shutting down')); }
  async shutdown() {
    const child = this.child;
    if (!child || this.closed) { this.stop(); return; }
    // On Windows, kill() is asynchronous. Wait for close (including stdio
    // pipes) before releasing a temp directory used as cwd by the server.
    const closed = new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
      child.once('close', finish);
      const timer = setTimeout(finish, 5000);
      // Keep the timeout active: the caller must await shutdown before rm.
    });
    this.stop();
    await closed;
  }
}

class LspBridge {
  constructor(configDirectory) {
    this.configDirectory = configDirectory;
    this.processes = new Map();
    this.config = null;
  }
  servers() {
    if (this.config) return this.config;
    this.config = { ...DEFAULT_SERVERS };
    try {
      const configured = JSON.parse(fs.readFileSync(path.join(this.configDirectory, 'lsp.json'), 'utf8'));
      if (configured && typeof configured === 'object') {
        for (const [lang, command] of Object.entries(configured)) {
          if (command === false) delete this.config[lang];
          else if (Array.isArray(command) && command.length && command.every(x => typeof x === 'string' && x.length)) this.config[lang] = command;
        }
      }
    } catch { /* optional config file */ }
    return this.config;
  }
  async complete({ root, file, lang, content, line, column }) {
    if (!this.servers()[lang] || !file || !path.isAbsolute(file) || typeof content !== 'string' || content.length > 1e6) return [];
    const command = this.servers()[lang];
    const key = `${lang}:${root || ''}`;
    let instance = this.processes.get(key);
    if (!instance) {
      instance = new LspProcess(command, root && path.isAbsolute(root) ? root : null);
      this.processes.set(key, instance);
      try { await instance.start(); }
      catch { instance.stop(); return []; }
    }
    if (instance.dead) return [];
    try { return (await instance.complete(file, lang, content, line, column)).slice(0, 200); }
    catch { return []; }
  }
  stop() { for (const instance of this.processes.values()) instance.stop(); }
  async shutdown() { await Promise.all([...this.processes.values()].map(instance => instance.shutdown())); this.processes.clear(); }
}
module.exports = { LspBridge, LspProcess, serverSpawnSpec };

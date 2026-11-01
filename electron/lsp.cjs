'use strict';
/** Minimal stdio LSP client. Third-party servers are optional and installed by the user. */
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

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
  constructor(command, root, {diagnostics=()=>{},status=()=>{}}={}) {
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
    this.killTimer=null;this.detached=false;
    this.onDiagnostics=diagnostics;this.onStatus=status;this.capabilities={};
  }
  start() {
    const cwd = this.root && fs.existsSync(this.root) ? this.root : process.cwd();
    const spec = serverSpawnSpec(this.command, this.root && fs.existsSync(this.root) ? this.root : null);
    this.detached=process.platform!=='win32'&&!spec.host;
    this.child = spawn(spec.executable, spec.args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,detached:this.detached
    });
    this.child.stdout.on('data', chunk => this.parse(chunk));
    this.child.stdin.on('error',error=>this.fail(error));
    this.child.stderr.on('data', () => {});
    this.child.on('error', error => this.fail(error));
    this.child.on('close', () => { this.closed = true;clearTimeout(this.killTimer);this.fail(new Error('Language server exited')); });
    const rootUri = this.root ? pathToFileURL(this.root).toString() : null;
    this.ready = this.request('initialize', {
      processId: process.env.FLATPAK_ID ? null : process.pid, rootUri, rootPath: this.root,
      workspaceFolders: this.root ? [{ uri: rootUri, name: path.basename(this.root) }] : null,
      capabilities: {
        general:{positionEncodings:['utf-16']},
        textDocument: {
          synchronization: { dynamicRegistration: false },
          publishDiagnostics: { versionSupport:true },
          definition: { linkSupport:true },
          completion: { completionItem: { snippetSupport: true, documentationFormat: ['plaintext', 'markdown'] } }
        },
        workspace: { workspaceFolders: true,workspaceEdit:{documentChanges:true,resourceOperations:[],failureHandling:'abort'} }
      },
      clientInfo: { name: 'Jotta Edit', version: require('../package.json').version }
    }, 7500).then(result => {
      this.capabilities=result?.capabilities||{};
      if(this.capabilities.positionEncoding&&this.capabilities.positionEncoding!=='utf-16')throw new Error('Language server requires an unsupported position encoding.');
      this.notify('initialized', {});this.onStatus('Running');return true;
    });
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
    } else if (message.method==='textDocument/publishDiagnostics') {
      const {uri,version,diagnostics}=message.params||{},document=this.documents.get(uri);
      if(document&&Array.isArray(diagnostics)&&(version===undefined||version===document.version)){
        document.diagnostics=diagnostics.slice(0,1000);
        this.onDiagnostics({file:fileURLToPath(uri),lang:document.lang,version:document.clientVersion,diagnostics:diagnostics.slice(0,1000)});
      }
    } else if (typeof message.id !== 'undefined' && message.method) {
      // Accept optional server-to-client requests without hanging the server.
      try { this.send({ jsonrpc: '2.0', id: message.id, result: null }); } catch { /* shutting down */ }
    }
  }
  fail(error) {
    if (this.dead) return;
    this.dead = true;
    this.onStatus(error.message);
    for(const [uri,document] of this.documents)this.onDiagnostics({file:fileURLToPath(uri),lang:document.lang,version:document.clientVersion,diagnostics:[]});
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(error); }
    this.pending.clear();
    if (this.child && !this.closed) {
      // EOF reaches host launchers too. A TERM request alone is not proof that
      // the process (or a child retaining its stdio pipes) has actually exited.
      this.child.stdin.end();this.terminate('SIGTERM');
      this.killTimer=setTimeout(()=>{if(!this.closed)this.terminate('SIGKILL');},1000);
      this.killTimer.unref();
    }
  }
  terminate(signal){
    const child=this.child;if(!child)return;
    if(this.detached&&child.pid){try{process.kill(-child.pid,signal);return;}catch{ /* The group may already have exited. */ }}
    try{child.kill(signal);}catch{ /* Already stopped or inaccessible. */ }
  }
  async sync(file, lang, content, clientVersion) {
    await this.ready;
    const uri = pathToFileURL(file).toString();
    const existing = this.documents.get(uri);
    if (!existing) {
      this.documents.set(uri, { text: content, version: 1,clientVersion,lang });
      this.notify('textDocument/didOpen', { textDocument: { uri, languageId: lang, version: 1, text: content } });
    } else if (existing.text !== content) {
      const lines=existing.text.split('\n'),end={line:lines.length-1,character:lines.at(-1).length};
      existing.text = content; existing.version++;existing.clientVersion=clientVersion;delete existing.diagnostics;
      const sync=this.capabilities.textDocumentSync;
      const kind=typeof sync==='object'?sync.change:sync;
      this.notify('textDocument/didChange', {
        textDocument: { uri, version: existing.version },
        contentChanges: [{...(kind===2?{range:{start:{line:0,character:0},end}}:{}),text: content }]
      });
    } else {
      existing.clientVersion=clientVersion;
      if(existing.diagnostics)this.onDiagnostics({file,lang:existing.lang,version:clientVersion,diagnostics:existing.diagnostics});
    }
    return uri;
  }
  close(file){
    const uri=pathToFileURL(file).toString(),document=this.documents.get(uri);
    if(!document)return;
    this.documents.delete(uri);
    if(!this.dead)this.notify('textDocument/didClose',{textDocument:{uri}});
    this.onDiagnostics({file,lang:document.lang,version:document.clientVersion,diagnostics:[]});
  }
  async complete(file, lang, content, line, column, version) {
    const uri=await this.sync(file,lang,content,version);
    const result = await this.request('textDocument/completion', {
      textDocument: { uri }, position: { line: line - 1, character: column - 1 },
      context: { triggerKind: 1 }
    });
    return Array.isArray(result) ? result : (result?.items || []);
  }
  async definition(params){
    const uri=await this.sync(params.file,params.lang,params.content,params.version);
    if(!this.capabilities.definitionProvider)return [];
    const result=await this.request('textDocument/definition',{textDocument:{uri},position:{line:params.line-1,character:params.column-1}});
    return (Array.isArray(result)?result:result?[result]:[]).slice(0,100).map(item=>({
      file:fileURLToPath(item.targetUri||item.uri),range:item.targetSelectionRange||item.range
    }));
  }
  async rename(params){
    const uri=await this.sync(params.file,params.lang,params.content,params.version);
    if(!this.capabilities.renameProvider)throw new Error('This language server does not support Rename Symbol.');
    const result=await this.request('textDocument/rename',{textDocument:{uri},position:{line:params.line-1,character:params.column-1},newName:params.newName});
    const edits=[];
    for(const [uri,changes] of Object.entries(result?.changes||{}))edits.push({file:fileURLToPath(uri),edits:changes});
    for(const change of result?.documentChanges||[]){
      if(!change.textDocument||!Array.isArray(change.edits))throw new Error('Renaming files is not supported. No changes were applied.');
      const document=this.documents.get(change.textDocument.uri),version=change.textDocument.version;
      if(version!=null&&(!document||document.version!==version))throw new Error('Files changed. Run Rename Symbol again.');
      edits.push({file:fileURLToPath(change.textDocument.uri),edits:change.edits,version:document?.clientVersion});
    }
    if(edits.length>50||edits.some(item=>!Array.isArray(item.edits)||item.edits.length>10000))throw new Error('Rename affects too many files or edits.');
    return edits;
  }
  stop() { this.fail(new Error('Shutting down')); }
  async shutdown() {
    const child = this.child;
    if (!child || this.closed) { this.stop(); return; }
    // Wait for close, including inherited pipes. Never resolve only because a
    // timeout elapsed and leave a live server keeping Node's test runner open.
    let finish;
    const closed = new Promise(resolve => {
      finish=resolve;
      child.once('close', finish);
    });
    if(!this.dead&&this.ready){
      try{await this.request('shutdown',null,750);this.notify('exit');}catch{ /* Fall back to terminating an unresponsive server. */ }
    }
    this.stop();
    let timer;
    try{
      await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(resolve,2500);})]);
      if(!this.closed){
        this.terminate('SIGKILL');
        child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();
        await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,500).unref())]);
        if(!this.closed){child.unref();throw new Error('Language server did not exit after forced shutdown.');}
      }
    }finally{clearTimeout(timer);clearTimeout(this.killTimer);child.removeListener('close',finish);}
  }
}

class LspBridge {
  constructor(configDirectory,{diagnostics=()=>{}}={}) {
    this.configDirectory = configDirectory;
    this.processes = new Map();
    this.config = null;
    this.onDiagnostics=diagnostics;this.statuses=new Map();this.fileEpochs=new Map();
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
  async instance({root,file,lang,content}) {
    if (!this.servers()[lang] || !file || !path.isAbsolute(file) || typeof content !== 'string' || content.length > 1e6) return null;
    const command = this.servers()[lang];
    // C and C++ normally share clangd. Reuse one process so unsaved headers
    // and source files participate in the same project analysis.
    const key = JSON.stringify([command,root||null]);
    let instance = this.processes.get(key);
    if (!instance) {
      instance = new LspProcess(command, root && path.isAbsolute(root) ? root : null,{
        diagnostics:event=>this.onDiagnostics({...event,lang:event.lang||lang,root:instance.root}),status:value=>{
          for(const [id,candidate]of Object.entries(this.servers()))if(JSON.stringify(candidate)===JSON.stringify(command))this.statuses.set(id,value);
        }
      });
      this.processes.set(key, instance);
      try { await instance.start(); }
      catch { instance.stop(); return null; }
    }
    if (instance.dead) return null;
    await instance.ready;
    return instance;
  }
  async documentInstance(params){
    const epoch=this.fileEpochs.get(params.file)||0,instance=await this.instance(params);
    return epoch===(this.fileEpochs.get(params.file)||0)?instance:null;
  }
  async sync(params){const instance=await this.documentInstance(params);if(instance)await instance.sync(params.file,params.lang,params.content,params.version);}
  close(file){this.fileEpochs.set(file,(this.fileEpochs.get(file)||0)+1);for(const instance of this.processes.values())instance.close(file);}
  async definition(params){const instance=await this.documentInstance(params);return instance?instance.definition(params):[];}
  async rename(params){
    if(typeof params.newName!=='string'||!params.newName.trim()||params.newName.length>256||/[\r\n\0]/.test(params.newName))throw new Error('Enter a valid symbol name.');
    const instance=await this.documentInstance(params);if(!instance)throw new Error('Language server unavailable. Check Preferences → Language servers.');
    return instance.rename(params);
  }
  async complete(params) {
    try {const instance=await this.documentInstance(params);return instance?(await instance.complete(params.file,params.lang,params.content,params.line,params.column,params.version)).slice(0,200):[];}
    catch { return []; }
  }
  async configure(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>30)throw new Error('Invalid language servers');
    for(const [lang,command]of Object.entries(value))if(!/^[a-z][a-z0-9_-]{0,59}$/.test(lang)||(command!==false&&(!Array.isArray(command)||!command.length||command.length>50||command.some(part=>typeof part!=='string'||part.length>8192||/[\r\n\0]/.test(part))||!command[0])))throw new Error('Invalid language server command');
    await fs.promises.mkdir(this.configDirectory,{recursive:true});
    const file=path.join(this.configDirectory,'lsp.json');await fs.promises.writeFile(file+'.tmp',JSON.stringify(value,null,2),{mode:0o600});await fs.promises.rename(file+'.tmp',file);
    await this.shutdown();this.config=null;this.statuses.clear();return this.describe();
  }
  async describe(){
    const config=this.servers();
    return Promise.all([...new Set([...Object.keys(DEFAULT_SERVERS),...Object.keys(config)])].map(async lang=>{
      const command=config[lang]||DEFAULT_SERVERS[lang];let available=false;
      if(command)available=await commandAvailable(command[0]);
      return {lang,command:command||[],enabled:Boolean(config[lang]),available,status:this.statuses.get(lang)||''};
    }));
  }
  stop() { for (const instance of this.processes.values()) instance.stop(); }
  async shutdown() { await Promise.all([...this.processes.values()].map(instance => instance.shutdown())); this.processes.clear(); }
}
async function commandAvailable(command){
  if(process.env.FLATPAK_ID)return new Promise(resolve=>execFile('flatpak-spawn',['--host','sh','-c','command -v -- "$1" >/dev/null 2>&1','jotta-lsp',command],{timeout:3000,windowsHide:true},error=>resolve(!error)));
  const suffixes=process.platform==='win32'?(process.env.PATHEXT||'.EXE;.CMD;.BAT;.COM').split(';'):[''];
  const candidates=path.isAbsolute(command)?[command]:command.includes(path.sep)?[]:(process.env.PATH||'').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,command));
  for(const candidate of candidates)for(const suffix of ['',...suffixes])try{
    const file=candidate+suffix;if(!(await fs.promises.stat(file)).isFile())continue;
    await fs.promises.access(file,process.platform==='win32'?fs.constants.F_OK:fs.constants.X_OK);return true;
  }catch{}
  return false;
}
module.exports = { LspBridge, LspProcess, serverSpawnSpec,commandAvailable };

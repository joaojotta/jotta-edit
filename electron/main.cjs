'use strict';
const { app, BrowserWindow, dialog, ipcMain, protocol, net, Menu, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { LivePreview, openBrowser } = require('./live-preview.cjs');
const livePreview = new LivePreview();
const { LspBridge } = require('./lsp.cjs');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { listPathCandidates } = require('./path-completion.cjs');
const { fileArguments } = require('./launch-paths.cjs');
const { normalizeSession, writeSession } = require('./session-store.cjs');
const {GitHubWorkspace} = require('./github-workspace.cjs');
let githubWorkspace;
const githubStore=()=>githubWorkspace ||= new GitHubWorkspace(path.join(app.getPath('userData'),'github-workspaces'));
const {LocalHistory} = require('./local-history.cjs');
let localHistory;
const historyStore = () => localHistory ||= new LocalHistory(path.join(app.getPath('userData'), 'local-history.json'));
const {createTrashHandler} = require('./trash.cjs');
const trashItem = createTrashHandler({shell});
const { createEntry, renameEntry, moveEntry, deleteEntry } = require('./file-operations.cjs');

// Display backend choice happens before Electron loads this file. Do not use
// app.commandLine.appendSwitch('ozone-platform', 'x11') here: it is too late.
// The Flatpak launcher sets XDG_SESSION_TYPE=x11 and clears WAYLAND_DISPLAY /
// WAYLAND_SOCKET in finishArgs, while the KDE user desktop launcher can also
// pass --ozone-platform=x11. See docs in README.md.

// Serve the renderer from a secure standard scheme: Vite/Monaco workers need a real origin.
protocol.registerSchemesAsPrivileged([{
  scheme: 'slate', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);

const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const IGNORE_DIRS = new Set(['.git', '.svn', '.hg', 'node_modules', 'vendor', '.venv', 'venv', 'dist', 'build', '.next', '.cache', 'target', '__pycache__']);
if (process.platform === 'win32') app.setAppUserModelId('pt.jotta.edit');
let mainWindow;
let canClose = false;
let rendererReady = false;
let pendingFiles = [];
function queueFiles(paths) {
  for (const file of paths) {
    if (rendererReady && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:open-file', file);
    else if (!pendingFiles.includes(file)) pendingFiles.push(file);
  }
}
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
app.on('second-instance', (_event, argv) => {
  queueFiles(fileArguments(argv.slice(1)));
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
let lsp;
let session = { root: null, files: [] };
let sessionWriteChain = Promise.resolve();
let preferences = { nativeFrame: true };
let nativeLanguage = 'en';
const PT_MENU = { File:'Ficheiro', Edit:'Editar', Selection:'Seleção', View:'Ver', Go:'Ir', Tools:'Ferramentas', Help:'Ajuda',
  'GitHub sync':'Sincronizar GitHub',
  'Recent Workspaces…':'Projetos recentes…',
  'Local History…':'Histórico local…',
  'New File':'Novo ficheiro', 'Open File…':'Abrir ficheiro…', 'Open Folder…':'Abrir pasta…',
  Save:'Guardar', 'Save As…':'Guardar como…', 'Close File':'Fechar ficheiro', 'Quit Jotta Edit':'Sair do Jotta Edit',
  Undo:'Desfazer', Redo:'Refazer', Find:'Localizar', Replace:'Substituir', 'Preferences…':'Preferências…',
  'Select All':'Selecionar tudo', 'Add Cursor Above':'Adicionar cursor acima', 'Add Cursor Below':'Adicionar cursor abaixo',
  'Split Editor':'Dividir editor', 'Compare with Saved Version':'Comparar com a versão guardada', 'Close Comparison':'Fechar comparação',
  'Toggle Sidebar':'Mostrar/ocultar explorador', 'Toggle Minimap':'Alternar minimapa', 'Toggle Word Wrap':'Alternar quebra de linha',
  'Increase Font Size':'Aumentar letra', 'Decrease Font Size':'Diminuir letra', 'Reset Font Size':'Repor tamanho da letra',
  'Toggle Dark/Light Theme':'Alternar tema escuro/claro', 'Quick Open…':'Abertura rápida…', 'Go to Line…':'Ir para linha…',
  'Search in Project…':'Pesquisar no projeto…', 'Replace in Project…':'Substituir no projeto…', 'Format Document':'Formatar documento',
  'Emmet: Expand Abbreviation':'Emmet: Expandir abreviatura', 'Edit Colour at Cursor':'Editar cor no cursor',
  'Toggle Format on Save':'Alternar formatação ao guardar', 'About Jotta Edit':'Sobre o Jotta Edit' };
const nativeTr = label => nativeLanguage === 'pt-PT' ? PT_MENU[label] || label : label;
function preferencesPath() { return path.join(app.getPath('userData'), 'window-preferences.json'); }
async function restorePreferences() {
  try {
    const saved = JSON.parse(await fsp.readFile(preferencesPath(), 'utf8'));
    preferences.nativeFrame = saved.nativeFrame !== false;
  } catch { /* default to system frame */ }
}
async function persistPreferences() {
  await fsp.mkdir(path.dirname(preferencesPath()), { recursive: true });
  await fsp.writeFile(preferencesPath(), JSON.stringify(preferences, null, 2));
}
function sendMenuCommand(command) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:command', command);
}
function buildMenu() {
  const item = (label, command, accelerator) => ({ label: nativeTr(label), accelerator, click: () => sendMenuCommand(command) });
  const template = [
    { label: 'File', submenu: [
      item('GitHub sync', 'github-sync'), item('New File', 'new', 'CommandOrControl+N'), item('Open File…', 'open-file', 'CommandOrControl+O'),
      item('Open Folder…', 'open-folder', 'CommandOrControl+Shift+O'), item('Recent Workspaces…', 'recent-workspaces'), { type: 'separator' },
      item('Save', 'save', 'CommandOrControl+S'), item('Save As…', 'save-as', 'CommandOrControl+Shift+S'), item('Local History…', 'local-history'),
      { type: 'separator' }, item('Close File', 'close-file', 'CommandOrControl+W'), item('Quit Jotta Edit', 'quit', 'CommandOrControl+Q')
    ] },
    { label: 'Edit', submenu: [
      item('Undo', 'undo', 'CommandOrControl+Z'), item('Redo', 'redo', 'CommandOrControl+Shift+Z'),
      { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      { type: 'separator' }, item('Find', 'find', 'CommandOrControl+F'), item('Replace', 'replace', 'CommandOrControl+H'), item('Replace in Project…', 'replace-project', 'CommandOrControl+Shift+H'),
      { type: 'separator' }, item('Preferences…', 'settings', 'CommandOrControl+Comma')
    ] },
    { label: 'Selection', submenu: [item('Select All', 'select-all', 'CommandOrControl+A'), item('Add Cursor Above', 'cursor-up', 'CommandOrControl+Alt+Up'), item('Add Cursor Below', 'cursor-down', 'CommandOrControl+Alt+Down')] },
    { label: 'View', submenu: [
      item('Split Editor', 'split-editor', 'CommandOrControl+Backslash'),
      item('Compare with Saved Version', 'compare-saved'), item('Close Comparison', 'close-comparison'),
      item('Toggle Sidebar', 'sidebar', 'CommandOrControl+B'), item('Toggle Minimap', 'minimap'),
      item('Toggle Word Wrap', 'wrap', 'Alt+Z'), item('Increase Font Size', 'font-plus', 'CommandOrControl+Plus'),
      item('Decrease Font Size', 'font-minus', 'CommandOrControl+-'), item('Reset Font Size', 'font-reset', 'CommandOrControl+0'),
      item('Toggle Dark/Light Theme', 'theme')
    ] },
    { label: 'Go', submenu: [item('Quick Open…', 'quick-open', 'CommandOrControl+P'), item('Go to Line…', 'goto-line', 'CommandOrControl+G'), item('Search in Project…', 'search-project', 'CommandOrControl+Shift+F')] },
    { label: 'Tools', submenu: [item('Open Live Preview', 'preview'), item('Stop Live Preview', 'preview-stop'), item('Format Document', 'format', 'Shift+Alt+F'), item('Emmet: Expand Abbreviation', 'emmet', 'CommandOrControl+Alt+E'), item('Edit Colour at Cursor', 'edit-colour', 'CommandOrControl+Alt+C'), item('Toggle Format on Save', 'format-save')] },
    { label: 'Help', submenu: [item('About Jotta Edit', 'about')] }
  ];
  for (const menu of template) menu.label = nativeTr(menu.label);
  return Menu.buildFromTemplate(template);
}
function listSystemFonts() {
  // On Windows, read both installed machine fonts and per-user fonts.
  if (process.platform === 'win32') {
    const keys = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
      'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
    ];
    return Promise.all(keys.map(key => new Promise(resolve => execFile('reg', ['query', key],
      { timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve([]);
        resolve(stdout.split(/\r?\n/).flatMap(line => {
          const m = /^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+/i.exec(line);
          return m ? [m[1].replace(/\s*\((?:TrueType|OpenType|All res)\).*$/i, '').trim()] : [];
        }));
      })))) .then(groups => [...new Set(groups.flat())].filter(Boolean).sort((a,b) => a.localeCompare(b)).slice(0, 500));
  }
  return new Promise(resolve => execFile('fc-list', ['-f', '%{family}\n'],
    { timeout: 3000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      const names = new Set(stdout.split('\n').flatMap(line => line.split(',').map(f => f.trim())).filter(name => name && name.length <= 65));
      resolve([...names].sort((a,b) => a.localeCompare(b)).slice(0, 400));
    }));
}


function sessionPath() { return path.join(app.getPath('userData'), 'session.json'); }
async function restoreSession() {
  try {
    const raw = JSON.parse(await fsp.readFile(sessionPath(), 'utf8'));
    session = normalizeSession(raw);
  } catch { /* new installation */ }
}
async function persistSession(value) {
  // Serialise snapshots so a slow older write cannot overwrite newer edits.
  sessionWriteChain = sessionWriteChain.catch(() => {}).then(async () => {
    const committed = await writeSession(sessionPath(), value);
    session = committed;
  });
  return sessionWriteChain;
}
function filePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) throw new Error('Expected an absolute file path');
  return path.normalize(value);
}
async function readText(file) {
  const p = filePath(file);
  const stat = await fsp.stat(p);
  if (!stat.isFile()) throw new Error('Not a regular file');
  if (stat.size > MAX_TEXT_BYTES) throw new Error('File exceeds the 5 MB editor limit');
  const data = await fsp.readFile(p);
  if (data.includes(0)) throw new Error('Binary files cannot be opened');
  return { path: p, name: path.basename(p), content: data.toString('utf8'), mtimeMs: stat.mtimeMs };
}
async function listTree(folder, options = {}) {
  const root = filePath(folder);
  const stat = await fsp.stat(root);
  if (!stat.isDirectory()) throw new Error('Not a folder');
  let count = 0;
  async function descend(dir, depth) {
    if (depth > 12 || count >= 8000) return [];
    let entries = await fsp.readdir(dir, { withFileTypes: true });
    const showHidden = options.showHidden === true;
    entries = entries.filter(e => !e.isSymbolicLink() && !(e.isDirectory() && IGNORE_DIRS.has(e.name)) && (showHidden || !e.name.startsWith('.')))
      .sort((a, b) => (Number(b.isDirectory()) - Number(a.isDirectory())) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const out = [];
    for (const entry of entries) {
      if (count >= 8000) break;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const children = await descend(p, depth + 1).catch(() => []);
        out.push({ path: p, name: entry.name, dir: true, children });
      } else if (entry.isFile()) {
        count++;
        out.push({ path: p, name: entry.name, dir: false });
      }
    }
    return out;
  }
  return { root, nodes: await descend(root, 0), count, truncated: count >= 8000 };
}
async function projectSearch(root, query) {
  if (typeof query !== 'string' || query.length < 2 || query.length > 150) return [];
  const tree = await listTree(root);
  const matches = [];
  const needle = query.toLocaleLowerCase();
  async function walk(nodes) {
    for (const node of nodes) {
      if (matches.length >= 100) return;
      if (node.dir) { await walk(node.children); continue; }
      const name = node.name.toLowerCase();
      if (/\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|pdf|zip|gz|mp[34]|mov|webm|sqlite|lock)$/i.test(name)) continue;
      try {
        const stat = await fsp.stat(node.path);
        if (stat.size > 1024 * 1024) continue;
        const text = await fsp.readFile(node.path, 'utf8');
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length && matches.length < 100; i++) {
          if (lines[i].toLocaleLowerCase().includes(needle)) {
            matches.push({ path: node.path, line: i + 1, preview: lines[i].trim().slice(0, 200) });
          }
        }
      } catch { /* unreadable file */ }
    }
  }
  await walk(tree.nodes);
  return matches;
}
function createWindow() {
  rendererReady = false;
  mainWindow = new BrowserWindow({
    width: 1350, height: 860, minWidth: 700, minHeight: 430, backgroundColor: '#202125',
    title: 'Jotta Edit', frame: preferences.nativeFrame, show: false,
    autoHideMenuBar: false, icon: path.resolve(__dirname, '../assets/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  // Forward renderer errors to the launching terminal for actionable startup reports.
  // Recent Electron versions use a details object, older versions positional args.
  mainWindow.webContents.on('console-message', (eventOrDetails, legacyLevel, legacyMessage) => {
    const level = typeof eventOrDetails?.level === 'string' ? eventOrDetails.level : legacyLevel;
    const message = typeof eventOrDetails?.message === 'string' ? eventOrDetails.message : legacyMessage;
    if (level === 'error' || level === 3) console.error('[Jotta Edit renderer]', message);
  });
  mainWindow.webContents.on('render-process-gone', (_event, info) => {
    console.error('[Jotta Edit] Renderer process exited:', info?.reason || 'unknown reason');
  });
  mainWindow.setMenu(buildMenu());
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', e => e.preventDefault());
  mainWindow.on('close', (event) => {
    if (!canClose) {
      event.preventDefault();
      mainWindow.webContents.send('window:before-close');
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL('slate://app/index.html');
  // The renderer signals when its open-file listener is registered.
  // Sending at did-finish-load loses events while Monaco is initializing.
}

app.on('open-file', (event, file) => {
  event.preventDefault();
  queueFiles([file]);
});
if (hasSingleInstanceLock) app.whenReady().then(async () => {
  await restoreSession();
  await restorePreferences();
  nativeLanguage = /^pt(?:-|$)/i.test(app.getLocale()) ? 'pt-PT' : 'en';
  Menu.setApplicationMenu(buildMenu());
  const distRoot = path.resolve(__dirname, '..', 'dist');
  protocol.handle('slate', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Unknown host', { status: 404 });
    let wanted;
    try { wanted = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; }
    catch { return new Response('Bad path', { status: 400 }); }
    const file = path.resolve(distRoot, wanted);
    if (!file.startsWith(distRoot + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  lsp = new LspBridge(app.getPath('userData'));
  ipcMain.on('app:renderer-ready', () => {
    rendererReady = true;
    const files = pendingFiles.splice(0);
    for (const file of files) mainWindow?.webContents.send('app:open-file', file);
  });
  ipcMain.handle('preview:start', async (_event, params) => {
    try {
      const url = await livePreview.start(params);
      await openBrowser(url, params.browser || 'default', shell);
      return url;
    } catch (error) {
      await livePreview.stop();
      await dialog.showMessageBox(mainWindow, {
        type:'error', title:'Live preview could not start',
        message:'Live preview could not start.', detail:error.message, buttons:['OK']
      });
      return {error:error.message};
    }
  });
  ipcMain.handle('preview:update', (_event, buffers) => { if (livePreview.server) livePreview.update(buffers); });
  ipcMain.handle('preview:stop', () => livePreview.stop());
  ipcMain.handle('github:token-help',()=>shell.openExternal('https://github.com/settings/personal-access-tokens/new'));
  ipcMain.handle('github:state',(_e,root)=>githubStore().getState(root));
  ipcMain.handle('github:set-state',(_e,root,state)=>githubStore().setState(root,state));
  ipcMain.handle('github:snapshot',(_e,root,tracked)=>githubStore().snapshot(root,tracked));
  ipcMain.handle('github:apply',(_e,root,changes,expected,tracked)=>githubStore().apply(root,changes,expected,tracked));
  ipcMain.handle('github:choose-workspace',async()=>{const result=await dialog.showOpenDialog(mainWindow,{properties:['openDirectory','createDirectory']});return result.canceled?null:result.filePaths[0];});
  ipcMain.handle('session:get', () => session);
  ipcMain.handle('window:prefs:get', () => ({ ...preferences }));
  ipcMain.handle('window:prefs:set', async (_event, value) => {
    if (typeof value?.nativeFrame !== 'boolean') throw new Error('Invalid window frame setting');
    preferences.nativeFrame = value.nativeFrame;
    await persistPreferences();
    return { ...preferences };
  });
  ipcMain.handle('window:restart-confirmed', () => {
    canClose = true;
    app.relaunch();
    app.quit();
  });
  ipcMain.handle('fonts:list', () => listSystemFonts());
  ipcMain.handle('app:locale', () => app.getLocale());
  ipcMain.handle('app:menu-locale', (_event, value) => {
    if (value !== 'en' && value !== 'pt-PT') return;
    nativeLanguage = value;
    const menu = buildMenu(); Menu.setApplicationMenu(menu);
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.setMenu(menu); mainWindow.setMenuBarVisibility(false); }
  });
  ipcMain.handle('paths:complete', (_event, params) => listPathCandidates(params));
  ipcMain.handle('menu:popup', (_event, label, point) => {
    const submenu = buildMenu().items.find(item => item.label === label)?.submenu;
    if (!submenu) return;
    const x = Number.isFinite(point?.x) ? Math.max(0, Math.floor(point.x)) : 0;
    const y = Number.isFinite(point?.y) ? Math.max(0, Math.floor(point.y)) : 0;
    submenu.popup({ window: mainWindow, x, y });
  });
  ipcMain.handle('session:set', async (_e, value) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid recovery session');
    await persistSession(value);
  });
  ipcMain.handle('folder:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('folder:scan', (_e, folder, options) => listTree(folder, options));
  ipcMain.handle('explorer:create', (_e, root, folder, name, kind) => createEntry(root, folder, name, kind));
  const moveWithHistory = async operation => {
    const result = await operation();
    try { await historyStore().move(result.oldPath, result.path); }
    catch { result.historyWarning = 'Local history could not be updated.'; }
    return result;
  };
  ipcMain.handle('explorer:rename', (_e, root, file, name) => moveWithHistory(() => renameEntry(root, file, name)));
  ipcMain.handle('explorer:move', (_e, root, file, folder) => moveWithHistory(() => moveEntry(root, file, folder)));
  ipcMain.handle('explorer:delete', async (_e, root, file) => {
    try { return await deleteEntry(root, file, trashItem); }
    catch (error) {
      await dialog.showMessageBox(mainWindow, {type:'error', title:'Cannot move to Trash', message:'The item could not be moved to Trash.', detail:error.message, buttons:['OK']});
      throw error;
    }
  });
  ipcMain.handle('file:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('file:read', (_e, file) => readText(file));
  ipcMain.handle('history:list', (_e, file) => historyStore().list(filePath(file)));
  ipcMain.handle('history:get', (_e, file, id) => historyStore().get(filePath(file), id));
  ipcMain.handle('history:capture', (_e, file, text) => {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new Error('File exceeds the editor limit');
    return historyStore().capture(filePath(file), [{text, kind:'restore-backup'}]);
  });
  ipcMain.handle('file:write', async (_e, file, content) => {
    const p = filePath(file);
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_TEXT_BYTES) throw new Error('File exceeds the editor limit');
    let historyWarning = '';
    const capture = async snapshots => {
      try { await historyStore().capture(p, snapshots); }
      catch { historyWarning = 'Local history could not be updated.'; }
    };
    try {
      const previous = await readText(p);
      await capture([{text:previous.content, kind:'before-save'}]);
    } catch (error) {
      if (error.code !== 'ENOENT') historyWarning = 'Local history could not be updated.';
    }
    await fsp.writeFile(p, content, 'utf8');
    await capture([{text:content, kind:'save'}]);
    const stat = await fsp.stat(p);
    if (Buffer.byteLength(content, 'utf8') > 1024 * 1024) historyWarning = 'File saved. Local history supports files up to 1 MB.';
    return { path: p, name: path.basename(p), mtimeMs: stat.mtimeMs, historyWarning };
  });
  ipcMain.handle('file:save-dialog', async (_e, suggestion) => {
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: typeof suggestion === 'string' ? suggestion : 'untitled.txt' });
    return result.canceled ? null : result.filePath;
  });
  ipcMain.handle('project:search', (_e, root, term) => projectSearch(root, term));
  ipcMain.handle('lsp:complete', (_e, params) => lsp.complete(params));
  ipcMain.handle('window:action', (_e, action) => {
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    if (action === 'close') mainWindow.close();
  });
  ipcMain.handle('window:close-confirmed', () => { canClose = true; mainWindow.close(); });
  // argv[0] is the executable, not a file to open. Resolve document args before launch.
  queueFiles(fileArguments(process.argv.slice(1)));
  if (hasSingleInstanceLock) createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { canClose = false; createWindow(); } });
});
app.on('before-quit', () => { lsp?.stop(); void livePreview.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

'use strict';
const { app, BrowserWindow, dialog, ipcMain, protocol, net, Menu, shell, safeStorage } = require('electron');
const fs = require('node:fs');
const fsp = require('./project-fs.cjs');
const {writeLocalText} = require('./local-save.cjs');
const path = require('node:path');
const { LivePreview, openBrowser } = require('./live-preview.cjs');
const livePreview = new LivePreview();
const { LspBridge } = require('./lsp.cjs');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { listPathCandidates } = require('./path-completion.cjs');
const { fileArguments } = require('./launch-paths.cjs');
const { normalizeSession, writeSession } = require('./session-store.cjs');
const {LocalHistory} = require('./local-history.cjs');
let localHistory;
const historyStore = () => localHistory ||= new LocalHistory(path.join(app.getPath('userData'), 'local-history.json'));
const {createTrashHandler} = require('./trash.cjs');
const trashItem = createTrashHandler({shell});
const { createEntry, renameEntry, moveEntry, deleteEntry } = require('./file-operations.cjs');
const {RemoteFolders}=require('./remote-folders.cjs');
const {Favourites}=require('./favourites.cjs');
let favourites;
const {writeRemoteText}=require('./remote-save.cjs');
const {readMarkdownAsset}=require('./markdown-assets.cjs');
const {chooseMarkdownExport,exportMarkdown}=require('./markdown-export.cjs');
const {FolderBrowser}=require('./folder-browser.cjs');
let folderBrowser;
let hostKeySequence=0;
const hostKeyRequests=new Map();
const remoteFolders=new RemoteFolders({onActivity:snapshot=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('remote:activity',snapshot);},confirmHostKey:(details,signal)=>new Promise(resolve=>{
  const id=++hostKeySequence;
  const finish=accepted=>{hostKeyRequests.delete(id);signal?.removeEventListener('abort',cancel);resolve(accepted);};
  const cancel=()=>finish(false);
  if(signal?.aborted)return finish(false);
  hostKeyRequests.set(id,finish);signal?.addEventListener('abort',cancel,{once:true});
  mainWindow?.webContents.send('remote:host-key',{id,...details});
})});
fsp.setRemote(remoteFolders);
let remoteConnection=null;
app.on('will-quit',()=>{remoteConnection?.abort();void remoteFolders.close();});

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
  'Document outline':'Estrutura do documento','Remote connections':'Ligações remotas',
  'Open Remote Folder…':'Abrir pasta remota…',
  'Open mounted folder…':'Abrir pasta montada…',
  'New Markdown file':'Novo ficheiro Markdown', 'Markdown preview':'Pré-visualizar Markdown',
  'Export Markdown as HTML':'Exportar Markdown como HTML', 'Export Markdown as PDF':'Exportar Markdown como PDF',
  'Recent Workspaces…':'Projetos recentes…',
  'Favourites…':'Favoritos…',
  'Local History…':'Histórico local…',
  'New File':'Novo ficheiro', 'Open File…':'Abrir ficheiro…', 'Open Folder…':'Abrir pasta…',
  Save:'Guardar', 'Save As…':'Guardar como…', 'Close File':'Fechar ficheiro', 'Quit Jotta Edit':'Sair do Jotta Edit',
  Undo:'Desfazer', Redo:'Refazer', Find:'Localizar', Replace:'Substituir', 'Preferences…':'Preferências…',
  'Select All':'Selecionar tudo', 'Add Cursor Above':'Adicionar cursor acima', 'Add Cursor Below':'Adicionar cursor abaixo',
  'Split Editor':'Dividir editor', 'Compare with Saved Version':'Comparar com a versão guardada', 'Close Comparison':'Fechar comparação',
  'Compare with latest file':'Comparar com o ficheiro mais recente',
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
function reportRemoteFailure(kind,handler,target=file=>file){
  return async(event,file,...args)=>{
    try{return await handler(event,file,...args);}
    catch(error){const affected=target(file,args);if(remoteFolders.owns(affected))remoteFolders.recordFailure(affected,kind,error);throw error;}
  };
}
function buildMenu() {
  const item = (label, command, accelerator) => ({ label: nativeTr(label), accelerator, click: () => sendMenuCommand(command) });
  const template = [
    { label: 'File', submenu: [
      item('New File', 'new', 'CommandOrControl+N'), item('Open File…', 'open-file', 'CommandOrControl+O'),
      item('New Markdown file', 'new-markdown'),
      item('Open Folder…', 'open-folder', 'CommandOrControl+Shift+O'), item('Recent Workspaces…', 'recent-workspaces'), { type: 'separator' },
      item('Open Remote Folder…', 'open-remote-folder'), item('Favourites…', 'favourites'),
      item('Save', 'save', 'CommandOrControl+S'), item('Save As…', 'save-as', 'CommandOrControl+Shift+S'), item('Local History…', 'local-history'),
      item('Export Markdown as HTML','markdown-export-html'),item('Export Markdown as PDF','markdown-export-pdf'),
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
      item('Document outline','document-outline'),item('Remote connections','remote-connections'),
      item('Markdown preview','markdown-preview','CommandOrControl+Shift+V'),
      item('Split Editor', 'split-editor', 'CommandOrControl+Backslash'),
      item('Compare with Saved Version', 'compare-saved'), item('Close Comparison', 'close-comparison'),
      item('Compare with latest file', 'compare-latest'),
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
  return require('./folder-tree.cjs').listFolderTree(filePath(folder),{
    showHidden:options.showHidden === true,ignoreDirs:IGNORE_DIRS,shallow:options.shallow === true
  });
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
  folderBrowser=new FolderBrowser(app.getPath('home'));
  favourites=new Favourites(path.join(app.getPath('userData'),'favourites.json'),{safeStorage});
  await remoteFolders.restoreRoots(path.join(app.getPath('userData'),'remote-folders.json'));
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
  ipcMain.handle('favourites:list',()=>favourites.list());
  ipcMain.handle('favourites:save',(_event,value)=>{
    if(value?.kind==='local'&&remoteFolders.owns(value.location))throw new Error('Reconnect to this server before adding it to favourites.');
    return favourites.save(value);
  });
  ipcMain.handle('favourites:remove',(_event,id)=>favourites.remove(id));
  ipcMain.handle('favourites:delete-credentials',(_event,id)=>favourites.deleteCredentials(id));
  ipcMain.handle('remote:connect',async(_event,location,credentials={},options={})=>{
    if(remoteConnection)throw new Error('A remote connection is already in progress.');
    const controller=new AbortController();remoteConnection=controller;
    const timeout=setTimeout(()=>controller.abort(new Error('Connection timed out. Check the server and try again.')),45000);
    try{return await favourites.connect(remoteFolders,location,credentials,options,controller.signal);}
    catch(error){if(controller.signal.aborted)throw new Error(controller.signal.reason?.message||'Connection cancelled.');throw error;}
    finally{clearTimeout(timeout);if(remoteConnection===controller)remoteConnection=null;}
  });
  ipcMain.handle('remote:cancel',()=>{remoteConnection?.abort();remoteConnection=null;});
  ipcMain.handle('remote:activity-state',()=>remoteFolders.activity.snapshot());
  ipcMain.handle('remote:activity-dismiss',(_event,id)=>{if(typeof id==='string')remoteFolders.activity.dismiss(id);});
  ipcMain.handle('remote:activity-clear',()=>remoteFolders.activity.clearCompleted());
  ipcMain.handle('remote:reconnect',async(_event,root)=>{
    if(remoteConnection)throw new Error('A remote connection is already in progress.');
    if(typeof root!=='string')throw new Error('Invalid remote connection.');
    const controller=new AbortController();remoteConnection=controller;
    const timeout=setTimeout(()=>controller.abort(new Error('Connection timed out. Check the server and try again.')),45000);
    try{return await remoteFolders.reconnect(root,controller.signal);}
    finally{clearTimeout(timeout);if(remoteConnection===controller)remoteConnection=null;}
  });
  ipcMain.handle('remote:host-key-answer',(_event,id,accepted)=>{hostKeyRequests.get(id)?.(accepted===true);});
  ipcMain.handle('remote:info',(_event,file)=>remoteFolders.info(file));
  ipcMain.handle('folder:browse',(_event,folder,options)=>folderBrowser.list(folder,options));
  ipcMain.handle('folder:select',(_event,folder)=>folderBrowser.select(folder));
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
  ipcMain.handle('folder:scan',reportRemoteFailure('list',(_e,folder,options)=>listTree(folder,options)));
  ipcMain.handle('explorer:create',reportRemoteFailure('create',(_e,root,folder,name,kind)=>createEntry(root,folder,name,kind),(_root,args)=>args[0]));
  const moveWithHistory = async operation => {
    const result = await operation();
    try { await historyStore().move(result.oldPath, result.path); }
    catch { result.historyWarning = 'Local history could not be updated.'; }
    return result;
  };
  ipcMain.handle('explorer:rename',reportRemoteFailure('move',(_e,root,file,name)=>moveWithHistory(()=>renameEntry(root,file,name)),(_root,args)=>args[0]));
  ipcMain.handle('explorer:move',reportRemoteFailure('move',(_e,root,file,folder)=>moveWithHistory(()=>moveEntry(root,file,folder)),(_root,args)=>args[0]));
  ipcMain.handle('explorer:delete',reportRemoteFailure('delete',async (_e, root, file) => {
    try { return await deleteEntry(root, file, target=>remoteFolders.owns(target)?remoteFolders.trash(target):trashItem(target)); }
    catch (error) {
      if(!remoteFolders.owns(file))await dialog.showMessageBox(mainWindow, {type:'error', title:'Cannot move to Trash', message:'The item could not be moved to Trash.', detail:error.message, buttons:['OK']});
      throw error;
    }
  },(_root,args)=>args[0]));
  ipcMain.handle('file:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('file:read',reportRemoteFailure('read',(_e,file)=>readText(file)));
  ipcMain.handle('markdown:asset',(_e,params)=>readMarkdownAsset(params));
  ipcMain.handle('markdown:export-destination',(_e,params)=>chooseMarkdownExport(params,{
    dialog,parent:mainWindow,defaultDirectory:app.getPath('documents'),isRemote:file=>remoteFolders.isRemote(file)
  }));
  ipcMain.handle('markdown:export',(_e,params)=>exportMarkdown(params,{dialog,BrowserWindow,parent:mainWindow}));
  ipcMain.handle('markdown:open-link',async(_e,value)=>{
    const {externalMarkdownLink}=await import('../shared/markdown-paths.mjs'),url=externalMarkdownLink(value);
    if(!url)throw new Error('Unsupported Markdown link.');await shell.openExternal(url);
  });
  ipcMain.handle('history:list', (_e, file) => historyStore().list(filePath(file)));
  ipcMain.handle('history:get', (_e, file, id) => historyStore().get(filePath(file), id));
  ipcMain.handle('history:capture', (_e, file, text) => {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new Error('File exceeds the editor limit');
    return historyStore().capture(filePath(file), [{text, kind:'restore-backup'}]);
  });
  ipcMain.handle('file:write',reportRemoteFailure('save',async (_e, file, content, options={}) => {
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
    if(remoteFolders.owns(p))await remoteFolders.save(p,content,{expectedText:options?.expectedText});
    else if(remoteFolders.isRemote(p))await writeRemoteText(p,content,{expectedText:options?.expectedText});
    else await writeLocalText(p, content, {expectedText:options?.expectedText});
    await capture([{text:content, kind:'save'}]);
    const stat = await fsp.stat(p);
    if (Buffer.byteLength(content, 'utf8') > 1024 * 1024) historyWarning = 'File saved. Local history supports files up to 1 MB.';
    return { path: p, name: path.basename(p), mtimeMs: stat.mtimeMs, historyWarning };
  }));
  ipcMain.handle('file:save-dialog', async (_e, suggestion) => {
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: typeof suggestion === 'string' ? suggestion : 'untitled.txt' });
    return result.canceled ? null : result.filePath;
  });
  ipcMain.handle('project:search', (_e, root, term) => projectSearch(root, term));
  ipcMain.handle('lsp:complete', (_e, params) => remoteFolders.owns(params?.file)?[]:lsp.complete(params));
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

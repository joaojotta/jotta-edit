'use strict';
const { app, BrowserWindow, dialog, ipcMain, protocol } = require('electron');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');

const LARGE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_INDEX_FILES = 20000;
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache']);

let mainWindow = null;

// Must happen before the app is ready, per Electron's API contract.
protocol.registerSchemesAsPrivileged([{ scheme: 'proto', privileges: { standard: true, secure: true } }]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 600, minHeight: 400,
    title: 'Sublime Prototype', show: false, backgroundColor: '#1e1e1e',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL('proto://app/index.html');
}

function listSystemFonts() {
  // Windows keeps installed fonts in the registry; everywhere else (Linux,
  // macOS via fontconfig) `fc-list` already gives the same information.
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
      })))).then(groups => [...new Set(groups.flat())].filter(Boolean).sort((a, b) => a.localeCompare(b)).slice(0, 500));
  }
  return new Promise(resolve => execFile('fc-list', ['-f', '%{family}\n'],
    { timeout: 3000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      const names = new Set(stdout.split('\n').flatMap(line => line.split(',').map(f => f.trim())).filter(name => name && name.length <= 65));
      resolve([...names].sort((a, b) => a.localeCompare(b)).slice(0, 400));
    }));
}

async function walk(root, dir, out) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (out.length >= MAX_INDEX_FILES) return;
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(root, full, out);
    else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join('/'));
  }
}

app.whenReady().then(() => {
  // Must be registered before createWindow() calls loadURL('proto://...') —
  // otherwise the very first navigation has no handler to resolve against.
  protocol.handle('proto', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Unknown host', { status: 404 });
    const distRoot = path.resolve(__dirname, '..', 'dist');
    let wanted;
    try { wanted = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; }
    catch { return new Response('Bad path', { status: 400 }); }
    const file = path.resolve(distRoot, wanted);
    if (!file.startsWith(distRoot + path.sep) && file !== distRoot) return new Response('Forbidden', { status: 403 });
    return net_fetch(file);
  });

  createWindow();

  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('fs:read-file', async (_event, file) => {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('Not a regular file');
    const content = await fsp.readFile(file, 'utf8');
    return { path: file, name: path.basename(file), content, size: stat.size, large: stat.size > LARGE_FILE_BYTES };
  });

  ipcMain.handle('fs:write-file', async (_event, file, content) => {
    await fsp.writeFile(file, content, 'utf8');
    return true;
  });

  ipcMain.handle('fs:save-dialog', async (_event, suggestedName) => {
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: suggestedName || 'untitled.txt' });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('fs:list-tree', async (_event, folder) => {
    const files = [];
    await walk(folder, folder, files);
    return { files, truncated: files.length >= MAX_INDEX_FILES };
  });

  ipcMain.handle('system:list-fonts', () => listSystemFonts());

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

async function net_fetch(file) {
  const { net } = require('electron');
  return net.fetch(pathToFileURL(file).toString());
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

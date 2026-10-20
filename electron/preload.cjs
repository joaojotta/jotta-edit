'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('slate', Object.freeze({
  startPreview: async params => {
    const result = await invoke('preview:start', params);
    if (result?.error) throw new Error(result.error);
    return result;
  },
  updatePreview: buffers => invoke('preview:update', buffers),
  stopPreview: () => invoke('preview:stop'),
  getWindowPrefs: () => invoke('window:prefs:get'),
  setWindowPrefs: value => invoke('window:prefs:set', value),
  restartConfirmed: () => invoke('window:restart-confirmed'),
  listFonts: () => invoke('fonts:list'),
  systemLocale: () => invoke('app:locale'),
  menuLocale: language => invoke('app:menu-locale', language),
  completePath: (params) => invoke('paths:complete', params),
  popupMenu: (label, point) => invoke('menu:popup', label, point),
  onMenuCommand: fn => { const cb = (_event, name) => fn(name); ipcRenderer.on('menu:command', cb); return () => ipcRenderer.removeListener('menu:command', cb); },
  chooseFolder: () => invoke('folder:choose'),
  scanFolder: (folder, options) => invoke('folder:scan', folder, options),
  createEntry: (root, folder, name, kind) => invoke('explorer:create', root, folder, name, kind),
  renameEntry: (root, file, name) => invoke('explorer:rename', root, file, name),
  moveEntry: (root, file, folder) => invoke('explorer:move', root, file, folder),
  deleteEntry: (root, file) => invoke('explorer:delete', root, file),
  chooseFiles: () => invoke('file:choose'),
  listHistory: file => invoke('history:list', file),
  getHistory: (file, id) => invoke('history:get', file, id),
  captureHistory: (file, text) => invoke('history:capture', file, text),
  readFile: (file) => invoke('file:read', file),
  saveFile: (file, content) => invoke('file:write', file, content),
  saveAsDialog: (suggestion) => invoke('file:save-dialog', suggestion),
  githubTokenHelp:()=>invoke('github:token-help'),
  githubState:root=>invoke('github:state',root),
  githubSetState:(root,state)=>invoke('github:set-state',root,state),
  githubSnapshot:(root,tracked)=>invoke('github:snapshot',root,tracked),
  githubApply:(root,changes,expected,tracked)=>invoke('github:apply',root,changes,expected,tracked),
  githubChooseWorkspace:name=>invoke('github:choose-workspace',name),
  getSession: () => invoke('session:get'),
  setSession: (value) => invoke('session:set', value),
  searchProject: (root, query) => invoke('project:search', root, query),
  complete: (params) => invoke('lsp:complete', params),
  windowAction: (action) => invoke('window:action', action),
  closeConfirmed: () => invoke('window:close-confirmed'),
  onBeforeClose: (fn) => { const cb = () => fn(); ipcRenderer.on('window:before-close', cb); return () => ipcRenderer.removeListener('window:before-close', cb); },
  rendererReady: () => ipcRenderer.send('app:renderer-ready'),
  onOpenFile: (fn) => { const cb = (_event, file) => fn(file); ipcRenderer.on('app:open-file', cb); return () => ipcRenderer.removeListener('app:open-file', cb); }
}));

'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', Object.freeze({
  chooseFile: () => ipcRenderer.invoke('dialog:open-file'),
  chooseFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  readFile: file => ipcRenderer.invoke('fs:read-file', file),
  writeFile: (file, content) => ipcRenderer.invoke('fs:write-file', file, content),
  saveDialog: suggestedName => ipcRenderer.invoke('fs:save-dialog', suggestedName),
  listTree: folder => ipcRenderer.invoke('fs:list-tree', folder),
  listSystemFonts: () => ipcRenderer.invoke('system:list-fonts')
}));

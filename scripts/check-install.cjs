#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');
const root = path.resolve(__dirname, '..');
const required = [
  ['Electron JavaScript package', 'node_modules/electron/package.json'],
  ['Electron binary', process.platform === 'win32' ? 'node_modules/electron/dist/electron.exe' : 'node_modules/electron/dist/electron'],
  ['Monaco Editor', 'node_modules/monaco-editor/package.json'],
  // Check that each physical Monaco 0.55.1 worker file exists.
  // The renderer imports these by relative paths. Monaco 0.55.1 and Vite 7
  // retain these entrypoints (later versions reorganize exports).
  ['Monaco editor worker', 'node_modules/monaco-editor/esm/vs/editor/editor.worker.js'],
  ['Monaco JSON worker', 'node_modules/monaco-editor/esm/vs/language/json/json.worker.js'],
  ['Monaco CSS worker', 'node_modules/monaco-editor/esm/vs/language/css/css.worker.js'],
  ['Monaco HTML worker', 'node_modules/monaco-editor/esm/vs/language/html/html.worker.js'],
  ['Monaco TypeScript worker', 'node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js'],
  ['Vite', 'node_modules/vite/package.json'],
  ['electron-builder', 'node_modules/electron-builder/package.json'],
  ['Emmet', 'node_modules/emmet/package.json'],
  ['Prettier', 'node_modules/prettier/package.json'],
  ['Prettier PHP plugin', 'node_modules/@prettier/plugin-php/package.json'],
  ['Rubik interface font', 'node_modules/@fontsource/rubik/package.json'],
  ['FTP client', 'node_modules/basic-ftp/package.json'],
  ['SFTP client', 'node_modules/ssh2-sftp-client/package.json'],
  ['SMB client', 'node_modules/smb3-client/package.json'],
];
const missing = required.filter(([, file]) => !fs.existsSync(path.join(root, file)));
for (const [moduleName, expected] of [['monaco-editor', pkg.dependencies['monaco-editor']], ['vite', pkg.devDependencies.vite], ['emmet', pkg.dependencies.emmet], ['prettier', pkg.dependencies.prettier], ['@prettier/plugin-php', pkg.dependencies['@prettier/plugin-php']]]) {
  const manifest = path.join(root, 'node_modules', moduleName, 'package.json');
  if (fs.existsSync(manifest)) {
    const actual = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
    if (actual !== expected) missing.push([`${moduleName} ${expected} (found ${actual})`, manifest]);
  }
}
if (missing.length) {
  console.error('Cannot build Jotta Edit: required dependencies are missing:');
  for (const [name, file] of missing) console.error(' - ' + name + ': ' + file);
  console.error('First run: npm install --no-audit --no-fund');
  console.error('If only the Electron binary is missing, run: npx install-electron --no');
  console.error('If Monaco workers are missing, check the installed monaco-editor version (expected 0.55.1).');
  console.error('On npm 12 this project uses a scoped Git exception (.npmrc) and explicit allowScripts approvals (package.json).');
  process.exitCode = 1;
} else {
  console.log('Jotta Edit ' + pkg.version + ': required build dependencies are installed.');
}

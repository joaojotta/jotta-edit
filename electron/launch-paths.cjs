'use strict';
// Resolve only user-supplied file arguments, never argv[0] (Electron executable).
// Flatpak/KDE may provide either native paths or file:// URLs.
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

function fileArguments(args, { exists = fs.existsSync, isFile = p => fs.statSync(p).isFile(), cwd = process.cwd() } = {}) {
  const output = [];
  for (const arg of args) {
    if (typeof arg !== 'string' || !arg || arg.startsWith('-') || arg.includes('\0')) continue;
    let filename;
    try {
      if (arg.startsWith('file://')) filename = fileURLToPath(arg);
      else if (!arg.includes('://')) filename = path.resolve(cwd, arg);
    } catch { continue; }
    if (!filename) continue;
    try {
      if (exists(filename) && isFile(filename) && !output.includes(filename)) output.push(filename);
    } catch { /* inaccessible argument; do not prevent launch */ }
  }
  return output;
}
module.exports = { fileArguments };

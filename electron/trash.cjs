'use strict';
const {execFile} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const fs = require('node:fs/promises');

function runCommand(executable, args) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {windowsHide:true, timeout:30000}, (error, _stdout, stderr) => {
      if (error) reject(new Error(stderr?.trim() || error.message));
      else resolve();
    });
  });
}
async function missing(file) {
  try { await fs.lstat(file); return false; }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}
function createTrashHandler({shell, platform = process.platform, flatpakId = process.env.FLATPAK_ID, run = runCommand} = {}) {
  return async file => {
    const attempts = [];
    if (platform === 'linux') {
      // Use the desktop's Trash implementation. Inside Flatpak, helpers must
      // run on the host so they see the user's actual Trash and mounted drives.
      const commands = [['gio', 'trash', '--', file], ...['kioclient6', 'kioclient5', 'kioclient'].map(command => [command, 'move', pathToFileURL(file).href, 'trash:/'])];
      for (const [executable, ...args] of commands) {
        attempts.push(() => flatpakId ? run('flatpak-spawn', ['--host', executable, ...args]) : run(executable, args));
      }
    }
    if (shell?.trashItem) attempts.push(() => shell.trashItem(file));
    const errors = [];
    for (const attempt of attempts) {
      try {
        await attempt();
        if (await missing(file)) return;
        errors.push('The Trash operation did not remove the original item.');
      } catch (error) {
        // Some desktop helpers can return an error after completing the move.
        if (await missing(file)) return;
        errors.push(error.message);
      }
    }
    throw new Error('Cannot move this item to Trash. ' + (errors[0] || 'System Trash is unavailable.'));
  };
}
module.exports = {createTrashHandler};

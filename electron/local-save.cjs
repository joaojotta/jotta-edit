'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

async function writeLocalText(file, content, {expectedText, io = fs} = {}) {
  // Save As keeps the existing creation behavior. Existing documents are staged
  // beside the resolved target, preserving symbolic links and checking twice.
  if (typeof expectedText !== 'string') return io.writeFile(file, content, 'utf8');
  const target = await io.realpath(file);
  const unchanged = async () => {
    if (await io.realpath(file) !== target || await io.readFile(target, 'utf8') !== expectedText)
      throw new Error('File changed on disk. Compare or reload it before saving.');
  };
  await unchanged();
  const stat = await io.stat(target);
  if (!stat.isFile()) throw new Error('Saving requires a regular file.');
  const temporary = path.join(path.dirname(target), '.jotta-save-' + randomUUID());
  try {
    const handle = await io.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.chmod(stat.mode & 0o777); await handle.sync(); }
    finally { await handle.close(); }
    await unchanged();
    await io.rename(temporary, target);
  } finally { await io.rm(temporary, {force:true}).catch(() => {}); }
}

module.exports = {writeLocalText};

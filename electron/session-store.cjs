"use strict";
const fs = require('node:fs/promises');
const path = require('node:path');
const MAX_TABS = 50;
const MAX_BUFFER = 5 * 1024 * 1024;
const MAX_SESSION = 40 * 1024 * 1024;
function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { root:null, files:[], tabs:[], activeIndex:-1, nextUntitled:1 };
  const root = typeof raw.root === 'string' ? raw.root : null;
  const files = Array.isArray(raw.files) ? raw.files.filter(f => typeof f === 'string').slice(0, MAX_TABS) : [];
  const result = { root, files };
  if (Array.isArray(raw.tabs)) {
    if (raw.tabs.length > MAX_TABS) throw new Error(`Maximum ${MAX_TABS} recoverable tabs`);
    result.tabs = raw.tabs.map(doc => {
      if (!doc || typeof doc !== 'object') throw new Error('Invalid tab in recovery session');
      const file = typeof doc.path === 'string' && doc.path.trim() ? doc.path : null;
      const dirty = doc.dirty === true;
      if ((!file || dirty) && typeof doc.text !== 'string') throw new Error('Missing unsaved document content');
      if (typeof doc.text === 'string' && Buffer.byteLength(doc.text, 'utf8') > MAX_BUFFER) throw new Error('Recovery buffer exceeds the 5 MB limit');
      if (typeof doc.savedText === 'string' && Buffer.byteLength(doc.savedText, 'utf8') > MAX_BUFFER) throw new Error('Recovery baseline exceeds the 5 MB limit');
      return {
        path: file,
        name: typeof doc.name === 'string' ? doc.name.slice(0, 255) : (file ? path.basename(file) : 'untitled'),
        dirty,
        ...(typeof doc.text === 'string' ? { text:doc.text } : {}),
        ...(file && dirty && typeof doc.savedText === 'string' ? {savedText:doc.savedText} : {}),
        ...(typeof doc.language === 'string' ? { language:doc.language.slice(0, 60) } : {})
      };
    });
    result.activeIndex = Number.isInteger(raw.activeIndex) && raw.activeIndex >= 0 && raw.activeIndex < result.tabs.length ? raw.activeIndex : -1;
    result.nextUntitled = Number.isSafeInteger(raw.nextUntitled) && raw.nextUntitled > 0 ? raw.nextUntitled : 1;
  }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_SESSION) throw new Error('Recovery session exceeds 40 MB');
  return result;
}
async function writeSession(file, value) {
  const validated = normalizeSession(value);
  await fs.mkdir(path.dirname(file), {recursive:true});
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(validated), {encoding:'utf8', mode:0o600});
  await fs.rename(temporary, file); // Atomic replacement prevents truncated saved sessions.
  return validated;
}
module.exports = { normalizeSession, writeSession, MAX_TABS };

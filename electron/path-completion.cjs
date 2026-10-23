'use strict';
const path = require('node:path');
const fs = require('./project-fs.cjs');
/** Local path suggestions: no recursive scan, no symlinks, no network URLs. */
async function listPathCandidates({ file, root, typed } = {}) {
  if (typeof typed !== 'string' || typed.length > 260 || /[\0\\?*<>|]/.test(typed) || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(typed)) return [];
  if (file != null && (typeof file !== 'string' || !path.isAbsolute(file))) return [];
  if (root != null && (typeof root !== 'string' || !path.isAbsolute(root))) return [];
  if (!file && !root) return [];
  const anchor = typed.startsWith('/') ? root : (file ? path.dirname(file) : root);
  if (!anchor) return [];
  const slash = typed.lastIndexOf('/');
  const directory = typed.slice(0, slash + 1);
  const fragment = typed.slice(slash + 1).toLowerCase();
  const target = path.resolve(anchor, directory.replace(/^\//, ''));
  // With a workspace, do not disclose arbitrary directories outside it.
  if (root) {
    const rel = path.relative(path.resolve(root), target);
    if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return [];
  }
  try {
    // Resolve directory symlinks too, so the project-boundary check cannot be bypassed.
    if (root) {
      const [realRoot, realTarget] = await Promise.all([fs.realpath(root), fs.realpath(target)]);
      const realRel = path.relative(realRoot, realTarget);
      if (realRel === '..' || realRel.startsWith('..' + path.sep) || path.isAbsolute(realRel)) return [];
    }
    const items = await fs.readdir(target, { withFileTypes: true });
    return items.filter(x => !x.isSymbolicLink() && (x.isFile() || x.isDirectory()) &&
        x.name.toLowerCase().startsWith(fragment) && x.name !== 'node_modules' && x.name !== '.git')
      .sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, undefined, {numeric:true}))
      .slice(0, 120).map(x => ({ name: x.name, dir: x.isDirectory() }));
  } catch { return []; }
}
module.exports = { listPathCandidates };

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const workers = [
  'editor/editor.worker.js',
  'language/json/json.worker.js',
  'language/css/css.worker.js',
  'language/html/html.worker.js',
  'language/typescript/ts.worker.js'
];

test('all five Monaco worker imports resolve to physical files without package exports', () => {
  const sourcePath = path.join(root, 'src/main.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const imports = [...source.matchAll(/from ['"]([^'"]+\?worker)['"]/g)]
    .map(m => m[1]);
  const expected = workers.map(w => `../node_modules/monaco-editor/esm/vs/${w}?worker`);
  assert.deepEqual(imports.sort(), expected.sort());
  for (const spec of imports) {
    const relative = spec.slice(0, -'?worker'.length);
    const resolved = path.resolve(path.dirname(sourcePath), relative);
    assert.ok(resolved.startsWith(path.join(root, 'node_modules', 'monaco-editor') + path.sep));
    // These files are downloaded by npm. Do not mask a missing worker once
    // Monaco is installed, even if syntax-only tests pass.
    if (fs.existsSync(path.join(root, 'node_modules/monaco-editor/package.json'))) {
      assert.ok(fs.existsSync(resolved), `missing worker: ${resolved}`);
    }
  }
});

test('project pins the Monaco package with the legacy physical worker entrypoints', () => {
  const manifest = require('../package.json');
  assert.equal(manifest.dependencies['monaco-editor'], '0.55.1');
});

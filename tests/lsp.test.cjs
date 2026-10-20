'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LspBridge } = require('../electron/lsp.cjs');

test('LSP bridge initializes, opens files, updates and retrieves completions', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-lsp-'));
  const fakeServer = path.resolve(__dirname, 'fake-lsp.cjs');
  fs.writeFileSync(path.join(temp, 'lsp.json'), JSON.stringify({ python: [process.execPath, fakeServer] }));
  const bridge = new LspBridge(temp);
  try {
    const request = { root: temp, file: path.join(temp, 'sample.py'), lang: 'python', content: 'prin', line: 1, column: 5 };
    const first = await bridge.complete(request);
    assert.equal(first[0].label, 'fakeCompletion');
    const second = await bridge.complete({ ...request, content: 'print(' });
    assert.equal(second[0].insertText, 'fakeCompletion');
    assert.deepEqual(await bridge.complete({ ...request, lang: 'unknown' }), []);
  } finally {
    await bridge.shutdown();
    await fs.promises.rm(temp, { recursive: true, force: true, maxRetries: 12, retryDelay: 150 });
  }
});

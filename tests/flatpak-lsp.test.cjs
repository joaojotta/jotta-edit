'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { serverSpawnSpec } = require('../electron/lsp.cjs');

test('standard runtime launches local LSP executable normally', () => {
  assert.deepEqual(serverSpawnSpec(['pylsp', '--stdio'], '/home/test/project', ''), {
    executable: 'pylsp', args: ['--stdio'], host: false
  });
});
test('Flatpak runtime launches user-installed language server on the host', () => {
  assert.deepEqual(serverSpawnSpec(['clangd', '--background-index'], '/home/test/project', 'pt.jotta.edit'), {
    executable: 'flatpak-spawn',
    args: ['--host', '--directory=/home/test/project', 'clangd', '--background-index'],
    host: true
  });
});

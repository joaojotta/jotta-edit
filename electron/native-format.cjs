'use strict';
const path = require('node:path');
const {execFile} = require('node:child_process');

async function formatNativeCode(params, {flatpak = process.env.FLATPAK_ID, runFile = execFile} = {}) {
  if (!params || !['c','cpp'].includes(params.language) || typeof params.source !== 'string'
    || Buffer.byteLength(params.source) > 5 * 1024 * 1024) throw new Error('Invalid C/C++ formatter request.');
  const {source, language, filename = '', tabWidth = 2, useTabs = false, printWidth = 'none'} = params;
  if (typeof filename !== 'string' || filename.length > 8192 || /[\0\r\n]/.test(filename)
    || !Number.isInteger(tabWidth) || tabWidth < 1 || tabWidth > 32 || typeof useTabs !== 'boolean'
    || !['none','80','100','120'].includes(String(printWidth))) throw new Error('Invalid C/C++ formatter options.');
  if (!source.trim()) return source;
  // Read the editor buffer on stdin, including unsaved edits. Never rewrite the
  // file on disk. The filename lets clang-format find the project's style.
  const assumed = path.resolve(filename || `untitled.${language === 'c' ? 'c' : 'cpp'}`);
  const style = `{BasedOnStyle: InheritParentConfig, IndentWidth: ${tabWidth}, TabWidth: ${tabWidth}, UseTab: ${useTabs ? 'ForIndentation' : 'Never'}, ColumnLimit: ${printWidth === 'none' ? 0 : Number(printWidth)}}`;
  const args = [`--assume-filename=${assumed}`, `--style=${style}`, '--fallback-style=LLVM'];
  const executable = flatpak ? 'flatpak-spawn' : 'clang-format';
  const commandArgs = flatpak ? ['--host','--watch-bus','clang-format',...args] : args;
  return new Promise((resolve,reject) => {
    const child = runFile(executable,commandArgs,{encoding:'utf8',timeout:10000,maxBuffer:16 * 1024 * 1024,windowsHide:true,shell:false},(error,stdout,stderr) => {
      if (error) {
        const missing = error.code === 'ENOENT' || flatpak && /(?:No such file|not found|Failed to execute)/i.test(stderr || '');
        reject(new Error(missing ? 'Install clang-format (version 12 or newer) on PATH, then restart Jotta Edit. Flatpak uses the host installation.'
          : error.killed ? 'C/C++ formatting timed out.' : String(stderr || error.message).trim()));
      } else if (!stdout.trim()) reject(new Error('clang-format returned empty output.'));
      else resolve(stdout);
    });
    child.stdin.on('error',() => {}); // The callback reports an early process exit.
    child.stdin.end(source);
  });
}
module.exports = {formatNativeCode};

#!/usr/bin/env node
'use strict';
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`Jotta Edit needs Node.js >=22.12.0 (recommended: Node.js 24 LTS). Found ${process.version}.`);
  console.error('Update Node.js before installing Electron dependencies.');
  process.exitCode = 1;
} else console.log(`Node ${process.version}: compatible with Electron dependency installer.`);

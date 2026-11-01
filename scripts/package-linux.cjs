#!/usr/bin/env node
'use strict';

// The pinned Flatpak bundler routes every subprocess message through debug.
// Enable that namespace before electron-builder loads it, so runtime updates,
// export errors and compression stages are visible during normal builds.
if(process.argv.slice(2).includes('flatpak')){
  process.env.DEBUG=[process.env.DEBUG,'@malept/flatpak-bundler'].filter(Boolean).join(',');
  console.log('Flatpak progress enabled. Exporting and compressing the bundle can take a minute.');
  const started=Date.now();
  setInterval(()=>{
    console.log(`Flatpak packaging is still running (${Math.round((Date.now()-started)/1000)} seconds elapsed).`);
  },30000).unref();
}

// Keep electron-builder's own argument parsing, exit codes and signal handling.
require('electron-builder/cli.js');

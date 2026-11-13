#!/usr/bin/env node
'use strict';
const {spawnSync}=require('node:child_process');

function checkFlatpakTools({run=spawnSync}={}){
  const options={encoding:'utf8',timeout:10000,windowsHide:true};
  const builder=run('flatpak-builder',['--version'],options);
  if(builder.error||builder.status!==0)throw new Error('Install flatpak-builder 1.4.0 or newer before building the Flatpak bundle.');
  const version=/flatpak-builder[\s-]+(\d+)\.(\d+)(?:\.(\d+))?/.exec(builder.stdout||'');
  if(!version)throw new Error('Cannot determine the flatpak-builder version. Version 1.4.0 or newer is required.');
  const major=Number(version[1]),minor=Number(version[2]);
  if(major<1||major===1&&minor<4)throw new Error(
    `flatpak-builder ${version[1]}.${version[2]}.${version[3]||0} is too old for this project's SDK 25.08 AppStream metadata. `+
    'Upgrade to flatpak-builder 1.4.0 or newer. Ubuntu 24.04 or newer provides compatible packages; '+
    'on Arch Linux, update flatpak-builder and appstream. Older builders call appstream-compose, which SDK 25.08 no longer ships.'
  );
  const compose=run('appstreamcli',['compose','--help'],options);
  if(compose.error||compose.status!==0)throw new Error(
    'AppStream composition is unavailable. Install appstream and its compose support on the build host '+
    '(Ubuntu: appstream-compose; Arch Linux: appstream).'
  );
  return {builderVersion:`${major}.${minor}.${version[3]||0}`};
}

if(require.main===module){
  try{const tools=checkFlatpakTools();console.log(`Flatpak toolchain checked: flatpak-builder ${tools.builderVersion}, appstreamcli compose available.`);}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={checkFlatpakTools};

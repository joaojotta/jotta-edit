'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkFlatpakTools}=require('../scripts/check-flatpak-tools.cjs');
function tools(version,{missing=false,compose=true}={}){
 const calls=[];
 return {calls,run(command,args){calls.push([command,...args]);return command==='flatpak-builder'?
  missing?{error:Object.assign(new Error('missing'),{code:'ENOENT'})}:{status:0,stdout:version}:
  {status:compose?0:1,stderr:compose?'':'Unknown command compose'};}};
}
test('Flatpak preflight rejects Ubuntu 22.04 builder before invoking removed SDK tools',()=>{
 const old=tools('flatpak-builder 1.2.2\n');
 assert.throws(()=>checkFlatpakTools(old),/1\.2\.2 is too old.*1\.4\.0 or newer/);
 assert.deepEqual(old.calls,[['flatpak-builder','--version']]);
});
test('Flatpak preflight accepts Ubuntu 24.04 and Arch version formats and compares version numbers numerically',()=>{
 for(const version of ['flatpak-builder 1.4.2\n','flatpak-builder-1.4.12\n','flatpak-builder 1.10.0\n','flatpak-builder 2.0.0\n']){
  const current=tools(version);assert.match(checkFlatpakTools(current).builderVersion,/^\d+\.\d+\.\d+$/);
  assert.deepEqual(current.calls[1],['appstreamcli','compose','--help']);
 }
});
test('missing composer support or invalid builder installations produce actionable early failures',()=>{
 assert.throws(()=>checkFlatpakTools(tools('',{missing:true})),/Install flatpak-builder/);
 assert.throws(()=>checkFlatpakTools(tools('unexpected output')),/Cannot determine/);
 assert.throws(()=>checkFlatpakTools(tools('flatpak-builder 1.4.2',{compose:false})),/Install appstream.*Ubuntu: appstream-compose/);
});

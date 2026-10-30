'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {panelDom}=require('./fixtures/panel-dom.cjs');
const transfer=import('../src/settings-transfer-panel.js');
const ids=['settings-export','settings-import','settings-import-file','settings-import-review','settings-import-summary','settings-import-apply','settings-import-cancel','settings-transfer-status'];
const json=preferences=>JSON.stringify({format:'jotta-edit-settings',version:1,preferences});
async function fixture(apply=async()=>{}) {
  const {installSettingsTransfer}=await transfer;
  const dom=panelDom(ids);dom.elements['settings-import-review'].hidden=true;
  const storage={getItem:()=>null};let downloaded;
  installSettingsTransfer({...dom,storage,apply,download:value=>downloaded=value});
  return {...dom,downloaded:()=>downloaded,choose:raw=>dom.elements['settings-import-file'].dispatch('change',{target:{files:[{size:raw.length,text:async()=>raw}],value:'chosen'}})};
}
test('imports require reviewing and applying; cancellation and picker cancellation preserve settings',async()=>{
  let count=0;const {elements,choose}=await fixture(async()=>count++);
  await choose(json({fontsize:18}));
  assert.equal(count,0); assert.equal(elements['settings-import-review'].hidden,false);
  elements['settings-import-cancel'].onclick();
  await elements['settings-import-apply'].onclick();assert.equal(count,0);
  await elements['settings-import-file'].dispatch('change',{target:{files:[],value:''}});
  assert.equal(elements['settings-import-review'].hidden,true);
  await choose(json({fontsize:18}));await elements['settings-import-apply'].onclick();
  assert.equal(count,1);assert.equal(elements['settings-import-review'].hidden,true);
  assert.match(elements['settings-transfer-status'].textContent,/imported/);
});
test('invalid and oversized files never reach the apply callback',async()=>{
  let count=0;const {elements,choose}=await fixture(async()=>count++);
  await choose(json({tabSize:3}));assert.match(elements['settings-transfer-status'].textContent,/Invalid/);
  await choose('a'.repeat(256*1024+1));assert.match(elements['settings-transfer-status'].textContent,/too large/);
  await elements['settings-import-apply'].onclick();assert.equal(count,0);
});
test('a cancelled or superseded file read cannot resurrect a staged import',async()=>{
  let applied;
  const {elements,choose}=await fixture(async value=>{applied=value;});let finish;
  const pending=elements['settings-import-file'].dispatch('change',{target:{files:[{size:100,text:()=>new Promise(resolve=>finish=resolve)}],value:'chosen'}});
  await choose(json({fontsize:20}));finish(json({fontsize:18}));await pending;
  assert.equal(elements['settings-import-review'].hidden,false);
  await elements['settings-import-apply'].onclick();
  assert.equal(applied.fontsize,20);
  let finishCancelled;
  const cancelled=elements['settings-import-file'].dispatch('change',{target:{files:[{size:100,text:()=>new Promise(resolve=>finishCancelled=resolve)}],value:'chosen'}});
  elements['settings-import-cancel'].onclick();
  finishCancelled(json({fontsize:16}));await cancelled;
  assert.equal(elements['settings-import-review'].hidden,true);
});
test('failed application keeps the candidate available and re-enables controls',async()=>{
  const {elements,choose}=await fixture(async()=>{throw new Error('Storage failure');});
  await choose(json({theme:'light'}));await elements['settings-import-apply'].onclick();
  assert.equal(elements['settings-import-review'].hidden,false);
  assert.equal(elements['settings-import-apply'].disabled,false);
  assert.match(elements['settings-transfer-status'].textContent,/Could not import/);
});
test('exports use the versioned portable settings format',async()=>{
  const {elements,downloaded}=await fixture();elements['settings-export'].onclick();
  const data=JSON.parse(downloaded());assert.equal(data.format,'jotta-edit-settings');assert.equal(data.version,1);
  assert.equal(data.preferences.fontsize,14);
});

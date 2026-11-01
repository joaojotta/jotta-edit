'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
function storage() { const values = new Map(); return {getItem:key=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key)}; }
test('project settings remain isolated and disabling overrides restores current global defaults', async () => {
  const {workspacePreferences} = await import('../src/workspace-preferences.js');
  const local = storage(), prefs = workspacePreferences(local, {tabSize:2,formatOnSave:true});
  prefs.enable('/a', true, prefs.settings(null));
  assert.ok(prefs.remember('/a','tabSize',8)); assert.ok(prefs.remember('/a','wrap',true));
  assert.equal(local.getItem('jotta.tabSize'),null);
  assert.equal(prefs.settings('/a').tabSize,8); assert.equal(prefs.settings('/b').tabSize,2);
  assert.equal(prefs.remember('/a','theme','light'),false);
  local.setItem('jotta.tabSize','4');
  assert.equal(prefs.settings('/a').tabSize,8); assert.equal(prefs.settings('/b').tabSize,4);
  prefs.enable('/a',false); assert.equal(prefs.settings('/a').tabSize,4); assert.equal(prefs.settings('/a').wrap,false);
  assert.equal(workspacePreferences(local, {}).settings('/a').tabSize,4);
});
test('recent projects are deduplicated, capped and independently removable without losing settings', async () => {
  const {workspacePreferences} = await import('../src/workspace-preferences.js');
  const local = storage(), prefs = workspacePreferences(local, {});
  for(let i=0;i<25;i++) prefs.opened('/project'+i);
  assert.equal(prefs.recents().length,20);
  prefs.opened('/project10'); assert.equal(prefs.recents()[0],'/project10');
  prefs.enable('/project10',true,{tabSize:8}); prefs.remove('/project10');
  assert.ok(!prefs.recents().includes('/project10')); assert.equal(prefs.settings('/project10').tabSize,8);
  prefs.clear(); assert.deepEqual(prefs.recents(),[]); assert.ok(prefs.enabled('/project10'));
});
test('invalid stored data is bounded and normalized, including legacy global preferences', async () => {
  const {workspacePreferences,normalizeProjectSettings} = await import('../src/workspace-preferences.js');
  const local = storage(); local.setItem('slate.tabSize','8');
  local.setItem('jotta.projectSettings','{"/a":null}');local.setItem('jotta.recentWorkspaces','[null,42,"/a","/a"]');
  const prefs = workspacePreferences(local,{});
  assert.equal(prefs.settings(null).tabSize,8);assert.equal(prefs.settings('/a').tabSize,2);
  assert.deepEqual(prefs.recents(),['/a']);
  assert.deepEqual(normalizeProjectSettings({tabSize:999,indentMode:'bad',wrap:'false',formatOnSave:'false',formatWidth:100}),
    {tabSize:2,indentMode:'spaces',wrap:false,formatOnSave:false,formatWidth:'100'});
});

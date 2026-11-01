'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const transfer=import('../src/settings-transfer.js');
const themeTools=import('../src/custom-syntax-themes.js');
function storage(seed={}) {
  const values=new Map(Object.entries(seed));
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
const json=preferences=>JSON.stringify({format:'jotta-edit-settings',version:1,preferences});
test('settings round trip themes, fonts, named transparent colours and global editor preferences',async()=>{
  const {exportSettings,parseSettingsImport,storeSettingsImport}=await transfer;
  const {createCustomTheme}=await themeTools;
  const theme=createCustomTheme({},'jotta-dark','My theme').theme;
  const source=storage({
    'jotta.fontFamily':'Fira Code','jotta.uiFontFamily':'Rubik','jotta.fontsize':'18','jotta.tabSize':'4','jotta.markdownFontSize':'20',
    'jotta.wrap':'true','jotta.plainTextHighlights':'off','jotta.customThemes':JSON.stringify({'custom-1':theme}),
    'jotta.syntaxTheme':'custom-1','jotta.interfaceColours':'{"dark":{"bg":"#123456"},"light":{}}',
    'jotta.iconColours':'{"css3.svg":"#12345680"}',
    'jotta.colourFavourites':'[{"name":"Overlay","colour":"#ff0000","alpha":0.12345}]',
    'jotta.recentColours':'[{"name":"","colour":"#112233","alpha":0}]'
  });
  const exported=exportSettings(source,{nativeFrame:false}), incoming=parseSettingsImport(exported);
  assert.equal(incoming.customThemes['custom-1'].name,'My theme');
  assert.equal(incoming.colourFavourites[0].alpha,0.12345); assert.equal(incoming.recentColours[0].alpha,0);
  assert.equal(incoming.nativeFrame,false); assert.equal(incoming.wrap,true); assert.equal(incoming.plainTextHighlights,'off');assert.equal(incoming.markdownFontSize,20);
  const destination=storage(); storeSettingsImport(destination,incoming);
  assert.equal(destination.getItem('jotta.nativeFrame'),null);
  assert.deepEqual(parseSettingsImport(exportSettings(destination,{nativeFrame:false})),incoming);
});
test('exports allow only portable fields, excluding credentials, sessions, history and project paths',async()=>{
  const {exportSettings,parseSettingsImport}=await transfer;
  const source=storage({
    'jotta.password':'SECRET','jotta.favourites':'SECRET_SERVER','jotta.recentWorkspaces':'["PRIVATE_PATH"]',
    'jotta.projectSettings':'{"PRIVATE_PATH":{"tabSize":8}}','jotta.session':'PRIVATE_BUFFER',
    'jotta.localHistory':'PRIVATE_HISTORY','slate.fontFamily':'Legacy Mono','slate.tabSize':'4',
    'jotta.tabSize':'2','jotta.iconColours':'{"password":"SECRET","css3.svg":"#aabbcc"}'
  });
  const raw=exportSettings(source);
  for(const privateValue of ['SECRET','SECRET_SERVER','PRIVATE_PATH','PRIVATE_BUFFER','PRIVATE_HISTORY']) assert.ok(!raw.includes(privateValue));
  const incoming=parseSettingsImport(raw);
  assert.equal(incoming.fontFamily,'Legacy Mono'); assert.equal(incoming.tabSize,2);
  assert.deepEqual(incoming.iconColours,{'css3.svg':'#aabbcc'});
});
test('invalid files and invalid known values fail before modifying any settings',async()=>{
  const {parseSettingsImport,SETTINGS_FILE_LIMIT}=await transfer;
  for(const raw of ['{','[]',JSON.stringify({format:'other',version:1,preferences:{theme:'dark'}}),JSON.stringify({format:'jotta-edit-settings',version:2,preferences:{theme:'dark'}})]) assert.throws(()=>parseSettingsImport(raw),/Invalid/);
  for(const value of [{theme:'sepia'},{tabSize:3},{fontsize:100},{wrap:'false'},{fontFamily:'";evil'},{plainTextHighlights:'never'},{nativeFrame:0},{customThemes:{'custom-1':{name:'Missing palette'}}},{interfaceColours:{dark:{bg:'url(evil)'}}},{iconColours:{'../../evil':'#ffffff'}},{colourFavourites:[{colour:'#ffffff',alpha:2}]},{colourFavourites:Array(31).fill('#ffffff')}]) assert.throws(()=>parseSettingsImport(json(value)),/Invalid/,JSON.stringify(value));
  assert.throws(()=>parseSettingsImport('a'.repeat(SETTINGS_FILE_LIMIT+1)),/too large/);
});
test('partial imports preserve project overrides and unrelated local data',async()=>{
  const {parseSettingsImport,storeSettingsImport}=await transfer;
  const {workspacePreferences}=await import('../src/workspace-preferences.js');
  const source=storage({'jotta.tabSize':'2','jotta.fontsize':'14','jotta.session':'draft','jotta.projectSettings':'{"/project":{"indentMode":"tabs","tabSize":8}}'});
  storeSettingsImport(source,parseSettingsImport(json({tabSize:4,fontsize:18,password:'MALICIOUS',projectSettings:{}})));
  assert.equal(source.getItem('jotta.tabSize'),'4'); assert.equal(source.getItem('jotta.fontsize'),'18');
  assert.equal(source.getItem('jotta.session'),'draft'); assert.equal(source.getItem('jotta.password'),null);
  const workspace=workspacePreferences(source,{});
  assert.equal(workspace.settings('/project').tabSize,8);
  workspace.enable('/project',false);
  assert.equal(workspace.settings('/project').tabSize,4);
});
test('failed writes restore every original storage value and successful commits can be rolled back',async()=>{
  const {storeSettingsImport}=await transfer;
  const data=storage({'jotta.theme':'light','jotta.fontsize':'14','jotta.session':'draft'}), original=[...data.values];
  const set=data.setItem;
  data.setItem=(key,value)=>{if(key==='jotta.fontsize'&&value==='18')throw new Error('Quota');set(key,value);};
  assert.throws(()=>storeSettingsImport(data,{theme:'dark',fontFamily:'Mono',fontsize:18}),/Quota/);
  assert.deepEqual([...data.values],original);
  data.setItem=set;
  const restore=storeSettingsImport(data,{theme:'dark',fontsize:18});
  assert.equal(data.getItem('jotta.theme'),'dark');restore();assert.deepEqual([...data.values],original);
});
test('legacy colour collections import with opacity and untrusted object keys never escape the allowlist',async()=>{
  const {parseSettingsImport,storeSettingsImport}=await transfer;
  const incoming=parseSettingsImport('{"format":"jotta-edit-settings","version":1,"preferences":{"theme":"dark","colourFavourites":["#1234"],"__proto__":{"polluted":true},"session":"malicious"}}');
  assert.deepEqual(incoming.colourFavourites,[{name:'',colour:'#112233',alpha:68/255}]);
  const data=storage();storeSettingsImport(data,incoming);
  assert.equal(data.getItem('jotta.session'),null);assert.equal({}.polluted,undefined);
  assert.equal(Object.hasOwn(incoming,'__proto__'),false);
});
test('quota rollback releases newly allocated space before restoring larger original values',async()=>{
  const {storeSettingsImport}=await transfer;
  const data=storage({'jotta.fontFamily':'a'.repeat(60),'jotta.uiFontFamily':'b'});
  const original=[...data.values], set=data.setItem;
  data.setItem=(key,value)=>{
    const candidate=new Map(data.values);candidate.set(key,value);
    if([...candidate.values()].reduce((sum,text)=>sum+text.length,0)>70)throw new Error('Quota');
    set(key,value);
  };
  assert.throws(()=>storeSettingsImport(data,{fontFamily:'a',uiFontFamily:'b'.repeat(60),fontsize:18,theme:'light',previewBrowser:'firefox'}),/Quota/);
  assert.deepEqual([...data.values],original);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {panelDom}=require('./fixtures/panel-dom.cjs');
test('Problems lists built-in markers, filters messages and navigates to file and location',async()=>{
  const {installProblemsPanel}=await import('../src/problems-panel.js');
  const dom=panelDom(['problems-panel','problems-list','problems-status','problems-filter','btn-problems']);
  const doc={id:'one',name:'a.js',path:'/a.js',model:{uri:{path:'/a.js'}}},opened=[];let changed,show;
  const monaco={MarkerSeverity:{Error:8,Warning:4},editor:{getModelMarkers:()=>[{severity:8,message:'Syntax error',startLineNumber:3,startColumn:4,source:'javascript'}],onDidChangeMarkers(fn){changed=fn;return {dispose(){}};}}};
  const panel=installProblemsPanel({monaco,sidebar:{onShow(_name,fn){show=fn;},show(){show();}},getDocuments:()=>[doc],openFile:(...args)=>opened.push(args),documentRef:dom.documentRef});
  panel.show();const row=dom.elements['problems-list'].children[0].children[0];assert.match(row.children[0].textContent,/Syntax error/);
  row.onclick();assert.equal(opened[0][0],'/a.js');assert.equal(opened[0][1].line,3);
  dom.elements['problems-filter'].value='missing';dom.elements['problems-filter'].dispatch('input');assert.equal(dom.elements['problems-list'].children.length,0);
  dom.elements['problems-filter'].value='';changed();assert.equal(dom.elements['problems-list'].children.length,1);panel.dispose();
});
test('Language servers settings show availability and save executable and quoted arguments',async()=>{
  const {installLanguageServerSettings}=await import('../src/language-server-settings.js');
  const dom=panelDom(['host']);let saved,restarted=false;
  const servers=[{lang:'python',command:['/tools/python server','--stdio'],enabled:true,available:true,status:''}];
  const api={listLanguageServers:async()=>servers,configureLanguageServers:async value=>{saved=value;return servers;}};
  const panel=installLanguageServerSettings({api,host:dom.elements.host,onApplied:()=>{restarted=true;},documentRef:dom.documentRef});
  await panel.refresh();const fieldset=dom.elements.host.children[3].children[0];
  assert.equal(fieldset.children[1].textContent,'Available');
  fieldset.children[4].children[0].value='--stdio "argument with spaces"';
  await dom.elements.host.children[2].children[0].onclick();
  assert.deepEqual(saved.python,['/tools/python server','--stdio','argument with spaces']);assert.equal(restarted,true);
});
test('web settings explain the desktop requirement without invoking external tools',async()=>{
  const {installLanguageServerSettings}=await import('../src/language-server-settings.js'),dom=panelDom(['host']);
  const panel=installLanguageServerSettings({api:{},host:dom.elements.host,documentRef:dom.documentRef});await panel.refresh();
  assert.equal(dom.elements.host.children[2].hidden,true);assert.match(dom.elements.host.children[0].textContent,/desktop/);
});

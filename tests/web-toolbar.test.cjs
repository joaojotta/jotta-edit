'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {panelDom}=require('./fixtures/panel-dom.cjs');
const source=import('../src/web-toolbar.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('the primary web action follows the save destination, with drafts and missing files using Save As',async()=>{
  const {webFilePresentation:view}=await source;
  const doc={id:'a',path:'/imports/a.css',dirty:true};
  assert.equal(view(doc,'Download copy').label,'Download file');assert.equal(view(doc,'Download copy').status,'Unsaved edits');
  for(const location of ['Local file','Local folder','Browser storage'])assert.equal(view(doc,location).label,'Save');
  assert.equal(view({...doc,dirty:false},'Browser storage').status,'Saved in browser');
  assert.equal(view({...doc,dirty:false},'Download copy').status,'Ready to download');
  assert.equal(view({...doc,saving:true},'Download copy').status,'Saving…');
  assert.equal(view({...doc,path:null},null).label,'Save as…');
  assert.equal(view({...doc,missing:true},'Download copy').label,'Save as…');
  assert.equal(view(null,null).status,'No file open');
});
async function fixture(api){
  const {installWebToolbar}=await source;
  const ids=['workspace-toggle','new-project','open-file','recent-workspaces','open-folder','import-toggle','import-folder','import-zip','export-zip','workspace-name','save-file','save-as','download-file','file-options','save-label','save-status','save-location'].map(id=>'web-'+id);
  const {documentRef,elements}=panelDom(ids),toolbar=documentRef.createElement('header'),handlers={};
  const icon={style:{setProperty(){}}};elements['web-save-file'].querySelector=()=>icon;
  documentRef.querySelector=()=>toolbar;documentRef.baseURI='https://example.com/editor/';
  const windowRef={addEventListener(type,fn){handlers[type]=fn;},send(type,detail){handlers[type]?.({detail});}};
  const controller=installWebToolbar({api,documentRef,windowRef});
  return {controller,elements,windowRef,document(value,root='/project'){windowRef.send('jotta:web-document-changed',{document:value,root});}};
}
test('late save-destination lookups cannot change a different tab or re-enable controls after closing it',async()=>{
  const pending=new Map();const f=await fixture({saveLocation:path=>new Promise(resolve=>pending.set(path,resolve))});
  f.windowRef.send('jotta:web-ready');f.document({id:'a',path:'/a',dirty:true});await tick();
  f.document({id:'b',path:'/b',dirty:false});await tick();
  pending.get('/b')('Local file');await tick();pending.get('/a')('Download copy');await tick();
  assert.equal(f.elements['web-save-label'].textContent,'Save');assert.equal(f.elements['web-save-status'].textContent,'Saved');
  f.document({id:'c',path:'/c',dirty:true});await tick();f.document(null);pending.get('/c')('Download copy');await tick();
  assert.equal(f.elements['web-save-status'].textContent,'No file open');assert.equal(f.elements['web-save-file'].disabled,true);
});
test('ready, workspace and document busy states control only the corresponding actions',async()=>{
  let lookups=0;const f=await fixture({saveLocation:async()=>{lookups++;return 'Browser storage';}});
  assert.equal(f.elements['web-workspace-toggle'].disabled,true);f.windowRef.send('jotta:web-ready');
  assert.equal(f.elements['web-new-project'].disabled,false);assert.equal(f.elements['web-export-zip'].disabled,true);
  const doc={id:'a',path:'/project/a.css',dirty:false};f.document(doc);await tick();
  assert.equal(f.elements['web-export-zip'].disabled,false);assert.equal(f.elements['web-workspace-name'].textContent,'project');
  f.document({...doc,dirty:true});assert.equal(f.elements['web-save-status'].textContent,'Unsaved edits');assert.equal(lookups,1);
  f.document({...doc,saving:true});assert.equal(f.elements['web-save-file'].disabled,true);assert.equal(f.elements['web-save-as'].disabled,true);
  f.document(doc);f.controller.setWorkspaceBusy(true);assert.equal(f.elements['web-open-folder'].disabled,true);assert.equal(f.elements['web-save-file'].disabled,false);
  f.controller.setWorkspaceBusy(false);f.document(doc,null);assert.equal(f.elements['web-export-zip'].disabled,true);
});
test('read-only image tabs offer downloading and disable Save As',async()=>{
  const f=await fixture({saveLocation:async()=> 'Browser storage'});f.windowRef.send('jotta:web-ready');
  f.document({id:'image',path:'/project/photo.png',readOnly:true,dirty:false});await tick();
  assert.equal(f.elements['web-save-label'].textContent,'Download file');
  assert.equal(f.elements['web-save-file'].disabled,false);assert.equal(f.elements['web-download-file'].disabled,false);
  assert.equal(f.elements['web-save-as'].disabled,true);
});

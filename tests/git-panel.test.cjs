'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {panelDom}=require('./fixtures/panel-dom.cjs');
const ids=['git-panel','git-changes','git-status','status-git','git-filter','btn-git','git-refresh','git-diff-title','git-diff-labels','git-diff-open','git-diff-dialog','git-diff-editor','git-diff-close','git-diff-done','git-diff-overlay'];
const snapshot=(root='/repo',branch='main')=>({root,branch,head:'a'.repeat(40),detached:false,changes:[
  {path:root+'/a.txt',relativePath:'a.txt',kind:'modified',index:' ',worktree:'M'},
  {path:root+'/removed.txt',relativePath:'removed.txt',kind:'deleted',index:' ',worktree:'D'}
],watchFolders:[root,root+'/.git']});
function model(text){let disposed=false;return {text,getLanguageId:()=>'plaintext',getValue(){return this.text;},isDisposed:()=>disposed,dispose(){disposed=true;}};}
async function fixture({supported=true}={}){
  const {installGitPanel}=await import('../src/git-panel.js'),dom=panelDom(ids);dom.elements['git-panel'].hidden=false;
  const context={root:'/repo',roots:['/repo'],file:'/repo/a.txt',visible:true},docs=[{path:'/repo/a.txt',model:model('unsaved draft')}],notifications=[],opened=[];
  let pair,options,shows=0,changed=0,panel;
  const api=supported?{gitStatus:async root=>snapshot(root),gitCompare:async({file})=>({file,head:'a'.repeat(40),headText:'committed',workingText:'disk',exists:true})}:{};
  const monaco={editor:{createModel:text=>model(text),createDiffEditor(_host,value){options=value;return {setModel(value){pair=value;},layout(){}};}}};
  const views={};const sidebar={onShow(name,fn){views[name]=fn;},show(name){views[name]?.();}};
  panel=installGitPanel({api,monaco,sidebar,getContext:()=>context,getDocuments:()=>docs,languageOf:()=>'plaintext',
    openFile:file=>opened.push(file),showDiff(){panel.closeDiff();shows++;},hideDiff(){panel.closeDiff();},notify:text=>notifications.push(text),
    changed(){changed++;},documentRef:dom.documentRef});
  panel.start();if(supported)await panel.refresh();
  return {panel,api,dom,context,docs,notifications,opened,get pair(){return pair;},get shows(){return shows;},get options(){return options;},get changed(){return changed;}};
}
test('Git branch, file badges and changed-file filtering follow the repository snapshot',async t=>{
  const f=await fixture();t.after(()=>f.panel.stop());
  assert.match(f.dom.elements['status-git'].textContent,/main/);assert.equal(f.dom.elements['status-git'].hidden,false);
  const element=f.dom.documentRef.createElement('div');f.panel.decorate(element,'/repo/a.txt');assert.equal(element.children[0].textContent,'M');
  const folder=f.dom.documentRef.createElement('div');f.panel.decorate(folder,'/repo',true);assert.equal(folder.children[0].textContent,'●');
  assert.ok(f.panel.watchFolders.includes('/repo/.git'));
  f.dom.elements['git-filter'].value='removed';f.dom.elements['git-filter'].dispatch('input');
  const group=f.dom.elements['git-changes'].children[0];assert.equal(group.children.length,2);assert.match(group.children[1].title,/removed/);
});
test('Git comparison uses the live unsaved model and only disposes models owned by the comparison',async t=>{
  const f=await fixture();t.after(()=>f.panel.stop());await f.panel.compare();
  assert.equal(f.pair.original.getValue(),'committed');assert.equal(f.pair.modified,f.docs[0].model);assert.equal(f.options.readOnly,true);
  f.docs[0].model.text='typed while reviewing';assert.equal(f.pair.modified.getValue(),'typed while reviewing');
  const original=f.pair.original;f.panel.closeDiff();assert.equal(original.isDisposed(),true);assert.equal(f.docs[0].model.isDisposed(),false);
  assert.equal(f.docs[0].model.getValue(),'typed while reviewing');
});
test('deleted-file comparisons show an empty working side without creating or modifying tabs',async t=>{
  const f=await fixture();t.after(()=>f.panel.stop());
  f.api.gitCompare=async({file})=>({file,head:'a'.repeat(40),headText:'deleted content',workingText:'',exists:false});
  await f.panel.compare('/repo/removed.txt','/repo');
  assert.equal(f.pair.modified.getValue(),'');assert.equal(f.pair.original.getValue(),'deleted content');assert.equal(f.docs.length,1);
  assert.equal(f.dom.elements['git-diff-open'].hidden,true);const modified=f.pair.modified;f.panel.closeDiff();assert.equal(modified.isDisposed(),true);
});
test('late Git status and comparison requests cannot populate another workspace',async t=>{
  const f=await fixture();t.after(()=>f.panel.stop());let finish;
  f.api.gitCompare=()=>new Promise(resolve=>{finish=resolve;});const comparison=f.panel.compare();
  f.context.root='/other';f.context.roots=['/other'];f.context.file='/other/b.txt';f.panel.updateContext();
  finish({headText:'stale',workingText:'stale',exists:true});await comparison;assert.equal(f.shows,0);
  f.api.gitStatus=async root=>snapshot(root,'other-branch');await f.panel.refresh();
  assert.match(f.dom.elements['status-git'].textContent,/other-branch/);
});
test('unchanged Git refreshes preserve rendered rows and web adapters hide Git controls',async t=>{
  const f=await fixture();t.after(()=>f.panel.stop());const count=f.changed;await f.panel.refresh();assert.equal(f.changed,count);
  const web=await fixture({supported:false});t.after(()=>web.panel.stop());
  assert.equal(web.dom.elements['btn-git'].hidden,true);assert.equal(web.dom.elements['status-git'].hidden,true);
});
test('Git absence and errors clear stale markers and remain visible in the Changes panel',async t=>{
  const f=await fixture();t.after(()=>f.panel.stop());f.api.gitStatus=async()=>{throw new Error('Git is not installed or is not on PATH.');};
  await f.panel.refresh();assert.match(f.dom.elements['git-status'].textContent,/not installed/);assert.equal(f.dom.elements['status-git'].hidden,true);
  const element=f.dom.documentRef.createElement('div');f.panel.decorate(element,'/repo/a.txt');assert.equal(element.children.length,0);
});

test('branch display follows the active repository and hides for a file outside all repositories',async t=>{
  const f=await fixture();t.after(()=>f.panel.stop());f.context.roots=['/repo','/other'];
  f.api.gitStatus=async root=>snapshot(root,root==='/repo'?'main':'feature');f.panel.updateContext();await f.panel.refresh();
  f.context.file='/other/a.txt';f.panel.updateContext();assert.match(f.dom.elements['status-git'].textContent,/feature/);
  f.context.file='/unrelated/plain.txt';f.panel.updateContext();assert.equal(f.dom.elements['status-git'].hidden,true);
});

test('status results from a previous workspace are discarded while a replacement refresh is queued',async t=>{
  const f=await fixture();t.after(()=>f.panel.stop());let finish;
  f.api.gitStatus=()=>new Promise(resolve=>{finish=resolve;});const pending=f.panel.refresh();
  f.context.roots=['/next'];f.context.root='/next';f.context.file='/next/a.txt';f.panel.updateContext();
  finish(snapshot('/repo','stale'));await pending;
  assert.equal(f.dom.elements['status-git'].hidden,true);
  f.api.gitStatus=async()=>snapshot('/next','fresh');await f.panel.refresh();assert.match(f.dom.elements['status-git'].textContent,/fresh/);
});

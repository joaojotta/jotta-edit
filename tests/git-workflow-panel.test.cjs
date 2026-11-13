'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {panelDom}=require('./fixtures/panel-dom.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({prepare=async()=>true}={}){
 const {installGitWorkflow}=await import('../src/git-workflow.js'),{documentRef,elements}=panelDom(['host']);
 const context={roots:['/repo'],file:'/repo/a.txt'},calls=[],notices=[],opened=[],completed=[];
 let listener,id=0,refreshed=0;
 const repo={root:'/repo',head:'a'.repeat(40),branch:'main',changes:[{path:'/repo/a.txt',relativePath:'a.txt',index:'M',worktree:'M',kind:'modified'}]};
 const api={gitOperation:async params=>{calls.push(params);return {id:++id};},onGitEvent:fn=>{listener=fn;return ()=>{listener=null;};},gitDetails:async()=>({...repo,branches:['main','feature'],remotes:[{name:'origin',url:'https://github.com/o/r.git'}],identity:{name:'User',email:'user@example.invalid'},indexState:'b'.repeat(64)}),gitAccount:async()=>({available:true,connected:true,login:'user'}),cancelGit:async()=>true};
 const compared=[],edited=[];
 const ui=installGitWorkflow({api,host:elements.host,getContext:()=>context,getDocuments:()=>[],prepare,openFolder:root=>opened.push(root),openFile:file=>edited.push(file),refresh:async()=>{refreshed++;},compare:(...args)=>compared.push(args),operationDone:(...args)=>completed.push(args),notify:text=>notices.push(text),documentRef});
 ui.start();ui.render([repo]);await tick();
 const all=(root=elements.host)=>[root,...root.children.flatMap(child=>all(child))];
 const field=label=>all().find(el=>el.getAttribute('aria-label')===label);
 const button=label=>all().find(el=>el.tag==='button'&&el.textContent===label);
 return {ui,api,repo,context,calls,notices,opened,compared,edited,completed,documentRef,all,field,button,emit:event=>listener?.(event),get refreshed(){return refreshed;}};
}

test('staging saves only selected dirty documents and blocks failed saves or changed paths',async()=>{
 const {prepareGitOperation}=await import('../src/git-workflow.js');
 const selected={path:'/repo/a.txt',dirty:true},other={path:'/repo/b.txt',dirty:true},outside={path:'/other/c.txt',dirty:true};let docs=[selected,other,outside],saved=[];
 const options={getDocuments:()=>docs,save:async doc=>{saved.push(doc);doc.dirty=false;return true;}};
 assert.equal(await prepareGitOperation({action:'stage',folder:'/repo',files:[selected.path]},options),true);assert.deepEqual(saved,[selected]);assert.equal(other.dirty,true);
 selected.dirty=true;assert.equal(await prepareGitOperation({action:'stage',folder:'/repo',files:[selected.path]},{...options,save:async()=>false}),false);
 assert.equal(await prepareGitOperation({action:'stage',folder:'/repo',files:[selected.path]},{...options,save:async doc=>{doc.path='/other/moved';doc.dirty=false;return true;}}),false);
});
test('pull refuses unsaved repository buffers and leaves unrelated documents alone',async()=>{
 const {prepareGitOperation}=await import('../src/git-workflow.js');
 const dirty={path:'/repo/file.txt',dirty:true},outside={path:'/other/file.txt',dirty:true},options={getDocuments:()=>[dirty,outside],save:async()=>{throw Error('must not auto-save');}};
 await assert.rejects(prepareGitOperation({action:'pull',folder:'/repo'},options),/Save unsaved/);dirty.dirty=false;
 assert.equal(await prepareGitOperation({action:'pull',folder:'/repo'},options),true);
 assert.equal(await prepareGitOperation({action:'commit',folder:'/repo'},options),true);
});
test('Git writes remain unavailable on browser adapters',async()=>{
 const {installGitWorkflow}=await import('../src/git-workflow.js');const dom=panelDom(['host']);dom.elements.host.hidden=true;
 assert.equal(installGitWorkflow({api:{},host:dom.elements.host,documentRef:dom.documentRef}),null);assert.equal(dom.elements.host.hidden,true);
});
test('staged and unstaged rows compare their own baselines and stage the clicked repository',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());const group=f.documentRef.createElement('div');
 f.all().find(el=>el.tag==='details'&&el.children[0]?.textContent==='Advanced').open=true;
 assert.equal(f.ui.renderRepository(group,f.repo,''),2);
 const flatten=root=>[root,...root.children.flatMap(flatten)];const buttons=flatten(group).filter(el=>el.tag==='button');
 buttons[0].onclick();buttons[2].onclick();assert.equal(f.compared[0][2],'staged');assert.equal(f.compared[1][2],'unstaged');
 buttons.find(button=>button.textContent==='Stage').onclick();await tick();assert.equal(f.calls[0].folder,'/repo');assert.deepEqual(f.calls[0].files,['/repo/a.txt']);
});
test('commits carry the reviewed index snapshot and keep the message when Git fails',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());const message=f.field('Commit message');message.value='My change';message.dispatch('input');
 f.button('Commit staged changes').onclick();await tick();assert.equal(f.calls[0].message,'My change');assert.equal(f.calls[0].indexState,'b'.repeat(64));
 f.emit({id:1,type:'done',ok:false,error:'Staged changes have changed.',action:'commit'});await tick();assert.equal(message.value,'My change');assert.match(f.notices.at(-1),/Staged changes/);
 f.button('Commit staged changes').onclick();await tick();f.emit({id:2,type:'done',ok:true,action:'commit',result:{root:'/repo'}});await tick();assert.equal(message.value,'');
});
test('a workspace change during preparation prevents dispatch and stale events cannot complete another operation',async t=>{
 let finish;const f=await fixture({prepare:()=>new Promise(resolve=>finish=resolve)});t.after(()=>f.ui.stop());
 const pending=f.ui.perform('pull',{folder:'/repo'});f.context.roots=['/other'];finish(true);assert.equal(await pending,false);assert.equal(f.calls.length,0);
 assert.match(f.notices.at(-1),/Workspace changed/);
});
test('clone completion preserves a workspace opened while cloning and exposes the new repository for later opening',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());await f.ui.perform('clone',{url:'o/r',parent:'/parent',name:'r'});f.context.roots=['/other'];
 f.emit({id:1,type:'done',ok:true,action:'clone',result:{root:'/parent/r'}});await tick();assert.deepEqual(f.opened,[]);
 f.button('Open cloned repository').onclick();assert.deepEqual(f.opened,['/parent/r']);
});
test('account repository selection populates cloning and operation IDs arriving after events are handled',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());
 f.api.gitOperation=async params=>{f.calls.push(params);f.emit({id:9,type:'done',ok:true,action:'repositories',result:{page:1,repositories:[{name:'o/r',url:'https://github.com/o/r.git',private:true}]}});return {id:9};};
 await f.ui.perform('repositories',{page:1});const select=f.field('GitHub repositories');assert.equal(select.hidden,false);assert.equal(select.children.length,2);
 select.value='https://github.com/o/r.git';select.dispatch('change');assert.equal(f.field('Repository URL or owner/repository').value,select.value);assert.equal(f.field('New folder name').value,'r');
});

test('an explicit remote branch selection survives status and staging refreshes',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());const target=f.field('Remote branch');target.value='review/my-changes';target.dispatch('input');
 await f.ui.loadDetails(true);assert.equal(target.value,'review/my-changes');
 f.repo.changes[0].worktree=' ';f.ui.render([f.repo]);await tick();assert.equal(target.value,'review/my-changes');
});

test('branch operations and publishing reject dirty editor buffers without saving them',async()=>{
 const {prepareGitOperation}=await import('../src/git-workflow.js');
 const dirty={path:'/repo/file.txt',dirty:true},outside={path:'/other/file.txt',dirty:true};
 const options={getDocuments:()=>[dirty,outside],save:async()=>{throw Error('must not auto-save');}};
 for(const action of ['createBranch','switchBranch','publish'])await assert.rejects(prepareGitOperation({action,folder:'/repo'},options),/Save unsaved/);
 dirty.dirty=false;
 for(const action of ['createBranch','switchBranch','publish'])assert.equal(await prepareGitOperation({action,folder:'/repo'},options),true);
});

test('unversioned local folders offer initialization with private GitHub identity and publishing defaults to private',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());f.ui.render([]);await tick();
 assert.equal(f.field('Project folder').value,'/repo');assert.equal(f.field('Visibility').value,'private');
 assert.equal(f.button('Initialize Git').hidden,false);assert.equal(f.button('Create repository and publish').disabled,true);
 f.button('Initialize Git').onclick();await tick();assert.deepEqual(f.calls[0],{action:'init',folder:'/repo',githubIdentity:true});
});

test('publishing sends the selected project branch, head and visibility while connecting an existing remote stays separate',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());f.repo.changes=[];f.ui.render([f.repo]);await tick();
 assert.equal(f.button('Create repository and publish').disabled,false);
 f.field('GitHub repository name').value='my-editor';f.field('Visibility').value='public';
 f.button('Create repository and publish').onclick();await tick();
 assert.deepEqual(f.calls[0],{action:'publish',folder:'/repo',name:'my-editor',visibility:'public',remote:'origin',branch:'main',head:f.repo.head});
 f.emit({id:1,type:'done',ok:true,action:'publish',result:{root:'/repo'}});await tick();
 f.field('Remote name').value='upstream';f.field('Existing repository URL').value='owner/existing';f.button('Add remote').onclick();await tick();
 assert.deepEqual(f.calls[1],{action:'remote',folder:'/repo',remote:'upstream',url:'owner/existing'});
});

test('branch controls refuse dirty repositories and submit the reviewed branch and head when clean',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());const name=f.field('New branch name');name.value='feature/new';name.dispatch('input');
 assert.equal(f.button('Create and switch branch').disabled,true);
 f.repo.changes=[];f.ui.render([f.repo]);await tick();assert.equal(f.button('Create and switch branch').disabled,false);
 f.button('Create and switch branch').onclick();await tick();assert.deepEqual(f.calls[0],{action:'createBranch',folder:'/repo',name:'feature/new',branch:'main',head:f.repo.head});
 f.emit({id:1,type:'done',ok:true,action:'createBranch',result:{root:'/repo'}});await tick();assert.equal(name.value,'');
 f.field('Local branch').value='feature';f.field('Local branch').dispatch('change');assert.equal(f.button('Switch branch').disabled,false);
 f.button('Switch branch').onclick();await tick();assert.deepEqual(f.calls[1],{action:'switchBranch',folder:'/repo',name:'feature',branch:'main',head:f.repo.head});
});

test('private email setup is explicit and failure recovery appears beside the operation error',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());f.button('Use GitHub private email').onclick();await tick();
 assert.deepEqual(f.calls[0],{action:'githubIdentity',folder:'/repo'});
 f.emit({id:1,type:'done',ok:false,action:'githubIdentity',error:'Authentication failed',help:'Check your GitHub connection or SSH credentials, then retry. GitHub connection uses the shared GitHub CLI account.'});await tick();
 const help=f.all().find(el=>el.textContent.startsWith('Check your GitHub connection or SSH credentials'));
 assert.ok(help);assert.equal(help.hidden,false);assert.match(f.notices.at(-1),/Authentication failed/);
});

test('publishing a subfolder identifies the full repository and changing projects restores private visibility',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());f.context.roots=['/repo/nested','/other'];f.repo.changes=[];f.ui.render([f.repo]);await tick();
 const projects=f.field('Project folder');assert.deepEqual(projects.children.map(option=>option.value),['/repo','/other']);assert.equal(projects.value,'/repo');
 f.field('Visibility').value='public';projects.value='/other';projects.dispatch('change');assert.equal(f.field('Visibility').value,'private');assert.equal(f.button('Initialize Git').hidden,false);
 f.field('Visibility').value='public';f.context.roots=['/new-project'];f.ui.render([]);await tick();
 assert.equal(projects.value,'/new-project');assert.equal(f.field('Visibility').value,'private');
});

test('the default view focuses on the current project and keeps setup tools under closed Advanced',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());
 const advanced=f.all().find(el=>el.tag==='details'&&el.children[0]?.textContent==='Advanced');assert.equal(advanced.open,false);
 for(const label of ['GitHub connection','Clone repository','Publish project to GitHub','Branches','Remote and identity']){
  const section=f.all().find(el=>el.tag==='details'&&el.children[0]?.textContent===label);assert.equal(advanced.contains(section),true,label);
 }
 assert.equal(advanced.contains(f.button('Update project')),false);assert.equal(advanced.contains(f.button('Save and commit all')),false);
 assert.equal(f.ui.visibleRepository({root:'/other'}),false);advanced.open=true;assert.equal(f.ui.visibleRepository({root:'/other'}),true);
});
test('simple commit saves only current-project documents and update blocks unsaved documents',async()=>{
 const {prepareGitOperation}=await import('../src/git-workflow.js');
 const doc={path:'/repo/a.txt',dirty:true},other={path:'/other/b.txt',dirty:true},saved=[];
 const options={getDocuments:()=>[doc,other],save:async d=>{saved.push(d);d.dirty=false;return true;}};
 await assert.rejects(prepareGitOperation({action:'update',folder:'/repo'},options),/Save unsaved/);
 assert.equal(await prepareGitOperation({action:'commitAll',folder:'/repo',files:[doc.path]},options),true);assert.deepEqual(saved,[doc]);assert.equal(other.dirty,true);
 doc.dirty=true;await assert.rejects(prepareGitOperation({action:'abortMerge',folder:'/repo'},options),/Save unsaved/);
});
test('simple commit carries the current project snapshot and update uses a reviewed head',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());f.field('Commit message').value='Update';f.field('Commit message').dispatch('input');
 f.button('Save and commit all').onclick();await tick();assert.equal(f.calls[0].action,'commitAll');assert.deepEqual(f.calls[0].files,['/repo/a.txt']);assert.equal(f.calls[0].head,f.repo.head);
 f.emit({id:1,type:'done',ok:true,action:'commitAll',result:{root:'/repo'}});await tick();assert.equal(f.field('Commit message').value,'');
 f.button('Update project').onclick();await tick();assert.equal(f.calls[1].action,'update');assert.equal(f.calls[1].head,f.repo.head);
});

test('simple mode follows the active project while Advanced allows another repository selection',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());
 const second={...f.repo,root:'/other',changes:[]};f.ui.render([f.repo,second]);await tick();assert.equal(f.ui.visibleRepository(f.repo),true);
 f.context.file='/other/file.txt';f.ui.render([f.repo,second]);await tick();assert.equal(f.field('Repository').value,'/other');assert.equal(f.ui.visibleRepository(f.repo),false);
 const advanced=f.all().find(el=>el.tag==='details'&&el.children[0]?.textContent==='Advanced');advanced.open=true;
 f.field('Repository').value='/repo';f.field('Repository').dispatch('change');f.ui.render([f.repo,second]);assert.equal(f.field('Repository').value,'/repo');
});
test('failed updates still refresh open documents and expose merge recovery without uploading',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());await f.ui.perform('update',{folder:'/repo'});
 f.emit({id:1,type:'done',action:'update',ok:false,error:'CONFLICT',help:'Resolve conflicts'});await tick();
 assert.equal(f.completed[0][0],'update');assert.equal(f.calls.length,1);assert.equal(f.field('Commit message').value,'');
});

test('merge recovery opens files and only resolves conflicts belonging to the loaded project',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());const getDetails=f.api.gitDetails;
 f.api.gitDetails=async()=>({...await getDetails(),mergeHead:'c'.repeat(40)});
 f.repo.changes=[{path:'/repo/a.txt',relativePath:'a.txt',index:'U',worktree:'U',kind:'conflict'}];
 f.ui.render([f.repo]);await tick();await f.ui.loadDetails(true);
 const group=f.documentRef.createElement('div');f.ui.renderRepository(group,f.repo,'');
 const buttons=group.querySelectorAll('button'),edit=buttons.find(el=>el.textContent==='Open file'),resolve=buttons.find(el=>el.textContent==='Mark resolved');
 edit.onclick();assert.deepEqual(f.edited,['/repo/a.txt']);assert.equal(resolve.disabled,false);assert.equal(f.button('Finish merge').disabled,true);
 resolve.onclick();await tick();assert.equal(f.calls[0].action,'resolveConflict');assert.equal(f.calls[0].mergeHead,'c'.repeat(40));
 f.emit({id:1,type:'done',action:'resolveConflict',ok:true,result:{root:'/repo'}});await tick();
 const advanced=f.all().find(el=>el.tag==='details'&&el.children[0]?.textContent==='Advanced');advanced.open=true;
 const other=f.documentRef.createElement('div');f.ui.renderRepository(other,{...f.repo,root:'/other'},'');await f.ui.loadAccount();
 assert.equal(other.querySelectorAll('button').find(el=>el.textContent==='Mark resolved').disabled,true);
});

test('simple upload uses the project upstream instead of a hidden Advanced target',async t=>{
 const f=await fixture();t.after(()=>f.ui.stop());
 f.field('Remote branch').value='another-branch';f.field('Remote branch').dispatch('input');
 f.button('Upload commits').onclick();await tick();assert.equal(f.calls[0].remote,'origin');assert.equal(f.calls[0].target,'main');
});

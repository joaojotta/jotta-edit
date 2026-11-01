'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile);
const {GitService,runGit}=require('../electron/git.cjs');
const {GitWorkflow,GitCommandRunner,remoteURL,toolStep,clean}=require('../electron/git-workflow.cjs');
async function fixture(t,{commit=true}={}){
 const disk=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-workflow $ ')),root=path.join(disk,'repo');
 await fs.mkdir(root);await fs.writeFile(path.join(disk,'config'),'');await fs.mkdir(path.join(disk,'hooks'));
 const environment={...process.env,FLATPAK_ID:'',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:path.join(disk,'config')};
 for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_CONFIG_COUNT'])delete environment[key];
 const git=async(...args)=>(await exec('git',['-C',root,...args],{env:environment,timeout:10000})).stdout;
 await git('init','-b','main');await git('config','user.name','Test User');await git('config','user.email','test@example.invalid');await git('config','commit.gpgsign','false');await git('config','core.hooksPath',path.join(disk,'hooks'));
 await fs.writeFile(path.join(root,'file.txt'),'base\n');await fs.writeFile(path.join(root,'old.txt'),'rename\n'.repeat(20));
 if(commit){await git('add','.');await git('commit','-m','Initial');}
 const service=new GitService({run:(folder,args)=>runGit(folder,args,{environment,flatpakId:null})}),events=[];
 const workflow=new GitWorkflow({service,environment,flatpakId:null,home:disk,onEvent:event=>events.push(event)});
 t.after(async()=>{workflow.close();await fs.rm(disk,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 async function operation(params){const {id}=workflow.start({folder:root,branch:'main',...params});await workflow.current.done;const done=events.find(event=>event.id===id&&event.type==='done');assert.ok(done);return done;}
 return {disk,root,environment,git,service,workflow,events,operation};
}

test('staged and unstaged comparisons show the exact index and commits exclude subsequent disk edits',async t=>{
 const f=await fixture(t),file=path.join(f.root,'file.txt');await fs.writeFile(file,'staged\n');
 assert.equal((await f.operation({action:'stage',files:[file]})).ok,true);
 await fs.writeFile(file,'working\n');
 const staged=await f.service.compareSnapshot({folder:f.root,file,mode:'staged'}),unstaged=await f.service.compareSnapshot({folder:f.root,file,mode:'unstaged'});
 assert.equal(staged.headText,'base\n');assert.equal(staged.workingText,'staged\n');assert.equal(unstaged.headText,'staged\n');assert.equal(unstaged.workingText,'working\n');
 const details=await f.workflow.details(f.root);assert.equal(details.identity.name,'Test User');
 const committed=await f.operation({action:'commit',message:'Only staged',indexState:details.indexState});assert.equal(committed.ok,true,committed.error);
 assert.equal(await f.git('show','HEAD:file.txt'),'staged\n');assert.equal(await fs.readFile(file,'utf8'),'working\n');
 assert.equal((await f.service.status(f.root)).changes[0].worktree,'M');
});
test('commit rejects stale staging, empty messages and empty indexes without moving HEAD',async t=>{
 const f=await fixture(t),file=path.join(f.root,'file.txt'),head=await f.git('rev-parse','HEAD');
 assert.match((await f.operation({action:'commit',message:'No changes'})).error,/Stage changes/);
 await fs.writeFile(file,'one');await f.git('add','.');const old=await f.workflow.details(f.root);
 assert.match((await f.operation({action:'commit',message:'  ',indexState:old.indexState})).error,/message/);
 await fs.writeFile(file,'two');await f.git('add','.');
 assert.match((await f.operation({action:'commit',message:'Stale',indexState:old.indexState})).error,/Staged changes have changed/);
 assert.equal(await f.git('rev-parse','HEAD'),head);
});
test('stage and unstage preserve literal names, staged renames, deletions and working files',async t=>{
 const f=await fixture(t),file=path.join(f.root,'-literal [x]* $file\nname.txt');await fs.writeFile(file,'literal');
 assert.equal((await f.operation({action:'stage',files:[file]})).ok,true);
 await f.git('mv','old.txt','renamed.txt');const renamed=path.join(f.root,'renamed.txt');await fs.writeFile(renamed,'rename\n'.repeat(20)+'more edits');
 const again=await f.operation({action:'stage',files:[renamed]});assert.equal(again.ok,true,again.error);
 const unstage=await f.operation({action:'unstage',files:[renamed,file]});assert.equal(unstage.ok,true,unstage.error);
 assert.equal(await fs.readFile(renamed,'utf8'),'rename\n'.repeat(20)+'more edits');assert.equal(await fs.readFile(file,'utf8'),'literal');
 const result=await f.service.status(f.root);assert.ok(result.changes.every(change=>change.index===' '||change.index==='?'));
 await fs.unlink(path.join(f.root,'file.txt'));assert.equal((await f.operation({action:'stage',files:[path.join(f.root,'file.txt')]})).ok,true);
 assert.equal((await f.service.compareSnapshot({folder:f.root,file:path.join(f.root,'file.txt'),mode:'staged'})).workingText,'');
});
test('unstaging an unborn repository leaves all working files intact',async t=>{
 const f=await fixture(t,{commit:false}),files=['file.txt','old.txt'].map(name=>path.join(f.root,name));
 assert.equal((await f.operation({action:'stage',files})).ok,true);const result=await f.operation({action:'unstage',files});assert.equal(result.ok,true,result.error);
 assert.equal((await f.git('ls-files')).trim(),'');assert.equal(await fs.readFile(files[0],'utf8'),'base\n');
});
test('fetch, initial push and fast-forward pull work with a local bare remote and block dirty or divergent pulls',async t=>{
 const f=await fixture(t),bare=path.join(f.disk,'remote.git'),other=path.join(f.disk,'other');
 await exec('git',['init','--bare',bare],{env:f.environment});await f.git('remote','add','origin',bare);
 const pushed=await f.operation({action:'push',remote:'origin',branch:'main',target:'main'});assert.equal(pushed.ok,true,pushed.error);
 assert.equal((await f.workflow.details(f.root)).upstream,'origin/main');
 await exec('git',['clone','--branch','main',bare,other],{env:f.environment});
 const otherGit=async(...args)=>(await exec('git',['-C',other,'-c','user.name=Other','-c','user.email=other@example.invalid','-c','commit.gpgsign=false',...args],{env:f.environment})).stdout;
 await fs.writeFile(path.join(other,'file.txt'),'remote update\n');await otherGit('add','.');await otherGit('commit','-m','Remote');await otherGit('push');
 assert.equal((await f.operation({action:'fetch',remote:'origin'})).ok,true);assert.equal((await f.workflow.details(f.root)).behind,1);
 await fs.writeFile(path.join(f.root,'draft.txt'),'keep me');const blocked=await f.operation({action:'pull',remote:'origin',branch:'main',target:'main'});assert.match(blocked.error,/local changes/);await fs.unlink(path.join(f.root,'draft.txt'));
 const pulled=await f.operation({action:'pull',remote:'origin',branch:'main',target:'main'});assert.equal(pulled.ok,true,pulled.error);assert.equal(await fs.readFile(path.join(f.root,'file.txt'),'utf8'),'remote update\n');
 await fs.writeFile(path.join(f.root,'local.txt'),'local');await f.git('add','.');await f.git('commit','-m','Local');const head=await f.git('rev-parse','HEAD');
 await fs.writeFile(path.join(other,'other.txt'),'other');await otherGit('add','.');await otherGit('commit','-m','Other');await otherGit('push');
 const rejected=await f.operation({action:'push',remote:'origin',branch:'main',target:'main'});assert.equal(rejected.ok,false);assert.match(rejected.error,/rejected|fetch first/i);
 const divergent=await f.operation({action:'pull',remote:'origin',branch:'main',target:'main'});assert.equal(divergent.ok,false);assert.match(divergent.error,/fast-forward|diverg/i);assert.equal(await f.git('rev-parse','HEAD'),head);
});
test('write operations validate paths, remotes and branch changes',async t=>{
 const f=await fixture(t);assert.match((await f.operation({action:'stage',files:[path.join(f.disk,'outside')]})).error,/outside/);
 assert.match((await f.operation({action:'stage',files:[path.join(f.root,'.git','config')]})).error,/Refresh/);
 assert.match((await f.operation({action:'fetch',remote:'--upload-pack=bad'})).error,/remote/);
 await f.git('remote','add','origin',path.join(f.disk,'unused'));
 assert.match((await f.operation({action:'push',remote:'origin',branch:'old',target:'main'})).error,/branch changed/);
 const identity=await f.operation({action:'identity',name:'New Name',email:'new@example.invalid'});assert.equal(identity.ok,true);assert.equal((await f.workflow.details(f.root)).identity.name,'New Name');
 assert.match((await f.operation({action:'identity',name:'Bad\nName',email:'bad'})).error,/name and email/);
});
test('GitHub login configures the helper only on explicit connection and repository results omit credentials',async()=>{
 const calls=[],events=[];
 const runner={async command(job,folder,tool,args){calls.push([tool,...args]);if(args[0]==='api')return JSON.stringify([{full_name:'owner/repo',clone_url:'https://github.com/owner/repo.git',private:true,token:'secret'}]);return '';},stop(){}};
 const readTool=async(tool,args)=>args[0]==='api'?'test-user\n':'';
 const workflow=new GitWorkflow({runner,readTool,onEvent:event=>events.push(event)});
 const account=await workflow.account();assert.equal(account.login,'test-user');assert.equal(calls.length,0);
 workflow.start({action:'login'});await workflow.current.done;assert.ok(calls.some(call=>call.join(' ')==='gh auth setup-git --hostname github.com'));
 workflow.start({action:'repositories',page:2});await workflow.current.done;const result=events.filter(event=>event.type==='done').at(-1).result;
 assert.equal(result.page,2);assert.deepEqual(result.repositories,[{name:'owner/repo',url:'https://github.com/owner/repo.git',private:true}]);assert.ok(!JSON.stringify(events).includes('secret'));
});
test('only one write operation runs at a time and cancellation before dispatch prevents execution',async()=>{
 const events=[],calls=[],runner={command:async(...args)=>calls.push(args),stop(){}};
 const workflow=new GitWorkflow({runner,onEvent:event=>events.push(event)});workflow.start({action:'login'});
 assert.throws(()=>workflow.start({action:'login'}),/already running/);workflow.cancel();await workflow.current.done;
 assert.equal(calls.length,0);assert.equal(events.at(-1).stopped,true);assert.equal(workflow.current,null);
});
test('clone validation rejects credentials and executable transports and preserves partial destinations on failure',async t=>{
 assert.equal(remoteURL('owner/repo'),'https://github.com/owner/repo.git');assert.equal(remoteURL('git@github.com:owner/repo.git'),'git@github.com:owner/repo.git');
 for(const url of ['ext::bad','file:///tmp/repo','--upload-pack=x','https://token:secret@github.com/o/r','https://github.com/o/r?token=x'])assert.throws(()=>remoteURL(url));
 const f=await fixture(t);f.workflow.runner={async command(){throw Error('Cancelled transport');},stop(){}};
 const failed=await f.operation({action:'clone',url:'owner/repo',parent:f.disk,name:'clone'});assert.equal(failed.ok,false);assert.match(failed.error,/Partial clone/);assert.ok((await fs.stat(path.join(f.disk,'clone'))).isDirectory());
 assert.match((await f.operation({action:'clone',url:'owner/repo',parent:f.disk,name:'../escape'})).error,/folder name/);
});
test('host tool execution sanitizes Git environment while keeping credential handling on the host',()=>{
 const step=toolStep('/repo space','git',['push','--','origin','main'],{environment:{FLATPAK_ID:'app',GIT_DIR:'/wrong'},flatpakId:'app'});
 assert.equal(step.step.executable,'env');assert.ok(step.step.args.includes('GIT_DIR'));assert.ok(step.step.args.includes('GIT_TERMINAL_PROMPT=0'));assert.equal(step.env.GIT_DIR,undefined);
 assert.ok(step.step.args.includes('--literal-pathspecs'));assert.ok(step.step.args.includes('/repo space'));assert.ok(step.step.args.includes('origin'));
 assert.equal(clean('ghp_abc123 https://user:password@example.com/repo'),'[redacted] https://[redacted]@example.com/repo');
});
test('long-running Git runner reports output, redacts split tokens and cancels child processes',async()=>{
 const events=[],runner=new GitCommandRunner({flatpak:null,environment:{...process.env,FLATPAK_ID:''},onEvent:event=>events.push(event)});
 const job={id:1,stopped:false,bytes:0};
 const result=await runner.command(job,os.tmpdir(),process.execPath,['-e','process.stdout.write("ghp_");setImmediate(()=>process.stdout.write("abcdef\\n"));']);
 assert.match(result,/ghp_abcdef/);assert.ok(!JSON.stringify(events).includes('ghp_abcdef'));assert.match(events.at(-1).text,/redacted/);
 let ready;const started=new Promise(resolve=>ready=resolve);runner.onEvent=event=>{if(event.text.includes('ready'))ready();};
 const running=runner.command(job,os.tmpdir(),process.execPath,['-e','console.log("ready");setInterval(()=>{},1000);']);
 await started;runner.stop();await assert.rejects(running,/cancelled/);runner.stop(true);
});

test('conflicted files cannot be staged or committed by the basic workflow',async t=>{
 const f=await fixture(t),file=path.join(f.root,'file.txt');await f.git('checkout','-b','feature');await fs.writeFile(file,'feature\n');await f.git('add','.');await f.git('commit','-m','Feature');
 await f.git('checkout','main');await fs.writeFile(file,'main\n');await f.git('add','.');await f.git('commit','-m','Main');
 await assert.rejects(f.git('merge','feature'));const head=await f.git('rev-parse','HEAD');
 assert.match((await f.operation({action:'stage',files:[file]})).error,/Resolve Git conflicts/);
 const details=await f.workflow.details(f.root);assert.match((await f.operation({action:'commit',message:'Unresolved',indexState:details.indexState})).error,/Resolve Git conflicts/);
 await assert.rejects(f.service.compareSnapshot({folder:f.root,file,mode:'staged'}),/conflicts/);assert.equal(await f.git('rev-parse','HEAD'),head);
});
test('unstaging a copied file does not unstage edits to its source',async t=>{
 const f=await fixture(t),original=path.join(f.root,'old.txt'),copy=path.join(f.root,'copy.txt');await f.git('config','status.renames','copies');
 await fs.copyFile(original,copy);await fs.appendFile(original,'source edit\n');await f.git('add','.');
 assert.equal((await f.operation({action:'unstage',files:[copy]})).ok,true);assert.match(await f.git('show',':old.txt'),/source edit/);
 assert.match(await f.git('diff','--cached','--name-only'),/old.txt/);assert.equal(await fs.readFile(copy,'utf8'),'rename\n'.repeat(20));
});
test('a commit cannot move to a branch switched externally after review',async t=>{
 const f=await fixture(t);await fs.appendFile(path.join(f.root,'file.txt'),'staged');await f.git('add','.');const details=await f.workflow.details(f.root);
 await f.git('checkout','-b','another');const result=await f.operation({action:'commit',message:'Wrong branch',indexState:details.indexState,branch:'main'});
 assert.equal(result.ok,false);assert.match(result.error,/branch changed/);assert.equal((await f.git('log','--format=%s','-1')).trim(),'Initial');
});

test('workflow Cancel terminates an already running command instead of only marking it stopped',async t=>{
 const events=[],runner=new GitCommandRunner({flatpak:null,environment:{...process.env,FLATPAK_ID:''}});
 const command=runner.command.bind(runner);
 runner.command=(job,folder)=>command(job,os.tmpdir(),process.execPath,['-e','console.log("waiting-for-cancel");setInterval(()=>{},1000);']);
 const onEvent=event=>{events.push(event);if(event.type==='output'&&event.text.includes('waiting-for-cancel'))workflow.cancel();};
 const workflow=new GitWorkflow({runner,onEvent});runner.onEvent=onEvent;t.after(()=>workflow.close());
 workflow.start({action:'login'});const pending=workflow.current.done;
 const timer=setTimeout(()=>workflow.close(),3000);t.after(()=>clearTimeout(timer));
 const start=Date.now();await pending;
 assert.ok(Date.now()-start<2500,'Cancel must stop the child without waiting for timeout or natural exit');
 assert.equal(events.at(-1).stopped,true);assert.equal(events.at(-1).ok,false);assert.equal(workflow.current,null);
});

test('branch creation and switching preserve commits and refresh the branch list',async t=>{
 const f=await fixture(t),head=(await f.git('rev-parse','HEAD')).trim();
 const created=await f.operation({action:'createBranch',name:'feature/editor',head});assert.equal(created.ok,true,created.error);
 assert.equal((await f.git('branch','--show-current')).trim(),'feature/editor');
 assert.deepEqual((await f.workflow.details(f.root)).branches,['feature/editor','main']);
 await fs.writeFile(path.join(f.root,'file.txt'),'feature\n');await f.git('add','.');await f.git('commit','-m','Feature');
 const featureHead=(await f.git('rev-parse','HEAD')).trim();
 const switched=await f.operation({action:'switchBranch',name:'main',branch:'feature/editor',head:featureHead});assert.equal(switched.ok,true,switched.error);
 assert.equal(await fs.readFile(path.join(f.root,'file.txt'),'utf8'),'base\n');assert.equal((await f.git('rev-parse','feature/editor')).trim(),featureHead);
});

test('branch operations reject stale reviews, dirty files, invalid names and worktrees without discarding changes',async t=>{
 const f=await fixture(t),head=(await f.git('rev-parse','HEAD')).trim(),file=path.join(f.root,'file.txt');
 assert.match((await f.operation({action:'createBranch',name:'feature',head:'a'.repeat(40)})).error,/branch changed/);
 for(const name of ['--force','HEAD','@{-1}','bad..name','bad name'])assert.equal((await f.operation({action:'createBranch',name,head})).ok,false);
 await fs.writeFile(file,'keep this\n');assert.match((await f.operation({action:'createBranch',name:'feature',head})).error,/local changes/);assert.equal(await fs.readFile(file,'utf8'),'keep this\n');
 await f.git('add','.');assert.match((await f.operation({action:'createBranch',name:'feature',head})).error,/local changes/);
 await f.git('commit','-m','Keep');const latest=(await f.git('rev-parse','HEAD')).trim();
 await f.git('worktree','add','-b','busy',path.join(f.disk,'worktree'));
 const busy=await f.operation({action:'switchBranch',name:'busy',head:latest});assert.equal(busy.ok,false);assert.match(busy.error,/already (?:used|checked out)/i);
 assert.equal((await f.git('branch','--show-current')).trim(),'main');
 assert.equal((await f.operation({action:'switchBranch',name:'missing',head:latest})).ok,false);
});

test('a merge in progress blocks branch operations even with an unchanged working tree',async t=>{
 const f=await fixture(t);await f.git('checkout','-b','feature');await f.git('commit','--allow-empty','-m','Empty feature');await f.git('checkout','main');
 await f.git('merge','--no-commit','--no-ff','feature');const head=(await f.git('rev-parse','HEAD')).trim();
 assert.equal((await f.service.inspect(f.root)).changes.length,0);
 const result=await f.operation({action:'createBranch',name:'unsafe',head});assert.equal(result.ok,false);assert.match(result.error,/Finish or abort/);
 assert.equal((await f.git('branch','--show-current')).trim(),'main');
});

test('adding a remote validates transports and never replaces an existing remote',async t=>{
 const f=await fixture(t);
 assert.equal((await f.operation({action:'remote',remote:'origin',url:'owner/repository'})).ok,true);
 assert.equal((await f.git('config','--get','remote.origin.url')).trim(),'https://github.com/owner/repository.git');
 assert.equal((await f.operation({action:'remote',remote:'origin',url:'other/repository'})).ok,false);
 assert.equal((await f.git('config','--get','remote.origin.url')).trim(),'https://github.com/owner/repository.git');
 for(const remote of ['--bad','bad/name','bad\nname'])assert.equal((await f.operation({action:'remote',remote,url:'owner/repository'})).ok,false);
 for(const url of ['ext::evil','https://token:secret@github.com/o/r','file:///tmp/repo'])assert.equal((await f.operation({action:'remote',remote:'other',url})).ok,false);
});

test('initialization uses private identity before the first commit without staging project files',async t=>{
 const f=await fixture(t),folder=path.join(f.disk,'new project');await fs.mkdir(folder);await fs.writeFile(path.join(folder,'draft.txt'),'not staged');
 const command=f.workflow.runner.command.bind(f.workflow.runner),calls=[];
 f.workflow.runner.command=async(job,cwd,tool,args,options)=>{calls.push({tool,args,options});return tool==='gh'?JSON.stringify({id:123,login:'test-user',name:'GitHub User',email:'private@example.invalid'}):command(job,cwd,tool,args,options);};
 const result=await f.operation({action:'init',folder,githubIdentity:true});assert.equal(result.ok,true,result.error);
 const config=async(...args)=>(await exec('git',['-C',folder,...args],{env:f.environment})).stdout.trim();
 assert.equal(await config('branch','--show-current'),'main');assert.equal(await config('config','user.email'),'123+test-user@users.noreply.github.com');
 assert.equal(await config('config','user.name'),'GitHub User');assert.equal(await config('ls-files'),'');
 assert.ok(calls.find(call=>call.tool==='gh').options.quiet);assert.ok(!JSON.stringify(f.events).includes('private@example.invalid'));
 assert.match((await f.operation({action:'init',folder,githubIdentity:true})).error,/already belongs/);
 const nested=path.join(f.root,'nested');await fs.mkdir(nested);assert.match((await f.operation({action:'init',folder:nested})).error,/already belongs/);
 await assert.rejects(fs.stat(path.join(nested,'.git')),{code:'ENOENT'});
});

test('private identity changes only future repository commits and preserves existing history and name',async t=>{
 const f=await fixture(t),head=await f.git('rev-parse','HEAD'),command=f.workflow.runner.command.bind(f.workflow.runner);
 f.workflow.runner.command=async(job,cwd,tool,args,options)=>tool==='gh'?JSON.stringify({id:123,login:'test-user',name:'Different Name'}):command(job,cwd,tool,args,options);
 const result=await f.operation({action:'githubIdentity'});assert.equal(result.ok,true,result.error);
 assert.equal((await f.git('config','--local','user.email')).trim(),'123+test-user@users.noreply.github.com');assert.equal((await f.git('config','user.name')).trim(),'Test User');
 assert.equal(await f.git('rev-parse','HEAD'),head);assert.equal((await f.git('log','-1','--format=%ae')).trim(),'test@example.invalid');
});

async function publishing(t){
 const f=await fixture(t),bare=path.join(f.disk,'published.git'),calls=[],command=f.workflow.runner.command.bind(f.workflow.runner);
 await f.git('config','url.'+bare+'.insteadOf','https://github.com/test-user/project.git');
 f.workflow.runner.command=async(job,cwd,tool,args,options)=>{
   calls.push({tool,args,options});
   if(tool==='gh'){
     if(args[0]==='api')return JSON.stringify({id:123,login:'test-user'});
     if(args[0]==='repo'){await exec('git',['init','--bare',bare],{env:f.environment});return 'created';}
     throw Error('Unexpected GitHub command');
   }
   return command(job,cwd,tool,args,options);
 };
 return {...f,bare,calls,params:{action:'publish',name:'project',remote:'origin',visibility:'private',head:(await f.git('rev-parse','HEAD')).trim()}};
}

test('publishing creates an explicitly private repository and pushes only the reviewed branch without force or tags',async t=>{
 const f=await publishing(t);await f.git('branch','unpublished');await f.git('tag','unpublished-tag');
 const result=await f.operation(f.params);assert.equal(result.ok,true,result.error);
 assert.deepEqual(f.calls.find(call=>call.tool==='gh'&&call.args[0]==='repo').args,['repo','create','test-user/project','--private']);
 const refs=(await exec('git',['--git-dir='+f.bare,'for-each-ref','--format=%(refname)'],{env:f.environment})).stdout.trim();
 assert.equal(refs,'refs/heads/main');assert.equal((await f.workflow.details(f.root)).upstream,'origin/main');
 assert.equal((await f.git('config','--get','remote.origin.url')).trim(),'https://github.com/test-user/project.git');
 const push=f.calls.find(call=>call.tool==='git'&&call.args.includes('push')).args;assert.ok(push.includes('--no-force'));assert.ok(push.includes('--no-follow-tags'));
 assert.equal((await f.operation(f.params)).ok,false);assert.equal(f.calls.filter(call=>call.tool==='gh'&&call.args[0]==='repo').length,1);
});

test('publishing refuses dirty, unborn, stale and invalid requests before creating anything on GitHub',async t=>{
 const f=await publishing(t),file=path.join(f.root,'draft.txt');
 for(const values of [{name:'../bad'},{visibility:'internal'},{remote:'--evil'},{head:'b'.repeat(40)},{name:'.'}])assert.equal((await f.operation({...f.params,...values})).ok,false);
 await fs.writeFile(file,'private draft');assert.match((await f.operation(f.params)).error,/local changes/);
 assert.ok(!f.calls.some(call=>call.tool==='gh'));await assert.rejects(fs.stat(f.bare),{code:'ENOENT'});
 const unborn=await fixture(t,{commit:false});assert.match((await unborn.operation({...f.params,head:null})).error,/Create a commit/);
});

test('failed publishing preserves the created repository and remote and explains privacy recovery',async t=>{
 const f=await publishing(t),command=f.workflow.runner.command.bind(f.workflow.runner);
 f.workflow.runner.command=async(job,cwd,tool,args,options)=>{
   if(tool==='git'&&args.includes('push'))throw Error('remote: error: GH007: Your push would publish a private email address.');
   return command(job,cwd,tool,args,options);
 };
 const result=await f.operation(f.params);assert.equal(result.ok,false);assert.match(result.error,/repository was created/);assert.match(result.help,/future commits/);
 assert.ok((await fs.stat(f.bare)).isDirectory());assert.equal((await f.git('config','--get','remote.origin.url')).trim(),'https://github.com/test-user/project.git');
 assert.equal((await f.git('rev-parse','HEAD')).trim(),f.params.head);
});

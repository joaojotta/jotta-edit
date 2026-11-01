'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const {GitService,parseStatus,gitSpawnSpec,runGit}=require('../electron/git.cjs');

async function fixture(t,{commit=true}={}){
  const disk=await fs.mkdtemp(path.join(os.tmpdir(),'jotta git space $ ')),root=path.join(disk,'repo');
  await fs.mkdir(root);await fs.writeFile(path.join(disk,'empty-config'),'');await fs.mkdir(path.join(disk,'no-hooks'));
  t.after(()=>fs.rm(disk,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
  const environment={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:path.join(disk,'empty-config')};
  for(const name of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR','GIT_CONFIG_COUNT'])delete environment[name];
  const git=async(...args)=>(await exec('git',['-c','core.hooksPath='+path.join(disk,'no-hooks'),'-c','commit.gpgsign=false','-c','user.name=Test','-c','user.email=test@example.invalid','-C',root,...args],{env:environment,timeout:10000})).stdout;
  await git('init','-b','main');
  await fs.writeFile(path.join(root,'a.txt'),'committed\n');await fs.writeFile(path.join(root,'old.txt'),'rename me\n');await fs.writeFile(path.join(root,'delete.txt'),'delete me\n');
  await fs.writeFile(path.join(root,'.gitignore'),'ignored.txt\n');
  if(commit){await git('add','--','.');await git('commit','-m','Initial');}
  return {disk,root,git,service:new GitService({run:(folder,args)=>runGit(folder,args,{environment,flatpakId:null})})};
}

test('Git status preserves literal filenames and rename source paths in NUL-delimited output',()=>{
  const root=path.resolve(os.tmpdir(),'git-parse');
  const parsed=parseStatus(Buffer.from(' M a b [x]*.txt\0R  renamed\tnew.txt\0old\nname.txt\0?? ?new.txt\0UU conflict.txt\0'),root);
  assert.equal(parsed.changes[0].relativePath,'a b [x]*.txt');assert.equal(parsed.changes[0].kind,'modified');
  assert.equal(parsed.changes[1].originalPath,path.join(root,'old\nname.txt'));assert.equal(parsed.changes[1].kind,'renamed');
  assert.equal(parsed.changes[2].kind,'untracked');assert.equal(parsed.changes[3].kind,'conflict');
  assert.equal(parseStatus(Buffer.from('?? a\0?? b\0'),root,{limit:1}).limited,true);
  assert.throws(()=>parseStatus(Buffer.from('?? ../escape\0'),root),/outside/);
  assert.throws(()=>parseStatus(Buffer.from('R  missing-source\0'),root),/rename/);
});

test('Git launch disables index refresh writes and fsmonitor hooks and uses argument boundaries on Flatpak',()=>{
  const environment={PATH:'/tools',GIT_DIR:'/wrong',GIT_WORK_TREE:'/wrong',DEBUG:'keep'};
  const local=gitSpawnSpec('/project with spaces',['status','--porcelain=v1'],{environment,flatpakId:null});
  assert.equal(local.executable,'git');assert.equal(local.env.GIT_DIR,undefined);assert.equal(local.env.GIT_WORK_TREE,undefined);
  assert.equal(local.env.GIT_OPTIONAL_LOCKS,'0');assert.ok(local.args.includes('core.fsmonitor=false'));assert.ok(local.args.includes('--literal-pathspecs'));
  const host=gitSpawnSpec('/project with spaces',['status'],{environment,flatpakId:'pt.jotta.edit'});
  assert.equal(host.executable,'flatpak-spawn');assert.equal(host.args[0],'--host');assert.ok(host.args.includes('/project with spaces'));
  assert.ok(host.args.includes('--directory=/project with spaces'));
  assert.equal(environment.GIT_DIR,'/wrong','caller environment must remain untouched');
});

test('real repository status reports branch, staged/unstaged edits, renames and deletions without changing the index',async t=>{
  const f=await fixture(t);
  await fs.writeFile(path.join(f.root,'a.txt'),'staged\n');await f.git('add','--','a.txt');await fs.writeFile(path.join(f.root,'a.txt'),'working\n');
  await f.git('mv','old.txt','renamed.txt');await fs.unlink(path.join(f.root,'delete.txt'));
  await fs.writeFile(path.join(f.root,'new [x]* ; $(literal).txt'),'new');await fs.writeFile(path.join(f.root,'ignored.txt'),'ignored');
  const index=path.join(f.root,'.git','index'),before=await fs.readFile(index),stamp=(await fs.stat(index)).mtimeMs;
  const status=await f.service.status(f.root);assert.equal(status.branch,'main');assert.equal(status.detached,false);assert.match(status.head,/^[a-f0-9]{40,64}$/);
  const a=status.changes.find(change=>change.relativePath==='a.txt');assert.equal(a.index,'M');assert.equal(a.worktree,'M');
  assert.equal(status.changes.find(change=>change.relativePath==='delete.txt').kind,'deleted');
  assert.equal(status.changes.find(change=>change.relativePath==='renamed.txt').originalPath,path.join(f.root,'old.txt'));
  assert.ok(status.changes.some(change=>change.relativePath==='new [x]* ; $(literal).txt'));assert.ok(!status.changes.some(change=>change.relativePath==='ignored.txt'));
  assert.deepEqual(await fs.readFile(index),before);assert.equal((await fs.stat(index)).mtimeMs,stamp);
});

test('Git comparisons use HEAD rather than the index and handle added, renamed, deleted and literal paths',async t=>{
  const f=await fixture(t),file=path.join(f.root,'a.txt');
  await fs.writeFile(file,'staged');await f.git('add','a.txt');await fs.writeFile(file,'working');
  const result=await f.service.compare({folder:f.root,file});assert.equal(result.headText,'committed\n');assert.equal(result.workingText,'working');
  await f.git('mv','old.txt','renamed.txt');const renamed=await f.service.compare({folder:f.root,file:path.join(f.root,'renamed.txt')});
  assert.equal(renamed.headText,'rename me\n');assert.equal(renamed.headPath,'old.txt');
  await fs.unlink(path.join(f.root,'delete.txt'));const deleted=await f.service.compare({folder:f.root,file:path.join(f.root,'delete.txt')});
  assert.equal(deleted.exists,false);assert.equal(deleted.headText,'delete me\n');assert.equal(deleted.workingText,'');
  const literal=path.join(f.root,'new [x]* ; $(literal).txt');await fs.writeFile(literal,'new');
  const added=await f.service.compare({folder:f.root,file:literal});assert.equal(added.headText,'');assert.equal(added.workingText,'new');
  await assert.rejects(f.service.compare({folder:f.root,file:path.join(f.disk,'outside')}),/outside/);
});

test('Git recognizes repositories without commits, detached HEAD and linked worktrees',async t=>{
  const f=await fixture(t,{commit:false});let status=await f.service.status(f.root);assert.equal(status.head,null);assert.equal(status.branch,'main');
  assert.equal((await f.service.compare({folder:f.root,file:path.join(f.root,'a.txt')})).headText,'');
  await f.git('add','.');await f.git('commit','-m','Initial');await f.git('checkout','--detach','--quiet','HEAD');
  status=await f.service.status(f.root);assert.equal(status.detached,true);assert.equal(status.branch,null);
  const worktree=path.join(f.disk,'linked tree');await f.git('worktree','add','-b','feature',worktree);
  status=await f.service.status(worktree);assert.equal(status.branch,'feature');assert.equal(status.root,worktree);
  assert.ok(status.watchFolders.some(folder=>folder.includes(path.join('.git','worktrees'))));
  assert.ok(status.watchFolders.includes(path.join(f.root,'.git')));
  await f.git('checkout','-b','topic/sub');status=await f.service.status(f.root);
  assert.ok(status.watchFolders.includes(path.join(f.root,'.git','refs','heads','topic')),'nested branch refs must be watched too');
});

test('Git comparisons reject binary and oversized files and symbolic-link escapes',async t=>{
  const f=await fixture(t);const binary=path.join(f.root,'binary.bin');await fs.writeFile(binary,Buffer.from([1,0,2]));
  await assert.rejects(f.service.compare({folder:f.root,file:binary}),/Binary/);
  const large=path.join(f.root,'large.txt');await fs.writeFile(large,'x'.repeat(5*1024*1024+1));
  await assert.rejects(f.service.compare({folder:f.root,file:large}),/5 MB/);
  if(process.platform!=='win32'){
    const secret=path.join(f.disk,'outside.txt');await fs.writeFile(secret,'outside');const link=path.join(f.root,'link.txt');await fs.symlink(secret,link);
    await assert.rejects(f.service.compare({folder:f.root,file:link}),/symbolic/);
  }
});

test('non-repositories and remote folders do not start Git workflows',async t=>{
  const f=await fixture(t);const plain=path.join(f.disk,'plain');await fs.mkdir(plain);
  assert.equal((await f.service.status(plain)).root,null);
  const remote=new GitService({isRemote:()=>true,run:()=>assert.fail('Remote folders must not invoke Git')});
  assert.equal((await remote.status(f.root)).root,null);
});

test('a selected repository root alias keeps branch and change paths aligned with Explorer', {skip:process.platform==='win32'},async t=>{
  const f=await fixture(t),alias=path.join(f.disk,'repository alias');await fs.symlink(f.root,alias,'dir');
  await fs.writeFile(path.join(f.root,'a.txt'),'changed');const result=await f.service.status(alias);
  assert.equal(result.root,alias);assert.ok(result.changes.some(change=>change.path===path.join(alias,'a.txt')));
  const comparison=await f.service.compare({folder:alias,file:path.join(alias,'a.txt')});assert.equal(comparison.headText,'committed\n');
});

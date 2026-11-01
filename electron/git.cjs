'use strict';
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');

const MAX_TEXT=5*1024*1024,MAX_CHANGES=8000;
const repositoryVariables=['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_CONFIG_COUNT','GIT_NAMESPACE'];
const within=(root,file)=>{const relative=path.relative(root,file);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
const absolute=value=>{
  if(typeof value!=='string'||!value||value.length>8192||value.includes('\0')||!path.isAbsolute(value))throw new Error('Git requires an absolute local path.');
  return path.resolve(value);
};
const line=value=>value.toString('utf8').replace(/\r?\n$/,'');

function gitSpawnSpec(folder,args,{environment=process.env,flatpakId=environment.FLATPAK_ID}={}){
  const env={...environment,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',LC_ALL:'C'};
  for(const name of repositoryVariables)delete env[name];
  const command=['--no-optional-locks','--literal-pathspecs','-c','core.fsmonitor=false','-C',folder,...args];
  if(flatpakId)return {executable:'flatpak-spawn',args:['--host','--directory='+folder,'env',...repositoryVariables.flatMap(name=>['-u',name]),
    'GIT_OPTIONAL_LOCKS=0','GIT_TERMINAL_PROMPT=0','LC_ALL=C','git',...command],env};
  return {executable:'git',args:command,env};
}
function runGit(folder,args,options={}){
  const spec=gitSpawnSpec(folder,args,options);
  return new Promise((resolve,reject)=>execFile(spec.executable,spec.args,{env:spec.env,encoding:'buffer',timeout:8000,maxBuffer:8*1024*1024,windowsHide:true},(error,stdout,stderr)=>{
    if(!error)return resolve(stdout);
    const detail=stderr?.toString('utf8').trim()||'';
    const message=error.code==='ENOENT'?'Git is not installed or is not on PATH.':error.killed?'Git timed out. Try refreshing the changes.':error.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?'Git output exceeds the supported size.':detail||error.message;
    reject(Object.assign(new Error(message),{code:error.code,detail}));
  }));
}
function changeKind(index,worktree){
  if(index==='?'&&worktree==='?')return 'untracked';
  if(index==='U'||worktree==='U'||index==='A'&&worktree==='A'||index==='D'&&worktree==='D')return 'conflict';
  if(index==='D'||worktree==='D')return 'deleted';
  if(index==='R'||worktree==='R')return 'renamed';
  if(index==='C'||worktree==='C')return 'copied';
  if(index==='A')return 'added';
  return 'modified';
}
function parseStatus(buffer,root,{limit=MAX_CHANGES}={}){
  const fields=buffer.toString('utf8').split('\0'),changes=[];let limited=false;
  for(let i=0;i<fields.length;i++){
    const entry=fields[i];if(!entry)continue;
    if(entry.length<4||entry[2]!==' ')throw new Error('Invalid Git status output.');
    const index=entry[0],worktree=entry[1],relative=entry.slice(3);
    const source=/[RC]/.test(index+worktree)?fields[++i]:null;
    if(/[RC]/.test(index+worktree)&&!source)throw new Error('Invalid Git rename status.');
    const file=path.resolve(root,relative),originalPath=source?path.resolve(root,source):null;
    if(path.isAbsolute(relative)||!within(root,file)||originalPath&&!within(root,originalPath))throw new Error('Git returned a path outside the repository.');
    if(changes.length>=limit){limited=true;continue;}
    changes.push({path:file,relativePath:relative,originalPath,index,worktree,kind:changeKind(index,worktree)});
  }
  return {changes,limited};
}

class GitService {
  constructor({isRemote=()=>false,run=runGit}={}){this.isRemote=isRemote;this.run=run;this.pending=new Map();}
  async repository(folder){
    folder=absolute(folder);
    if(this.isRemote(folder))return null;
    const real=await fs.realpath(folder);if(this.isRemote(real))return null;
    if(!(await fs.stat(real)).isDirectory())throw new Error('Open a local folder to use Git.');
    try{
      const root=absolute(line(await this.run(real,['rev-parse','--show-toplevel'])));
      if(this.isRemote(root))return null;
      // Keep a selected root alias aligned with Explorer and tab paths, while
      // confirming that it resolves to the same physical repository.
      let logical=folder;
      for(const part of path.relative(root,real).split(path.sep).filter(Boolean))logical=path.dirname(logical);
      try{if(path.relative(root,await fs.realpath(logical))==='')return logical;}catch{/* Use Git's physical root when an alias cannot be reconstructed. */}
      return root;
    }catch(error){if(/not a git repository|must be run in a work tree/i.test(error.message))return null;throw error;}
  }
  status(folder){
    folder=absolute(folder);
    if(this.pending.has(folder))return this.pending.get(folder);
    const task=this.inspect(folder).finally(()=>{if(this.pending.get(folder)===task)this.pending.delete(folder);});
    this.pending.set(folder,task);return task;
  }
  async inspect(folder){
    const root=await this.repository(folder);if(!root)return {root:null,changes:[],watchFolders:[]};
    const [status,branch,head,gitDir,commonDir]=await Promise.all([
      this.run(root,['status','--porcelain=v1','-z','--untracked-files=all','--ignore-submodules=all']),
      this.run(root,['symbolic-ref','--quiet','--short','HEAD']).then(line).catch(error=>{if(error.code===1)return null;throw error;}),
      this.run(root,['rev-parse','--verify','HEAD^{commit}']).then(line).catch(error=>{if(error.code===128&&/Needed a single revision|unknown revision|bad revision|ambiguous argument/.test(error.message))return null;throw error;}),
      this.run(root,['rev-parse','--absolute-git-dir']).then(line),
      this.run(root,['rev-parse','--git-common-dir']).then(line)
    ]);
    if(head&&!/^[0-9a-f]{40,64}$/.test(head))throw new Error('Invalid Git HEAD.');
    const directories=[root,path.resolve(root,gitDir),path.resolve(root,commonDir)];
    const candidates=[...directories,...directories.slice(1).flatMap(dir=>[path.join(dir,'refs'),path.join(dir,'refs','heads'),
      ...(branch?[path.dirname(path.join(dir,'refs','heads',branch))]:[])])];
    const watchFolders=[];
    for(const directory of new Set(candidates))try{if((await fs.stat(directory)).isDirectory())watchFolders.push(directory);}catch{/* A new repository may not have loose refs yet. */}
    return {root,branch,head,detached:!branch,...parseStatus(status,root),watchFolders};
  }
  async compare({folder,file,includeWorking=true}={}){
    folder=absolute(folder);file=absolute(file);
    if(this.isRemote(folder)||this.isRemote(file))throw new Error('Git integration supports local folders.');
    const repository=await this.status(folder);
    if(!repository.root||!within(repository.root,file))throw new Error('The file is outside this Git repository.');
    const root=repository.root,relative=path.relative(root,file).split(path.sep).join('/');
    if(!relative||relative.split('/').some(part=>part==='.git'))throw new Error('Git metadata cannot be compared as a working file.');
    let exists=false,workingText=null;
    try{
      const stat=await fs.lstat(file);exists=true;
      if(stat.isSymbolicLink())throw new Error('Text Git comparisons do not support symbolic links.');
      if(!stat.isFile())throw new Error('Text Git comparisons require a regular file.');
      const realParent=await fs.realpath(path.dirname(file));
      const realRoot=await fs.realpath(root);
      if(!within(realRoot,realParent))throw new Error('The file is outside this Git repository.');
      if(path.relative(root,path.dirname(file))!==path.relative(realRoot,realParent))throw new Error('Text Git comparisons do not support symbolic links.');
      if(includeWorking){
        if(stat.size>MAX_TEXT)throw new Error('Git comparison exceeds the 5 MB editor limit.');
        workingText=decodeText(await fs.readFile(file));
      }
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const change=repository.changes.find(change=>change.path===file);
    const headPath=change?.originalPath?path.relative(root,change.originalPath).split(path.sep).join('/'):relative;
    let headText='';
    if(repository.head){
      const tree=await this.run(root,['ls-tree','-z',repository.head,'--',headPath]);
      if(tree.length){
        const entry=/^(\d+) (\w+) ([a-f0-9]+)\t/.exec(tree.toString('utf8'));
        if(!entry||entry[2]!=='blob'||entry[1]==='120000')throw new Error('Text Git comparisons do not support submodules or symbolic links.');
        const size=Number(line(await this.run(root,['cat-file','-s',entry[3]])));
        if(!Number.isFinite(size)||size>MAX_TEXT)throw new Error('Git comparison exceeds the 5 MB editor limit.');
        headText=decodeText(await this.run(root,['cat-file','blob',entry[3]]));
      }
    }
    return {root,file,head:repository.head,headPath,headText,workingText:workingText??'',exists,kind:change?.kind||'modified'};
  }
  async compareSnapshot(params){
    if(!['staged','unstaged'].includes(params?.mode))return this.compare(params);
    const result=await this.compare({...params,includeWorking:params.mode==='staged'?false:params.includeWorking});
    const relative=path.relative(result.root,result.file).split(path.sep).join('/');
    const entries=(await this.run(result.root,['ls-files','--stage','-z','--',relative])).toString('utf8').split('\0').filter(Boolean);
    let indexText='';
    if(entries.length){
      if(entries.length!==1)throw new Error('Resolve Git conflicts before comparing the staging area.');
      const entry=/^(\d+) ([a-f0-9]+) 0\t/.exec(entries[0]);
      if(!entry||entry[1]==='120000'||entry[1]==='160000')throw new Error('Text Git comparisons do not support submodules or symbolic links.');
      const size=Number(line(await this.run(result.root,['cat-file','-s',entry[2]])));
      if(!Number.isFinite(size)||size>MAX_TEXT)throw new Error('Git comparison exceeds the 5 MB editor limit.');
      indexText=decodeText(await this.run(result.root,['cat-file','blob',entry[2]]));
    }
    return {...result,mode:params.mode,headText:params.mode==='unstaged'?indexText:result.headText,workingText:params.mode==='staged'?indexText:result.workingText};
  }
}
function decodeText(bytes){
  if(bytes.length>MAX_TEXT)throw new Error('Git comparison exceeds the 5 MB editor limit.');
  if(bytes.includes(0))throw new Error('Binary files do not support text Git comparisons.');
  return bytes.toString('utf8');
}
module.exports={GitService,parseStatus,gitSpawnSpec,changeKind,runGit};

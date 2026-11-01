'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {NativeBuildRunner}=require('./native-build.cjs');
const {GitService,gitSpawnSpec}=require('./git.cjs');

const LIMIT=8*1024*1024;
const clean=text=>String(text).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'')
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g,'[redacted]')
  .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[redacted]@');
const text=bytes=>bytes.toString('utf8').trim();
const inside=(root,file)=>{const relative=path.relative(root,file);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
const actions=new Set(['stage','unstage','commit','fetch','pull','push','clone','login','logout','repositories','identity']);

function remoteURL(value){
  if(typeof value!=='string'||!value||value.length>2048||/[\s\0]/.test(value))throw new Error('Enter an HTTPS or SSH repository URL.');
  if(/^[\w.-]+\/[\w.-]+$/.test(value))value='https://github.com/'+value+'.git';
  if(/^git@[a-z0-9.-]+:[\w./~-]+$/i.test(value))return value;
  let url;try{url=new URL(value);}catch{throw new Error('Enter an HTTPS or SSH repository URL.');}
  if(!['https:','ssh:'].includes(url.protocol)||!url.hostname||url.password||url.search||url.hash||url.protocol==='https:'&&url.username||url.pathname==='/')throw new Error('Enter an HTTPS or SSH URL without embedded credentials.');
  return url.href;
}
function toolStep(folder,tool,args,options={}){
  const spec=gitSpawnSpec(folder,[],options),gitArgs=spec.args;
  const commandArgs=tool==='git'?[...gitArgs.slice(gitArgs.indexOf('--no-optional-locks')),...args]:args;
  const env={...spec.env,GH_PROMPT_DISABLED:'1',GH_NO_UPDATE_NOTIFIER:'1',GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never',NO_COLOR:'1'};
  // Resolve tools and credentials on the host, and remove inherited repository
  // overrides there as well as in the Electron process. buildSpawnSpec supplies
  // the host process-group wrapper and cancellation protocol.
  if(options.flatpakId??env.FLATPAK_ID){
    const names=['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_CONFIG_COUNT','GIT_NAMESPACE'];
    return {step:{cwd:folder,executable:'env',args:[...names.flatMap(name=>['-u',name]),'GH_PROMPT_DISABLED=1','GH_NO_UPDATE_NOTIFIER=1','GIT_TERMINAL_PROMPT=0','GCM_INTERACTIVE=never','NO_COLOR=1',tool,...commandArgs]},env};
  }
  return {step:{cwd:folder,executable:tool,args:commandArgs},env};
}

class GitCommandRunner extends NativeBuildRunner {
  async command(job,folder,tool,args,{quiet=false,timeout=600000}={}){
    if(job.stopped)throw new Error('Git operation cancelled.');
    const {step,env}=toolStep(folder,tool,args,{environment:this.environment,flatpakId:this.flatpak||null});
    this.environment=env;this.current=job;job.stdout='';job.stderr='';job.captureBytes=0;job.quiet=quiet;job.lines={stdout:'',stderr:''};
    const timer=setTimeout(()=>{job.timedOut=true;this.stop();},timeout);timer.unref?.();
    let result;
    try{result=await this.runStep(job,step);}
    catch(error){throw new Error(/Cannot find/.test(error.message)?tool==='gh'?'Install GitHub CLI (gh) on your computer to connect GitHub.':'Git is not installed or is not on PATH.':clean(error.message));}
    finally{clearTimeout(timer);for(const stream of ['stdout','stderr'])this.flush(job,stream,true);}
    if(job.stopped)throw new Error(job.timedOut?'Git operation timed out.':'Git operation cancelled.');
    if(job.captureBytes>LIMIT)throw new Error('Git output exceeds the supported size.');
    if(result.code!==0)throw new Error(clean(job.stderr||job.stdout)||`${tool} exited with code ${result.code}.`);
    return job.stdout;
  }
  output(job,value,stream='stdout'){
    job.captureBytes+=Buffer.byteLength(value);
    if(job.captureBytes>LIMIT)return;
    job[stream]+=value;
    if(job.quiet)return;
    job.lines[stream]+=value;this.flush(job,stream);
  }
  flush(job,stream,final=false){
    let value=job.lines?.[stream]||'',end=final?value.length:Math.max(value.lastIndexOf('\n'),value.lastIndexOf('\r'))+1;
    if(!end)return;
    job.lines[stream]=value.slice(end);
    if(!job.quiet)this.onEvent({id:job.id,type:'output',text:clean(value.slice(0,end)).slice(-16384)});
  }
  emit(){} // Keep build-specific events out of the Git event channel.
}

class GitWorkflow {
  constructor({service=new GitService(),onEvent=()=>{},environment=process.env,flatpakId=environment.FLATPAK_ID,runner=null,readTool=null,home=os.homedir()}={}){
    Object.assign(this,{service,onEvent,environment,flatpakId,home});this.current=null;this.sequence=0;
    this.runner=runner||new GitCommandRunner({environment,flatpak:flatpakId,onEvent});
    this.readTool=readTool||((tool,args)=>new Promise((resolve,reject)=>{
      const {step,env}=toolStep(home,tool,args,{environment,flatpakId});
      const executable=flatpakId?'flatpak-spawn':step.executable;
      const command=flatpakId?['--host','--directory='+home,step.executable,...step.args]:step.args;
      execFile(executable,command,{cwd:home,env,windowsHide:true,timeout:15000,maxBuffer:LIMIT},(error,stdout,stderr)=>error?reject(new Error(clean(stderr||error.message))):resolve(stdout));
    }));
  }
  async account(){
    try{await this.readTool('gh',['--version']);}catch{return {available:false,connected:false,error:'Install GitHub CLI (gh) on your computer to connect GitHub.'};}
    try{
      const login=(await this.readTool('gh',['api','--hostname','github.com','user','--jq','.login'])).trim();
      if(!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login))throw new Error('Invalid GitHub account response.');
      return {available:true,connected:true,login};
    }catch(error){return {available:true,connected:false,error:clean(error.message)};}
  }
  async details(folder){
    const repo=await this.service.status(folder);if(!repo.root)return repo;
    const read=args=>this.service.run(repo.root,args).then(text);
    const [names,upstreamInfo,name,email,index]=await Promise.all([
      read(['remote']),repo.branch?read(['for-each-ref','--format=%(upstream:short)%00%(upstream:remotename)%00%(upstream:remoteref)','refs/heads/'+repo.branch]):'',
      read(['config','--get','user.name']).catch(()=>''),read(['config','--get','user.email']).catch(()=>''),
      this.indexState(repo)
    ]);
    const remotes=[];for(const name of names.split('\n').filter(Boolean))remotes.push({name,url:clean(await read(['remote','get-url',name]))});
    const [upstream,upstreamRemote,upstreamRef]=upstreamInfo.split('\0');let ahead=0,behind=0;
    if(upstream&&repo.head){const counts=await read(['rev-list','--left-right','--count','HEAD...@{upstream}']).catch(()=>'');[ahead,behind]=counts.split(/\s+/).map(Number);}
    return {...repo,remotes,upstream:upstream||null,upstreamRemote:upstreamRemote||null,upstreamBranch:upstreamRef?.replace(/^refs\/heads\//,'')||null,ahead:ahead||0,behind:behind||0,identity:{name,email},indexState:index};
  }
  async indexState(repo){
    const raw=await this.service.run(repo.root,['diff','--cached','--raw','-z','--no-abbrev','--no-renames','--no-ext-diff']);
    return createHash('sha256').update(repo.head||'').update(raw).digest('hex');
  }
  start(params){
    if(!params||!actions.has(params.action))throw new Error('Invalid Git operation.');
    if(this.current)throw new Error('A Git operation is already running. Wait or cancel it first.');
    const job={id:++this.sequence,action:params.action,stopped:false,child:null,bytes:0};this.current=job;
    // Defer events until the caller has received its operation ID.
    job.done=new Promise(resolve=>setImmediate(resolve)).then(()=>this.execute(job,params));
    return {id:job.id};
  }
  cancel(){if(!this.current)return false;const job=this.current;this.runner.current=job;this.runner.stop();job.stopped=true;return true;}
  close(){if(this.current){this.current.stopped=true;this.runner.current=this.current;}this.runner.stop(true);}
  async execute(job,params){
    let result;
    const command=(folder,tool,args,options)=>this.runner.command(job,folder,tool,args,options);
    this.onEvent({id:job.id,type:'start',action:job.action});
    try{
      if(job.stopped)throw new Error('Git operation cancelled.');
      if(['login','logout','repositories'].includes(job.action)){
        if(job.action==='login'){
          await command(this.home,'gh',['auth','login','--hostname','github.com','--git-protocol','https','--web']);
          await command(this.home,'gh',['auth','setup-git','--hostname','github.com']);
          result={account:await this.account()};
        }else if(job.action==='logout'){
          if(typeof params.login!=='string'||!/^[a-z\d-]{1,39}$/i.test(params.login))throw new Error('Choose a connected GitHub account.');
          await command(this.home,'gh',['auth','logout','--hostname','github.com','--user',params.login]);result={account:await this.account()};
        }else{
          const page=params.page??1;if(!Number.isInteger(page)||page<1||page>1000)throw new Error('Invalid repository page.');
          const raw=await command(this.home,'gh',['api','--hostname','github.com',`user/repos?per_page=100&sort=updated&page=${page}`],{quiet:true});
          const rows=JSON.parse(raw);if(!Array.isArray(rows))throw new Error('Invalid GitHub repository response.');
          result={page,repositories:rows.map(row=>({name:row.full_name,url:row.clone_url,private:Boolean(row.private)})).filter(row=>typeof row.name==='string'&&typeof row.url==='string')};
        }
      }else if(job.action==='clone'){
        const url=remoteURL(params.url);
        if(typeof params.parent!=='string'||!path.isAbsolute(params.parent)||this.service.isRemote(params.parent))throw new Error('Choose a local destination folder.');
        const parent=await fs.realpath(params.parent);
        if(this.service.isRemote(parent)||!(await fs.stat(parent)).isDirectory())throw new Error('Choose a local destination folder.');
        if(typeof params.name!=='string'||!params.name||params.name.length>120||params.name==='.'||params.name==='..'||/[\\/\0<>:"|?*\x00-\x1f]/.test(params.name)||/[. ]$/.test(params.name)||/^-(?:.*)$/.test(params.name))throw new Error('Choose a new folder name for the clone.');
        const target=path.join(parent,params.name);await fs.mkdir(target);
        // Never delete a destination recursively on cancellation: partial clones
        // and any files created there meanwhile remain available to the user.
        try{await command(parent,'git',['clone','--progress','--',url,target]);}catch(error){throw new Error(error.message+'\nPartial clone files may remain at: '+target);}
        result={root:target};
      }else{
        if(typeof params.folder!=='string')throw new Error('Open a local Git repository.');
        const repo=await this.service.inspect(params.folder);if(!repo.root)throw new Error('Open a local Git repository.');
        const root=repo.root,git=args=>command(root,'git',args);
        if(job.stopped)throw new Error('Git operation cancelled.');
        if(['stage','unstage'].includes(job.action)){
          if(!Array.isArray(params.files)||!params.files.length||params.files.length>8000)throw new Error('Choose changed files to stage or unstage.');
          const selected=[];
          for(const file of params.files){
            if(typeof file!=='string'||!path.isAbsolute(file)||!inside(root,file))throw new Error('The file is outside this Git repository.');
            const change=repo.changes.find(change=>change.path===file);if(!change)throw new Error('Git changes have changed. Refresh and try again.');
            if(change.kind==='conflict')throw new Error('Resolve Git conflicts before staging changes.');
            selected.push(change.relativePath);
            if((job.action==='unstage'&&change.index==='R'||job.action==='stage'&&change.worktree==='R')&&change.originalPath)selected.push(path.relative(root,change.originalPath));
          }
          // Small literal-path batches avoid OS argv limits and also work with
          // older host Git versions. Each batch can be cancelled independently.
          const paths=[...new Set(selected)];
          for(let i=0;i<paths.length;){
            const batch=[];let size=0;
            while(i<paths.length&&batch.length<64&&(size+paths[i].length<12000||!batch.length)){size+=paths[i].length+1;batch.push(paths[i++]);}
            await git(job.action==='stage'?['add','--all','--',...batch]:repo.head?['reset','--quiet',repo.head,'--',...batch]:['rm','--cached','--quiet','--force','--ignore-unmatch','--',...batch]);
          }
        }else if(job.action==='commit'){
          if(repo.detached)throw new Error('Check out a branch before committing.');
          if(params.branch!==repo.branch)throw new Error('The current branch changed. Refresh and try again.');
          if(repo.changes.some(change=>change.kind==='conflict'))throw new Error('Resolve Git conflicts before committing.');
          if(!repo.changes.some(change=>change.index!==' '&&change.index!=='?'))throw new Error('Stage changes before committing.');
          if(typeof params.message!=='string'||!params.message.trim()||params.message.length>10000||params.message.includes('\0'))throw new Error('Enter a commit message.');
          if(params.indexState!==await this.indexState(repo))throw new Error('Staged changes have changed. Review them again before committing.');
          await git(['commit','-m',params.message]);
        }else if(job.action==='identity'){
          if(typeof params.name!=='string'||!params.name.trim()||params.name.length>200||/[\0\r\n<>]/.test(params.name)||typeof params.email!=='string'||!/^\S+@\S+\.\S+$/.test(params.email)||params.email.length>254||/[<>\0\r\n]/.test(params.email))throw new Error('Enter a name and email for commits.');
          await git(['config','--local','user.name',params.name.trim()]);await git(['config','--local','user.email',params.email]);
        }else{
          if(!['fetch','pull','push'].includes(job.action))throw new Error('Invalid Git operation.');
          const remotes=text(await this.service.run(root,['remote'])).split('\n');
          if(typeof params.remote!=='string'||!params.remote||params.remote.startsWith('-')||!remotes.includes(params.remote))throw new Error('Choose an existing Git remote.');
          if(job.action==='fetch')await git(['fetch','--progress','--',params.remote]);
          else{
            if(repo.detached||!repo.branch)throw new Error('Check out a branch before pulling or pushing.');
            if(params.branch!==repo.branch)throw new Error('The current branch changed. Refresh and try again.');
            const target=params.target??repo.branch;
            if(typeof target!=='string'||!target||target.length>1024||target.startsWith('-')||/[\0\r\n]/.test(target))throw new Error('Choose a remote branch.');
            await git(['check-ref-format','refs/heads/'+target]);
            if(job.action==='pull'){
              if(repo.changes.length)throw new Error('Commit or move local changes before pulling.');
              await git(['-c','fetch.recurseSubmodules=false','pull','--ff-only','--no-rebase','--no-autostash','--no-recurse-submodules','--progress','--',params.remote,'refs/heads/'+target]);
            }else{
              if(!repo.head)throw new Error('Create a commit before pushing.');
              await git(['-c',`remote.${params.remote}.mirror=false`,'push','--porcelain','--progress','--no-force','--no-follow-tags','--set-upstream','--',params.remote,'refs/heads/'+repo.branch+':refs/heads/'+target]);
            }
          }
        }
        result={root};
      }
      if(job.stopped)throw new Error('Git operation cancelled.');
      this.onEvent({id:job.id,type:'done',ok:true,action:job.action,result});
    }catch(error){this.onEvent({id:job.id,type:'done',ok:false,action:job.action,stopped:job.stopped,error:clean(error.message)});}
    finally{if(this.current===job)this.current=null;if(this.runner.current===job)this.runner.current=null;}
    return result;
  }
}
module.exports={GitWorkflow,GitCommandRunner,toolStep,remoteURL,clean};

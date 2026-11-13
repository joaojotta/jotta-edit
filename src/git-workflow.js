import {tr} from './i18n.js';
import {folderContains} from './workspace-folders.js';

const staged=change=>change.index!==' '&&change.index!=='?'&&change.kind!=='conflict';
const unstaged=change=>change.worktree!==' '&&change.kind!=='conflict';
const nameOf=root=>root.replace(/\\/g,'/').split('/').filter(Boolean).at(-1)||root;
const describe={M:'Modified',A:'Added',D:'Deleted',R:'Renamed',C:'Copied','?':'Untracked'};

export async function prepareGitOperation({action,folder,files=[]},{getDocuments,save}){
  if(!folder)return true;
  const documents=getDocuments().filter(doc=>doc.path&&folderContains(folder,doc.path));
  if(['pull','update','abortMerge','finishMerge'].includes(action)&&documents.some(doc=>doc.dirty))throw new Error(tr('Save unsaved documents before updating or finishing a merge.'));
  if(['createBranch','switchBranch','publish'].includes(action)&&documents.some(doc=>doc.dirty))throw new Error(tr('Save unsaved documents before switching branches or publishing.'));
  if(['stage','commitAll','resolveConflict'].includes(action)){
    const matches=file=>files.some(selected=>folderContains(selected,file)&&folderContains(file,selected));
    const selected=documents.filter(doc=>matches(doc.path));
    for(const doc of selected)if(doc.dirty&&!await save(doc))return false;
    return selected.every(doc=>getDocuments().includes(doc)&&!doc.dirty&&matches(doc.path));
  }
  return true;
}

export function installGitWorkflow({api,host,getContext,getDocuments,prepare=async()=>true,openFolder=async()=>{},openFile=async()=>{},renderChanges=()=>{},refresh,compare,operationDone=()=>{},notify=()=>{},documentRef=document}){
  if(!api.gitOperation||!api.onGitEvent||!host)return null;
  host.hidden=false;
  let repositories=[],selectedRoot='',details=null,detailsKey='',detailsRevision=0,account=null,accountLoaded=false;
  let operation=null,pending=false,early=[],unsubscribe=null,log='',page=1,canNext=false,operationContext=null,alive=true;
  const rowEligibility=new Map();
  const drafts=new Map(),targets=new Map(),remoteChoices=new Map(),controls=[],translated=[],fieldLabels=[],rowButtons=[];let constructing=true;
  const node=(tag,cls='',label='')=>{const el=documentRef.createElement(tag);el.className=cls;if(label){el.textContent=tr(label);if(constructing)translated.push([el,label]);}return el;};
  const button=(label,parent,handler)=>{const el=node('button','git-action',label);el.type='button';el.onclick=handler;parent.append(el);controls.push(el);return el;};
  const field=(label,parent,tag='input')=>{const wrap=node('label','git-field'),caption=node('span','',label),input=node(tag);if(tag==='input')input.type='text';input.setAttribute('aria-label',tr(label));fieldLabels.push([input,label]);wrap.append(caption,input);parent.append(wrap);controls.push(input);return input;};
  const section=(label,parent=host)=>{const el=node('details','git-settings'),summary=node('summary','',label);el.append(summary);parent.append(el);return el;};
  const advanced=section('Advanced');advanced.open=false;
  advanced.addEventListener('toggle',()=>{updateDisabled();renderChanges();});
  const projectSummary=node('p','git-project-summary');host.append(projectSummary);
  const connection=section('GitHub connection',advanced),accountStatus=node('p','panel-status');accountStatus.setAttribute('role','status');connection.append(accountStatus);
  const accountButtons=node('div','git-actions');connection.append(accountButtons);
  const connect=button('Connect GitHub',accountButtons,()=>void perform('login'));
  const checkAccount=button('Check connection',accountButtons,()=>void loadAccount());
  const disconnect=button('Sign out',accountButtons,()=>void perform('logout',{login:account?.login}));
  const credentialNote=node('p','git-note','Uses GitHub CLI (gh) and its shared account credentials. Existing SSH and Git credential helpers also work.');connection.append(credentialNote);
  const clone=section('Clone repository',advanced),cloneURL=field('Repository URL or owner/repository',clone);
  cloneURL.placeholder='https://github.com/owner/repository.git';cloneURL.spellcheck=false;
  const repoActions=node('div','git-actions');clone.append(repoActions);
  const loadRepos=button('Load GitHub repositories',repoActions,()=>{page=1;void perform('repositories',{page});});
  const repoSelect=field('GitHub repositories',clone,'select');repoSelect.hidden=true;repoSelect.parentElement.hidden=true;
  const pages=node('div','git-actions');clone.append(pages);
  const previous=button('Previous page',pages,()=>void perform('repositories',{page:Math.max(1,page-1)}));
  const next=button('Next page',pages,()=>void perform('repositories',{page:page+1}));pages.hidden=true;
  const parent=field('Clone destination',clone);parent.readOnly=true;
  button('Choose destination…',clone,async()=>{try{const result=await api.chooseCloneParent();if(result)parent.value=result;}catch(error){message(error.message);}});
  const cloneName=field('New folder name',clone);cloneName.maxLength=120;
  const inferName=()=>{if(!cloneName.value)cloneName.value=cloneURL.value.trim().replace(/\/$/,'').split(/[/:]/).at(-1).replace(/\.git$/,'');};
  cloneURL.addEventListener('change',inferName);
  repoSelect.addEventListener('change',()=>{cloneURL.value=repoSelect.value;cloneName.value='';inferName();});
  button('Clone and open',clone,()=>{inferName();void perform('clone',{url:cloneURL.value.trim(),parent:parent.value,name:cloneName.value.trim()});});
  const opened=node('div','git-actions');host.append(opened);opened.hidden=true;let clonedRoot=null;
  button('Open cloned repository',opened,()=>void openFolder(clonedRoot));
  const setup=section('Publish project to GitHub',advanced),project=field('Project folder',setup,'select');
  setup.append(node('p','git-note','Initialize Git, review and commit your files, then publish. Only the current branch is uploaded.'));
  const initialize=button('Initialize Git',setup,()=>void perform('init',{folder:project.value,githubIdentity:Boolean(account?.connected)}));
  setup.append(node('p','git-note','When GitHub is connected, initialization sets your private GitHub email for this repository.'));
  const publishName=field('GitHub repository name',setup);publishName.maxLength=100;publishName.spellcheck=false;
  const visibility=field('Visibility',setup,'select');
  for(const [value,label] of [['private','Private'],['public','Public']]){const option=node('option','',label);option.value=value;visibility.append(option);}visibility.value='private';
  const publishRemote=field('New remote name',setup);publishRemote.value='origin';
  const publishNote=node('p','git-note');setup.append(publishNote);
  const publish=button('Create repository and publish',setup,()=>{
    const repo=projectRepository();
    void perform('publish',{folder:project.value,name:publishName.value.trim(),visibility:visibility.value,remote:publishRemote.value.trim(),branch:repo?.branch,head:repo?.head});
  });
  setup.append(node('p','git-note','Review the committed files and history before publishing. Public repositories are visible to everyone.'));
  const repoControls=node('div','git-repository-controls');host.append(repoControls);
  const repoPicker=field('Repository',advanced,'select');
  const tracking=node('p','git-note');repoControls.append(tracking);
  const branches=section('Branches',advanced),branchSelect=field('Local branch',branches,'select');
  const switchBranch=button('Switch branch',branches,()=>void branchAction('switchBranch',branchSelect.value));
  const newBranch=field('New branch name',branches);newBranch.spellcheck=false;newBranch.maxLength=200;
  const createBranch=button('Create and switch branch',branches,()=>void branchAction('createBranch',newBranch.value.trim()));
  branches.append(node('p','git-note','Save documents and commit or move local changes before switching branches.'));
  const remoteSettings=section('Remote and identity',advanced);
  const remote=field('Remote',remoteSettings,'select'),target=field('Remote branch',remoteSettings);
  target.spellcheck=false;
  const addRemote=section('Connect existing repository',remoteSettings),remoteName=field('Remote name',addRemote),remoteURL=field('Existing repository URL',addRemote);
  remoteName.value='origin';remoteURL.placeholder='https://github.com/owner/repository.git';remoteURL.spellcheck=false;
  const connectRemote=button('Add remote',addRemote,()=>void perform('remote',{folder:selectedRoot,remote:remoteName.value.trim(),url:remoteURL.value.trim()}));
  addRemote.append(node('p','git-note','Adds a new remote without replacing existing ones. Then use Fetch to review its history or Push to upload your commits.'));
  const network=node('div','git-actions');advanced.append(network);
  const simpleNetwork=node('div','git-actions');repoControls.append(simpleNetwork);
  const checkUpdates=button('Check for updates',simpleNetwork,()=>void networkAction('fetch',true));
  const updateProject=button('Update project',simpleNetwork,()=>void networkAction('update',true));
  const upload=button('Upload commits',simpleNetwork,()=>void networkAction('push',true));
  updateProject.title=tr('Update project downloads and merges remote changes. Upload commits sends your committed changes.');
  const mergeControls=node('div','git-merge-controls');repoControls.append(mergeControls);
  mergeControls.append(node('p','git-note','Merge in progress. Open conflicted files, edit and save the result, then mark each resolved. Finish the merge to keep the result, or abort to discard merge resolutions and return to the previous commit.'));
  const mergeButtons=node('div','git-actions');mergeControls.append(mergeButtons);
  const finishMerge=button('Finish merge',mergeButtons,()=>void mergeAction('finishMerge'));
  const abortMerge=button('Abort merge',mergeButtons,()=>void mergeAction('abortMerge'));
  const identitySetup=button('Set commit identity',repoControls,()=>{advanced.open=true;remoteSettings.open=true;identity.open=true;identityName.focus();});
  const fetch=button('Fetch',network,()=>void networkAction('fetch'));
  const pull=button('Pull',network,()=>void networkAction('pull'));
  const push=button('Push',network,()=>void networkAction('push'));
  const identity=section('Commit identity',remoteSettings),identityName=field('Name',identity),identityEmail=field('Email',identity);
  button('Save for this repository',identity,()=>void perform('identity',{folder:selectedRoot,name:identityName.value,email:identityEmail.value}));
  const privateEmail=button('Use GitHub private email',identity,()=>void perform('githubIdentity',{folder:selectedRoot}));
  identity.append(node('p','git-note','Uses your GitHub noreply email for future commits in this repository. Existing commits keep their original email.'));
  const stageControls=node('div','git-actions');advanced.append(stageControls);
  const stageAll=button('Stage all',stageControls,()=>void changeStage('stage',selectedRepo()?.changes.filter(unstaged).map(change=>change.path)||[],selectedRoot));
  const unstageAll=button('Unstage all',stageControls,()=>void changeStage('unstage',selectedRepo()?.changes.filter(staged).map(change=>change.path)||[],selectedRoot));
  const commitMessage=field('Commit message',repoControls,'textarea');commitMessage.rows=2;commitMessage.maxLength=10000;
  commitMessage.addEventListener('input',()=>{drafts.set(selectedRoot,commitMessage.value);updateDisabled();});
  const saveCommit=button('Save and commit all',repoControls,()=>{const files=[...new Set([...(selectedRepo()?.changes||[]).map(change=>change.path),...getDocuments().filter(doc=>doc.dirty&&doc.path&&folderContains(selectedRoot,doc.path)).map(doc=>doc.path)])];void perform('commitAll',{folder:selectedRoot,files,message:commitMessage.value,indexState:details?.indexState,branch:details?.branch,head:details?.head});});
  repoControls.append(node('p','git-note','Includes all changed files in this repository. Review the list below.'));
  repoControls.append(simpleNetwork);
  const commit=button('Commit staged changes',advanced,()=>void perform('commit',{folder:selectedRoot,message:commitMessage.value,indexState:details?.indexState,branch:details?.branch}));
  advanced.append(node('p','git-note','Staging saves selected open files first. Commits include only staged changes. Pull requires a clean repository and saved documents.'));
  const progress=node('p','panel-status');progress.hidden=true;progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');host.append(progress);
  const help=node('p','git-note');help.setAttribute('role','status');help.hidden=true;host.append(help);
  const progressActions=node('div','git-actions');host.append(progressActions);
  const cancel=node('button','git-action','Cancel Git operation');cancel.type='button';cancel.onclick=()=>{cancel.disabled=true;void api.cancelGit().catch(error=>message(error.message));};progressActions.append(cancel);cancel.hidden=true;
  const verify=node('button','git-action','Open verification page');verify.type='button';verify.onclick=()=>void api.openGitHubVerification().catch(error=>message(error.message));progressActions.append(verify);verify.hidden=true;
  const outputDetails=section('Git output',advanced),output=node('pre','git-output');output.tabIndex=0;output.setAttribute('aria-label',tr('Git output'));outputDetails.append(output);

  host.append(advanced);
  const selectedRepo=()=>repositories.find(repo=>repo.root===selectedRoot);
  const projectTarget=()=>({remote:details?.upstreamRemote||details?.remotes?.find(entry=>entry.name==='origin')?.name||details?.remotes?.[0]?.name||'',target:details?.upstreamBranch||details?.branch||''});
  const projectRepository=()=>repositories.filter(repo=>folderContains(repo.root,project.value)).sort((a,b)=>b.root.length-a.root.length)[0];
  const currentContext=()=>JSON.stringify(getContext().roots);
  function message(value){progress.hidden=false;progress.textContent=value;notify(value);}
  function updateDisabled(){
    const busy=pending||Boolean(operation);for(const control of controls)control.disabled=busy;
    for(const control of rowButtons)control.disabled=busy||Boolean(rowEligibility.get(control)?.());
    projectSummary.textContent=selectedRoot?tr('Current project')+': '+nameOf(selectedRoot):tr('Open a local project. Repository setup is available in Advanced.');projectSummary.title=selectedRoot;
    repoControls.hidden=!selectedRepo();disconnect.hidden=!account?.connected;
    connect.hidden=Boolean(account?.connected);connect.disabled=busy||account?.available===false;loadRepos.disabled=busy||!account?.connected;
    previous.disabled=busy||page<=1;next.disabled=busy||!canNext;
    setup.hidden=!project.children.length;
    const publishRepo=projectRepository();initialize.hidden=Boolean(publishRepo);initialize.disabled=busy||!project.value;
    publish.disabled=busy||!account?.connected||!publishRepo?.head||publishRepo.detached||Boolean(publishRepo.changes?.length)||!publishName.value.trim()||!publishRemote.value.trim();
    publishNote.textContent=!publishRepo?tr('Initialize Git to start.'):!publishRepo.head?tr('Review, stage and commit your files before publishing.'):publishRepo.changes?.length?tr('Commit or move local changes before publishing.'):tr('Creates a new repository under your connected GitHub account. To connect an existing repository, use Remote and identity.');
    const loaded=details?.root===selectedRoot;
    for(const control of [remote,target,fetch,pull,push,commit,branchSelect,newBranch,createBranch,switchBranch,privateEmail,connectRemote])control.disabled=busy||!loaded;
    const merging=Boolean(details?.mergeHead);
    mergeControls.hidden=!merging;
    finishMerge.disabled=busy||!loaded||!merging||Boolean(details?.changes?.some(change=>change.kind==='conflict'));
    abortMerge.disabled=busy||!loaded||!merging;
    identitySetup.hidden=!loaded||Boolean(details?.identity?.name&&details?.identity?.email);
    const detached=details?.detached||!details?.branch;
    pull.disabled||=detached||!remote.value;push.disabled||=detached||!details?.head||!remote.value;fetch.disabled||=!remote.value;
    const basic=projectTarget();
    checkUpdates.disabled=busy||!loaded||!basic.remote;
    updateProject.disabled=busy||!loaded||detached||!basic.remote||merging||Boolean(details?.changes?.length);
    upload.disabled=busy||!loaded||detached||!details?.head||!basic.remote||merging||Boolean(details?.behind);
    saveCommit.disabled=busy||!loaded||detached||merging||!details?.identity?.name||!details?.identity?.email||!commitMessage.value.trim()||!(selectedRepo()?.changes.length||getDocuments().some(doc=>doc.dirty&&doc.path&&folderContains(selectedRoot,doc.path)))||Boolean(details?.changes?.some(change=>change.kind==='conflict'));
    commit.disabled||=merging||detached||!commitMessage.value.trim()||!details?.changes?.some(staged)||details?.changes?.some(change=>change.kind==='conflict');
    switchBranch.disabled||=!details?.head||!branchSelect.value||branchSelect.value===details?.branch||Boolean(details?.changes?.length);
    createBranch.disabled||=!details?.head||!newBranch.value.trim()||Boolean(details?.changes?.length);
    privateEmail.disabled||=!account?.connected;
    stageAll.disabled=busy||!selectedRepo()?.changes.some(unstaged);unstageAll.disabled=busy||!selectedRepo()?.changes.some(staged);
    cancel.hidden=!busy;verify.hidden=!(busy&&operation?.action==='login');progressActions.hidden=!busy;
  }
  async function loadAccount(){
    checkAccount.disabled=true;accountStatus.textContent=tr('Checking GitHub connection…');
    try{account=await api.gitAccount();accountLoaded=true;accountStatus.textContent=account.connected?'GitHub · '+account.login:tr(account.error||'GitHub is not connected.');}
    catch(error){accountStatus.textContent=error.message;}
    finally{updateDisabled();}
  }
  async function loadDetails(force=false){
    const repo=selectedRepo();if(!repo){details=null;updateDisabled();return;}
    const signature=JSON.stringify([repo.root,repo.head,repo.branch,repo.mergeHead,repo.changes]);
    if(!force&&signature===detailsKey)return;
    detailsKey=signature;const revision=++detailsRevision,root=repo.root;details=null;updateDisabled();
    try{
      const result=await api.gitDetails(root);if(!alive||revision!==detailsRevision||root!==selectedRoot)return;
      details=result;
      const previousRemote=remoteChoices.get(root);remote.replaceChildren();
      for(const entry of result.remotes||[]){const option=node('option');option.value=entry.name;option.textContent=entry.name;option.title=entry.url;remote.append(option);}
      remote.value=(result.remotes||[]).some(entry=>entry.name===previousRemote)?previousRemote:result.upstreamRemote||result.remotes?.[0]?.name||'';
      target.value=targets.get(JSON.stringify([root,remote.value,result.branch]))??(result.upstreamRemote===remote.value&&result.upstreamBranch?result.upstreamBranch:result.branch||'');
      tracking.textContent=(result.branch||tr('Detached HEAD'))+(projectTarget().remote?' → '+projectTarget().remote+'/'+projectTarget().target:'')+'\n'+(result.ahead||0)+' '+tr('to upload')+' · '+(result.behind||0)+' '+tr('incoming');
      tracking.title=(result.upstream||remote.value)+' · '+tr('Last fetched status');
      identityName.value=result.identity?.name||'';identityEmail.value=result.identity?.email||'';
      const chosenBranch=branchSelect.value;branchSelect.replaceChildren();
      for(const name of result.branches||[]){const option=node('option');option.value=name;option.textContent=name;branchSelect.append(option);}
      branchSelect.value=(result.branches||[]).includes(chosenBranch)?chosenBranch:result.branch||'';
      identity.open=!identityName.value||!identityEmail.value;updateDisabled();
    }catch(error){if(revision===detailsRevision){detailsKey='';message(error.message);}}
  }
  remote.addEventListener('change',()=>{
    remoteChoices.set(selectedRoot,remote.value);
    target.value=targets.get(JSON.stringify([selectedRoot,remote.value,details?.branch]))??(details?.upstreamRemote===remote.value?details.upstreamBranch:details?.branch||'');updateDisabled();
  });
  target.addEventListener('input',()=>{targets.set(JSON.stringify([selectedRoot,remote.value,details?.branch]),target.value);});
  for(const input of [publishName,publishRemote,newBranch])input.addEventListener('input',updateDisabled);
  branchSelect.addEventListener('change',updateDisabled);
  project.addEventListener('change',()=>{publishName.value=nameOf(project.value);visibility.value='private';updateDisabled();});
  repoPicker.addEventListener('change',()=>{
    drafts.set(selectedRoot,commitMessage.value);selectedRoot=repoPicker.value;commitMessage.value=drafts.get(selectedRoot)||'';detailsKey='';void loadDetails();renderChanges();
  });
  async function mergeAction(action,files=[]){await perform(action,{folder:selectedRoot,files,branch:details?.branch,head:details?.head,mergeHead:details?.mergeHead,indexState:details?.indexState});}
  async function networkAction(action,simple=false){
    const destination=simple?projectTarget():{remote:remote.value,target:target.value.trim()};
    await perform(action,{folder:selectedRoot,...destination,branch:details?.branch,...(action==='update'?{head:details?.head}:{})});
  }
  async function branchAction(action,name){
    await perform(action,{folder:selectedRoot,name,branch:details?.branch,head:details?.head});
  }
  async function changeStage(action,files,root){
    if(!files.length)return;
    await perform(action,{folder:root,files});
  }
  async function perform(action,params={}){
    if(pending||operation)return false;
    progress.hidden=false;pending=true;early=[];operationContext=currentContext();log='';output.textContent='';help.hidden=true;progress.textContent=tr('Preparing Git operation…');updateDisabled();
    try{
      if(!await prepare({action,...params}))throw new Error(tr('Git operation cancelled.'));
      if(currentContext()!==operationContext)throw new Error(tr('Workspace changed. Try the Git operation again.'));
      const result=await api.gitOperation({action,...params});
      operation={id:result.id,action,root:params.folder};pending=false;cancel.disabled=false;updateDisabled();
      for(const event of early)handleEvent(event);early=[];
      return true;
    }catch(error){pending=false;early=[];operation=null;message(error.message);updateDisabled();return false;}
  }
  function handleEvent(event){
    if(pending&&!operation){if(early.length<100)early.push(event);return;}
    if(!operation||event.id!==operation.id)return;
    if(event.type==='start'){
      progress.textContent=tr('Running Git operation…')+' '+event.action;
      if(event.action==='login'){advanced.open=true;connection.open=true;outputDetails.open=true;}
      updateDisabled();
    }
    else if(event.type==='output'){
      log=(log+event.text).slice(-128*1024);output.textContent=log;output.scrollTop=output.scrollHeight;
      if(operation.action==='login')outputDetails.open=true;
    }else if(event.type==='done'){
      const completed=operation;operation=null;pending=false;cancel.disabled=false;
      progress.textContent=tr(event.ok?'Git operation completed.':event.error||'Git operation failed.');
      if(!event.ok){outputDetails.open=true;advanced.open=true;log=(log+'\n'+progress.textContent).slice(-128*1024);output.textContent=log;notify(progress.textContent);}
      help.textContent=event.help?tr(event.help):'';help.hidden=!event.help;
      if(event.ok&&completed.action==='createBranch'&&selectedRoot===completed.root)newBranch.value='';
      if(event.ok&&['commit','commitAll'].includes(completed.action)){
        drafts.delete(completed.root);if(selectedRoot===completed.root)commitMessage.value='';
      }
      if(event.result?.account||['login','logout'].includes(completed.action)){if(event.result?.account)account=event.result.account;accountLoaded=false;void loadAccount();}
      if(event.ok&&completed.action==='repositories'){
        page=event.result.page;canNext=event.result.repositories.length===100;repoSelect.replaceChildren();
        const placeholder=node('option','',event.result.repositories.length?'Choose a repository…':'No repositories found.');placeholder.value='';repoSelect.append(placeholder);
        for(const repo of event.result.repositories){const option=node('option');option.value=repo.url;option.textContent=repo.name+(repo.private?' · '+tr('Private'):'');repoSelect.append(option);}
        repoSelect.hidden=false;repoSelect.parentElement.hidden=false;pages.hidden=false;clone.open=true;
      }
      if(event.ok&&completed.action==='clone'){
        clonedRoot=event.result.root;opened.hidden=false;
        if(currentContext()===operationContext)void openFolder(clonedRoot);
      }
      detailsKey='';updateDisabled();void refresh();void loadDetails(true);
      if(event.ok||completed.action==='update')void Promise.resolve(operationDone(completed.action,event.result)).catch(error=>message(error.message));
    }
  }
  function render(repos){
    rowButtons.length=0;rowEligibility.clear();
    repositories=repos;
    const roots=[...new Set([...repositories.map(repo=>repo.root),...getContext().roots.filter(root=>!repositories.some(repo=>folderContains(repo.root,root)))])],projectKey=JSON.stringify(roots);
    if(project.dataset.roots!==projectKey){
      const previous=project.value;project.dataset.roots=projectKey;project.replaceChildren();
      for(const root of roots){const option=node('option');option.value=root;option.textContent=root;project.append(option);}
      project.value=roots.includes(previous)?previous:roots[0]||'';
      if(project.value!==previous){publishName.value=nameOf(project.value);visibility.value='private';}
    }
    const context=getContext(),currentFile=context.file||context.root||context.roots[0];
    const active=repositories.filter(repo=>currentFile&&folderContains(repo.root,currentFile)).sort((a,b)=>b.root.length-a.root.length)[0];
    if(!repositories.some(repo=>repo.root===selectedRoot)||!advanced.open&&active&&active.root!==selectedRoot){
      drafts.set(selectedRoot,commitMessage.value);
      selectedRoot=active?.root||repositories[0]?.root||'';
      commitMessage.value=drafts.get(selectedRoot)||'';detailsKey='';++detailsRevision;
    }
    const signature=JSON.stringify(repositories.map(repo=>repo.root));
    if(repoPicker.dataset.repositories!==signature){
      repoPicker.dataset.repositories=signature;repoPicker.replaceChildren();
      for(const repo of repositories){const option=node('option');option.value=repo.root;option.textContent=nameOf(repo.root);option.title=repo.root;repoPicker.append(option);}
    }
    repoPicker.value=selectedRoot;updateDisabled();void loadDetails();
    if(!accountLoaded){accountLoaded=true;void loadAccount();}
  }
  function renderRepository(group,repo,query){
    if(!advanced.open&&repo.root!==selectedRoot)return 0;
    let count=0;
    const modes=advanced.open?[['staged','Staged changes',staged],['unstaged','Unstaged changes',unstaged]]:[['working','Changed files',change=>change.kind!=='conflict']];
    modes.push(['conflict','Conflicts',change=>change.kind==='conflict']);
    for(const [mode,label,predicate] of modes){
      const changes=repo.changes.filter(predicate).filter(change=>!query||`${change.relativePath} ${tr(describe[mode==='staged'?change.index:change.worktree]||'Conflict')}`.toLocaleLowerCase().includes(query));
      if(!changes.length)continue;
      const heading=node('h4','git-change-heading',label);group.append(heading);
      for(const change of changes){
        count++;const row=node('div','git-change-row'),diff=node('button','git-change'),filename=node('span'),kind=node('small');
        diff.type='button';filename.textContent=change.relativePath;kind.textContent=tr(describe[mode==='staged'?change.index:change.worktree]||'Conflict');diff.append(filename,kind);
        diff.title=tr(mode==='staged'?'Compare staged changes':mode==='unstaged'?'Compare unstaged changes':'Compare with Git HEAD')+'\n'+change.path;
        diff.onclick=()=>void compare(change.path,repo.root,['conflict','working'].includes(mode)?null:mode);diff.disabled=pending||Boolean(operation);rowButtons.push(diff);row.append(diff);
        if(mode==='conflict'){
          const edit=node('button','git-file-action','Open file');edit.type='button';edit.disabled=pending||Boolean(operation);edit.onclick=()=>void openFile(change.path);row.append(edit);rowButtons.push(edit);
          const resolved=node('button','git-file-action','Mark resolved');resolved.type='button';resolved.disabled=pending||Boolean(operation)||!details?.mergeHead||details.root!==repo.root;rowEligibility.set(resolved,()=>!details?.mergeHead||details.root!==repo.root);resolved.onclick=()=>void mergeAction('resolveConflict',[change.path]);row.append(resolved);rowButtons.push(resolved);
        }else if(advanced.open){
          const action=node('button','git-file-action',mode==='staged'?'Unstage':'Stage');action.type='button';action.disabled=pending||Boolean(operation);
          action.setAttribute('aria-label',tr(mode==='staged'?'Unstage':'Stage')+' '+change.relativePath);action.onclick=()=>void changeStage(mode==='staged'?'unstage':'stage',[change.path],repo.root);row.append(action);
          rowButtons.push(action);
        }
        group.append(row);
      }
    }
    return count;
  }
  function start(){alive=true;if(!unsubscribe)unsubscribe=api.onGitEvent(handleEvent);}
  function stop(){alive=false;++detailsRevision;unsubscribe?.();unsubscribe=null;}
  documentRef.addEventListener('jotta:locale-changed',()=>{for(const [el,label] of translated)el.textContent=tr(label);for(const [el,label] of fieldLabels)el.setAttribute('aria-label',tr(label));accountLoaded=false;});
  constructing=false;updateDisabled();
  return {start,stop,render,renderRepository,perform,loadDetails,loadAccount,visibleRepository:repo=>advanced.open||repo.root===selectedRoot};
}

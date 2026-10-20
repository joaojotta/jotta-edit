import {GitHubClient,mergePlan,resolvePlan,textOf,validLink,validateEntries} from '../shared/github-sync.mjs';
import {tr} from './i18n.js';
export function installGitHub({api,getRoot,isDirty,openWorkspace,revealSidebar,onApplied,client=new GitHubClient()}) {
  const $=id=>document.getElementById(id);
  let user=null,busy=false,review=null,request=0,resolutions={},selected=new Set(),stored=null;
  const status=message=>{$('github-status').textContent=message;};
  const link=()=>validLink({repo:$('github-repository').value.trim(),branch:$('github-branch').value});
  const signature=files=>JSON.stringify(files.map(({path,sha,mode})=>({path,sha,mode})).sort((a,b)=>a.path.localeCompare(b.path)));
  function invalidate(){review=null;resolutions={};selected.clear();$('github-changes').replaceChildren();$('github-preview').hidden=true;controls();}
  function controls(){
    for(const id of ['github-token','github-connect','github-repository','github-load-branches','github-branch','github-new-checkout','github-refresh','github-message'])$(id).disabled=busy || (id.startsWith('github-')&&!['github-token','github-connect'].includes(id)&&!user);
    $('github-connect-form').hidden=Boolean(user);$('github-disconnect').hidden=!user;
    $('github-pull').disabled=busy||!review;$('github-sync').disabled=busy||!review;
    for(const node of $('github-changes').querySelectorAll('button,input,select'))node.disabled=busy || node.dataset.incoming==='true';
    $('github-workspace').textContent=getRoot() || tr('Open a workspace or create a checkout.');
  }
  function guard(root,run){if(root!==getRoot()||run!==request)throw new Error(tr('Workspace changed. Refresh GitHub changes.'));if(isDirty(root))throw new Error(tr('Save or discard workspace edits before syncing.'));}
  async function job(operation){
    if(busy)return;busy=true;controls();const run=++request;
    try{await operation(run);}catch(error){if(run===request)status(tr(error.message || String(error)));}
    finally{busy=false;controls();}
  }
  async function loadBranches(){
    const repo=$('github-repository').value.trim(), preferred=$('github-branch').value || (stored?.repo===repo?stored.branch:null);
    const result=await client.branches(repo);$('github-branch').replaceChildren();
    for(const branch of result.branches){const option=document.createElement('option');option.value=branch.name;option.textContent=branch.name;$('github-branch').appendChild(option);}
    $('github-branch').value=result.branches.some(branch=>branch.name===preferred)?preferred:result.defaultBranch;
    invalidate();status(tr('Repository ready. Review changes before syncing.'));
  }
  async function workspaceChanged(){
    ++request;for(const controller of client.controllers)controller.abort();invalidate();stored=null;controls();
    const root=getRoot(), run=request;if(!root)return;
    try{const state=await api.githubState(root);if(root!==getRoot()||run!==request)return;stored=state;
      if(state){$('github-repository').value=state.repo;$('github-branch').replaceChildren();const option=document.createElement('option');option.value=state.branch;option.textContent=state.branch;$('github-branch').appendChild(option);}
    }catch(error){if(root===getRoot())status(tr(error.message));}
  }
  async function preview(item){
    if(!review)return;const previous=review,root=review.root;
    try{
      $('github-preview').hidden=false;$('github-preview-title').textContent=item.path;
      $('github-preview-remote').textContent=tr('Loading…');$('github-preview-local').textContent=tr('Loading…');
      const remote=item.remote?await client.blob(review.link.repo,item.remote):null;
      if(review!==previous||getRoot()!==root)return;
      const display=file=>{if(!file)return tr('Deleted / absent');const text=textOf(file);return text===null?tr('Binary file'):text.slice(0,40000)+(text.length>40000?'\n'+tr('Preview truncated.'): '');};
      $('github-preview-remote').textContent=display(remote);$('github-preview-local').textContent=display(item.local);
    }catch(error){status(tr(error.message));}
  }
  function render(){
    const list=$('github-changes');list.replaceChildren();
    for(const item of review?.plan || []){
      const row=document.createElement('div');row.className='github-change';
      const top=document.createElement('div');top.className='github-change-top';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(item.path);checkbox.disabled=item.type==='incoming';checkbox.dataset.incoming=String(item.type==='incoming');checkbox.setAttribute('aria-label',tr('Include in commit')+': '+item.path);
      checkbox.onchange=()=>{if(checkbox.checked)selected.add(item.path);else selected.delete(item.path);};
      const button=document.createElement('button');button.type='button';button.className='github-change-path';button.textContent=item.path;button.title=tr('Preview changes');button.onclick=()=>preview(item);
      const kind=document.createElement('span');kind.className='github-change-kind';kind.textContent=tr(item.type==='conflict'?'Conflict':item.type==='incoming'?'Incoming':item.local?'Commit':'Delete');
      top.append(checkbox,button,kind);row.appendChild(top);
      if(item.type==='conflict'){
        const select=document.createElement('select');select.setAttribute('aria-label',tr('Resolve conflict')+': '+item.path);
        for(const [value,label] of [['','Choose a resolution…'],['local','Keep local version'],['remote','Use GitHub version']]){const option=document.createElement('option');option.value=value;option.textContent=tr(label);select.appendChild(option);}
        select.value=resolutions[item.path]||'';select.onchange=()=>{resolutions[item.path]=select.value;if(select.value==='local')selected.add(item.path);else selected.delete(item.path);checkbox.checked=selected.has(item.path);};row.appendChild(select);
      }
      list.appendChild(row);
    }
    controls();
  }
  async function refresh(run){
    const root=getRoot();guard(root,run);if(!root)throw new Error(tr('Open a workspace first.'));
    const target=link();status(tr('Reading GitHub and workspace changes…'));
    const state=await api.githubState(root),remote=await client.snapshot(target);guard(root,run);
    const base=state?.repo===target.repo?state.entries:[];
    const tracked=[...new Map([...base,...remote.entries].map(file=>[file.path,file])).values()];
    const local=await api.githubSnapshot(root,tracked);guard(root,run);
    review={root,link:target,remote,local,tracked,plan:mergePlan(base,local,remote.entries)};stored=state;resolutions={};
    selected=new Set(review.plan.filter(item=>item.type==='outgoing'&&item.base).map(item=>item.path));render();
    if(!review.plan.length){await api.githubSetState(root,{...target,...remote});stored={...target,...remote};}
    status(review.plan.length?tr('Review every change. New files are excluded until selected.'):tr('Workspace and GitHub are up to date.'));
  }
  async function sync(run,pullOnly){
    if(!review)throw new Error(tr('Review changes before syncing.'));
    const checked=review;guard(checked.root,run);
    const target=link();if(target.repo!==checked.link.repo||target.branch!==checked.link.branch)throw new Error(tr('Repository changed. Review changes again.'));
    const {incoming,outgoing}=resolvePlan(checked.plan,resolutions,pullOnly?[]:[...selected]);
    const live=await api.githubSnapshot(checked.root,checked.tracked);guard(checked.root,run);
    if(signature(live)!==signature(checked.local))throw new Error(tr('Workspace changed after review. Refresh before syncing.'));
    const incomingFiles=new Array(incoming.length);let next=0,downloaded=0;
    await Promise.all(Array.from({length:Math.min(4,incoming.length)},async()=>{
      while(next<incoming.length){const index=next++,item=incoming[index];guard(checked.root,run);
        status(tr('Downloading GitHub updates…')+` ${downloaded}/${incoming.length}`);
        incomingFiles[index]=item.remote?await client.blob(target.repo,item.remote):{path:item.path,data:null,mode:item.base?.mode || '100644'};
        guard(checked.root,run);downloaded++;
      }
    }));
    const outgoingFiles=outgoing.map(item=>item.local || {path:item.path,data:null,mode:item.remote?.mode || '100644'});
    let remote=checked.remote,published=false,applied=false;
    try{
      if(outgoingFiles.length){
        const final=new Map(remote.entries.map(file=>[file.path,file]));for(const file of outgoingFiles){if(file.data===null)final.delete(file.path);else final.set(file.path,file);}validateEntries([...final.values()]);
        status(tr('Creating commit and updating GitHub…'));remote=await client.publish(target,remote,outgoingFiles,$('github-message').value);published=true;
      }
      guard(checked.root,run);status(tr('Applying reviewed updates…'));
      await api.githubApply(checked.root,incomingFiles,checked.local,checked.tracked);applied=true;
      await api.githubSetState(checked.root,{...target,...remote});
      await onApplied(checked.root,incomingFiles.map(file=>file.path));
      invalidate();status((published?tr('Committed and synced.'):tr('Pulled reviewed updates.'))+' '+remote.head.slice(0,8));
    }catch(error){
      invalidate();throw new Error((published?tr('The commit was pushed. '):applied?tr('Workspace files were updated. '):'')+error.message+' '+tr('Refresh before retrying.'));
    }
  }
  $('github-token-help').onclick=()=>api.githubTokenHelp();
  $('github-panel').addEventListener('keydown',event=>{if(event.key==='Escape'&&!busy)$('btn-explorer').click();});
  $('github-connect').onclick=()=>job(async()=>{
    const token=$('github-token').value;$('github-token').value='';status(tr('Connecting to GitHub…'));
    user=await client.connect(token);$('github-account').textContent=tr('Connected as')+' '+user.login;
    const repositories=await client.repositories();$('github-repositories').replaceChildren();
    for(const repo of repositories){const option=document.createElement('option');option.value=repo.full_name;$('github-repositories').appendChild(option);}
    status(tr('Choose a repository and load its branches.'));if($('github-repository').value)await loadBranches();
  });
  $('github-disconnect').onclick=()=>{client.disconnect();user=null;++request;invalidate();$('github-account').textContent=tr('Not connected');$('github-token').value='';status(tr('Disconnected. The token was cleared.'));controls();};
  $('github-load-branches').onclick=()=>job(loadBranches);
  $('github-repository').oninput=invalidate;$('github-branch').onchange=invalidate;
  $('github-refresh').onclick=()=>job(refresh);
  $('github-pull').onclick=()=>job(run=>sync(run,true));$('github-sync').onclick=()=>job(run=>sync(run,false));
  $('github-new-checkout').onclick=()=>job(async()=>{
    const target=link(),root=await api.githubChooseWorkspace(target.repo.split('/')[1]);if(!root)return;
    if(await openWorkspace(root)){await api.githubSetState(root,{...target,entries:[]});await workspaceChanged();status(tr('Checkout folder ready. Review, then pull the repository.'));}
  });
  function show(){revealSidebar();$('project-search').hidden=true;$('explorer-view').hidden=true;$('github-panel').hidden=false;
    $('btn-github').setAttribute('aria-pressed','true');$('btn-explorer').setAttribute('aria-pressed','false');$('btn-project-search').setAttribute('aria-pressed','false');controls();}
  $('btn-github').onclick=show;
  for(const id of ['btn-explorer','btn-project-search'])$(id).addEventListener('click',()=>{$('github-panel').hidden=true;$('btn-github').setAttribute('aria-pressed','false');});
  controls();return {show,workspaceChanged,invalidate};
}

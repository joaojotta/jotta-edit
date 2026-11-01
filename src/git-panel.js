import {tr} from './i18n.js';
import {folderContains} from './workspace-folders.js';
import {readOnlyDocument} from '../shared/font-files.mjs';
import {installGitWorkflow} from './git-workflow.js';

const symbols={modified:'M',added:'A',deleted:'D',renamed:'R',copied:'C',untracked:'?',conflict:'!'};
const labels={modified:'Modified',added:'Added',deleted:'Deleted',renamed:'Renamed',copied:'Copied',untracked:'Untracked',conflict:'Conflict'};
const key=value=>{let path=String(value||'').replace(/\\/g,'/').replace(/\/$/,'');return /^[a-z]:|^\/\//i.test(path)?path.toLowerCase():path;};
const parent=file=>{const at=Math.max(file.lastIndexOf('/'),file.lastIndexOf('\\'));return at===0?'/':/^[a-z]:[\\/]/i.test(file)&&at===2?file.slice(0,3):file.slice(0,at);};
const basename=file=>file.replace(/\\/g,'/').split('/').filter(Boolean).at(-1)||file;

export function installGitPanel({api,monaco,sidebar,getContext,getDocuments,languageOf,editorOptions=()=>({}),openFile,openFolder,prepare,operationDone=()=>{},showDiff,hideDiff,notify=()=>{},changed=()=>{},documentRef=document}){
  const $=id=>documentRef.getElementById(id),supported=Boolean(api.gitStatus),list=$('git-changes'),status=$('git-status'),branch=$('status-git'),filter=$('git-filter');
  let contextKey='',generation=0,comparisonRevision=0,refreshTimer=null,pollTimer=null,alive=false,running=null,queued=false;
  let repositories=[],errors=[],files=new Map(),folders=new Map(),watchFolders=[],lastSignature='',diff=null,original=null,modified=null,ownsModified=false,comparisonFile=null;
  const subscriptions=[];
  const workflow=installGitWorkflow({api,host:$('git-workflow'),getContext,getDocuments,prepare,openFolder,refresh,compare,notify,operationDone,documentRef});
  $('btn-git').hidden=!supported;branch.hidden=true;
  function roots(){return [...new Set(getContext().roots.filter(Boolean))];}
  function activeRepository(){
    const context=getContext(),file=context.file||context.root;
    return repositories.filter(repo=>file&&folderContains(repo.root,file)).sort((a,b)=>b.root.length-a.root.length)[0]||(!file?repositories[0]:null)||null;
  }
  const branchLabel=repo=>repo.detached?tr('Detached HEAD')+' · '+(repo.head?.slice(0,8)||''):repo.branch||tr('No commits yet');
  function renderBranch(){
    const repo=activeRepository();branch.hidden=!repo;
    branch.textContent=repo?'⑂ '+branchLabel(repo):'';
    branch.title=repo?repo.root+'\n'+tr('Git changes')+': '+repo.changes.length:'';
    branch.setAttribute('aria-label',repo?tr('Git branch')+': '+branchLabel(repo):tr('Git changes'));
  }
  function rebuildMarkers(){
    files=new Map();folders=new Map();
    for(const repo of repositories)for(const change of repo.changes){
      files.set(key(change.path),change);
      let folder=parent(change.path);
      while(folder&&folderContains(repo.root,folder)){
        folders.set(key(folder),(folders.get(key(folder))||0)+1);
        if(key(folder)===key(repo.root))break;
        const next=parent(folder);if(next===folder)break;folder=next;
      }
    }
  }
  function decorate(element,file,directory=false){
    if(!file)return;
    const change=files.get(key(file)),count=directory?folders.get(key(file)):0;
    if(!change&&!count)return;
    const kind=directory?'modified':change.kind,badge=documentRef.createElement('span');
    badge.className='git-file-status git-'+kind;badge.textContent=directory?'●':symbols[kind];
    badge.title=directory?tr('Git changes')+': '+count:tr(labels[kind])+` (${change.index}${change.worktree})`;
    badge.setAttribute('aria-label',badge.title);element.dataset.gitStatus=kind;element.append(badge);
  }
  function render(){
    renderBranch();if($('git-panel').hidden)return;
    workflow?.render(repositories);
    list.replaceChildren();const query=filter.value.trim().toLocaleLowerCase();let count=0;
    for(const repo of repositories){
      const group=documentRef.createElement('section'),heading=documentRef.createElement('h3');
      group.className='git-repository';heading.textContent=basename(repo.root)+' · '+branchLabel(repo);heading.title=repo.root;group.append(heading);list.append(group);
      if(workflow){count+=workflow.renderRepository(group,repo,query);continue;}
      for(const change of repo.changes){
        if(query&&!`${change.relativePath} ${tr(labels[change.kind])}`.toLocaleLowerCase().includes(query))continue;
        count++;
        const row=documentRef.createElement('button'),name=documentRef.createElement('span'),detail=documentRef.createElement('small');
        row.type='button';row.className='git-change';row.dataset.gitStatus=change.kind;
        name.textContent=change.relativePath;detail.textContent=tr(labels[change.kind]);
        row.title=tr('Compare with Git HEAD')+'\n'+change.path+(change.originalPath?'\n'+tr('Renamed from')+': '+change.originalPath:'');
        row.append(name,detail);decorate(row,change.path);group.append(row);
        row.onclick=()=>{void compare(change.path,repo.root);};
      }
    }
    status.textContent=errors.length?errors.join('\n'):!supported?tr('Git integration requires the desktop app.'):!repositories.length?tr('Open a local Git repository to see changes.'):repositories.some(repo=>repo.limited)?tr('Showing the first 8,000 Git changes.'):count?tr('Changed files')+': '+count:query?tr('No Git changes match.'):tr('Working tree clean. Unsaved buffers are compared when opened.');
  }
  function updateContext(){
    const next=JSON.stringify(roots());
    if(next!==contextKey){
      contextKey=next;++generation;repositories=[];errors=[];watchFolders=[];lastSignature='';rebuildMarkers();
      if(alive)schedule(0);
    }
    renderBranch();
  }
  function schedule(delay=350){
    if(!supported||!alive)return;
    clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{refreshTimer=null;void refresh();},delay);
  }
  async function refresh(){
    if(!supported||!alive||getContext().visible===false)return;
    if(running){queued=true;return running;}
    updateContext();const epoch=generation,requested=roots();
    $('git-refresh').disabled=true;
    running=(async()=>{
      const results=[];let next=0;
      await Promise.all(Array.from({length:Math.min(3,requested.length)},async()=>{
        while(next<requested.length&&alive&&generation===epoch){const folder=requested[next++];try{results.push({folder,result:await api.gitStatus(folder)});}catch(error){results.push({folder,error:error.message});}}
      }));
      if(!alive||generation!==epoch)return;
      const unique=new Map();errors=[];
      for(const entry of results){if(entry.error)errors.push(entry.error);else if(entry.result.root)unique.set(key(entry.result.root),entry.result);}
      repositories=[...unique.values()].sort((a,b)=>requested.findIndex(root=>folderContains(a.root,root))-requested.findIndex(root=>folderContains(b.root,root)));
      errors=[...new Set(errors)].sort();const signature=JSON.stringify([repositories,errors]);
      if(signature===lastSignature){renderBranch();return;}
      lastSignature=signature;
      watchFolders=[...new Set(repositories.flatMap(repo=>repo.watchFolders||[]))];rebuildMarkers();render();changed();
    })().finally(()=>{
      running=null;$('git-refresh').disabled=false;
      if(queued){queued=false;schedule(0);}
    });
    return running;
  }
  function closeDiff(){
    ++comparisonRevision;comparisonFile=null;
    diff?.setModel(null);original?.dispose();original=null;
    if(ownsModified)modified?.dispose();modified=null;ownsModified=false;
  }
  async function compare(file=getContext().file,folder=null,mode=null){
    if(!supported)return;
    if(!file){notify(tr('Open a saved local file to compare with Git HEAD.'));return;}
    let request=++comparisonRevision;
    const epoch=generation,activeFile=getContext().file;
    try{
      const doc=mode==='staged'?null:getDocuments().find(doc=>key(doc.path)===key(file));
      if(readOnlyDocument(doc))throw new Error(tr('Binary files do not support text Git comparisons.'));
      if(doc&&new TextEncoder().encode(doc.model.getValue()).length>5*1024*1024)throw new Error('Git comparison exceeds the 5 MB editor limit.');
      const result=await api.gitCompare({folder:folder||parent(file),file,includeWorking:!doc,...(mode?{mode}:{})});
      if(request!==comparisonRevision||epoch!==generation||getContext().file!==activeFile)return;
      if(doc&&(!getDocuments().includes(doc)||doc.model.isDisposed()||key(doc.path)!==key(file)))return;
      // showDiff closes the previous modal first. Assign new models only after
      // that cleanup; the working buffer itself is never owned by this view.
      showDiff();
      request=comparisonRevision;
      if(!diff)diff=monaco.editor.createDiffEditor($('git-diff-editor'),{...editorOptions(),automaticLayout:true,readOnly:true,originalEditable:false,
        renderSideBySide:true,ignoreTrimWhitespace:false,renderMarginRevertIcon:false,renderGutterMenu:false});
      const language=doc?.model.getLanguageId()||languageOf(file);
      original=monaco.editor.createModel(result.headText,language);
      modified=doc?.model||monaco.editor.createModel(result.workingText,language);ownsModified=!doc;comparisonFile=result.exists?file:null;
      diff.setModel({original,modified});
      $('git-diff-title').textContent=basename(file)+' · '+tr(mode==='staged'?'Compare staged changes':mode==='unstaged'?'Compare unstaged changes':'Compare with Git HEAD');
      $('git-diff-labels').textContent=(mode==='unstaged'?tr('Staging area'):result.head?'HEAD · '+result.head.slice(0,8):tr('No commits yet'))+' ↔ '+tr(mode==='staged'?'Staging area':doc?'Editor buffer':result.exists?'Working file':'Deleted file');
      $('git-diff-open').hidden=!result.exists;$('git-diff-open').disabled=!result.exists;
      $('git-diff-dialog').focus();diff.layout();
    }catch(error){if(request===comparisonRevision){hideDiff();notify(error.message);}}
  }
  $('git-refresh').onclick=()=>{void refresh();void workflow?.loadDetails(true);};filter.addEventListener('input',render);
  $('btn-git').onclick=()=>sidebar.show('git');branch.onclick=()=>sidebar.show('git');
  sidebar.onShow('git',()=>{render();void refresh();});
  $('git-diff-close').onclick=hideDiff;$('git-diff-done').onclick=hideDiff;
  $('git-diff-open').onclick=()=>{const file=comparisonFile;hideDiff();if(file)void openFile(file);};
  $('git-diff-overlay').addEventListener('mousedown',event=>{if(event.target===$('git-diff-overlay'))hideDiff();});
  documentRef.addEventListener('jotta:locale-changed',render);
  function start(){
    if(alive||!supported)return;alive=true;workflow?.start();updateContext();schedule(0);
    pollTimer=setInterval(()=>{void refresh();},api.onLocalFileChange?30000:10000);
    if(api.onLocalFileChange)subscriptions.push(api.onLocalFileChange(()=>schedule()));
  }
  function stop(){alive=false;workflow?.stop();++generation;clearTimeout(refreshTimer);clearInterval(pollTimer);refreshTimer=null;pollTimer=null;subscriptions.splice(0).forEach(unsubscribe=>unsubscribe());}
  return {start,stop,updateContext,decorate,compare,refresh,closeDiff,get watchFolders(){return watchFolders;},show:()=>sidebar.show('git')};
}

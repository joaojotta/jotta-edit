import {readOnlyDocument} from '../shared/font-files.mjs';
const bytes=value=>new TextEncoder().encode(value).length;
const find=(nodes,path)=>{for(const node of nodes){if(node.path===path)return node;if(node.dir){const child=find(node.children||[],path);if(child)return child;}}return null;};
const listingKey=nodes=>JSON.stringify(nodes.map(node=>[node.path,node.name,Boolean(node.dir),node.error||'']));
export function mergeFolderListing(previous,incoming){
  if(listingKey(previous)===listingKey(incoming))return previous;
  const existing=new Map(previous.map(node=>[node.path,node]));
  return incoming.map(node=>{
    const old=existing.get(node.path);
    return node.dir&&old?.dir&&!node.error?{...node,children:old.children||[],incomplete:old.incomplete,loading:old.loading}:node;
  });
}
function replaceChildren(nodes,path,children){
  let changed=false;
  const result=nodes.map(node=>{
    if(node.path===path){if(node.children===children)return node;changed=true;return {...node,children};}
    if(!node.dir)return node;
    const nested=replaceChildren(node.children||[],path,children);
    if(nested===node.children)return node;
    changed=true;return {...node,children:nested};
  });
  return changed?result:nodes;
}
export async function refreshExplorerSnapshot(context,scan,{isCurrent=()=>true,offset=0,limit=12}={}){
  let nodes=context.nodes;
  const roots=context.roots?.length?context.roots:[context.root];
  if(roots.length>1){
    for(const root of roots){
      try{
        const listing=await scan(root,{showHidden:context.showHidden,shallow:true});
        if(!isCurrent())return null;
        const node=nodes.find(node=>node.path===root);
        if(node)nodes=replaceChildren(nodes,root,mergeFolderListing(node.children||[],listing.nodes));
      }catch{/* Keep the other workspace folders available after a disconnected root. */}
    }
  }else{
    const root=await scan(context.root,{showHidden:context.showHidden,shallow:true});
    if(!isCurrent())return null;
    nodes=mergeFolderListing(nodes,root.nodes);
  }
  const expanded=context.expanded.filter(path=>!roots.includes(path));
  const targets=expanded.length?Array.from({length:Math.min(limit,expanded.length)},(_,index)=>expanded[(offset+index)%expanded.length]):[];
  for(const path of targets){
    const node=find(nodes,path);
    if(!node?.dir||node.loading||node.error)continue;
    try{
      const listing=await scan(path,{showHidden:context.showHidden,shallow:true});
      if(!isCurrent())return null;
      nodes=replaceChildren(nodes,path,mergeFolderListing(node.children||[],listing.nodes));
    }catch{/* A failed read must not erase an existing folder listing. */}
  }
  return {nodes,offset:expanded.length?(offset+targets.length)%expanded.length:0};
}
export function createAutomaticRefresh({api,getState,getDocuments,isOpen,isBusy=()=>false,commitExplorer,reload,missing,present=()=>{},conflict=()=>{},schedule=setTimeout,cancel=clearTimeout,now=Date.now}){
  const metadata=new WeakMap();let running=null,timer=null,alive=true,started=false,generation=0,offset=0;
  let watchKey='',watchRevision=0,watched=false,unsubscribe=null,eventTimer=null;
  const pendingDirectories=new Set();
  const pollDelay=()=>getState().remote?10000:watched?30000:2500;
  function reschedulePolling(){if(timer!==null&&started&&alive){cancel(timer);timer=schedule(tick,pollDelay());}}
  async function updateWatches(){
    if(!api.watchLocalFiles)return;
    const state=getState(),enabled=started&&alive&&state.enabled!==false&&state.visible!==false;
    const value={folders:enabled?[...new Set([...(state.roots?.length?state.roots:state.root?[state.root]:[]),...(state.expanded||[]),...(state.watchFolders||[])])]:[],
      files:enabled?getDocuments().map(doc=>doc.path).filter(Boolean).sort():[]};
    const key=JSON.stringify(value);
    if(key===watchKey)return;
    watchKey=key;watched=false;const revision=++watchRevision;
    try{const result=await api.watchLocalFiles(value);if(revision===watchRevision){watched=result.complete&&enabled;if(!result.complete)watchKey='';reschedulePolling();}}
    catch{if(revision===watchRevision){watched=false;watchKey='';reschedulePolling();}}
  }
  async function checkDocument(doc,force,epoch){
    if(!doc.path||!isOpen(doc)||isBusy(doc))return;
    const previous=metadata.get(doc);
    if(!force&&previous?.remote&&previous.path===doc.path&&now()-previous.checkedAt<10000)return;
    const source={path:doc.path,model:doc.model,base:doc.savedText,version:doc.model.getVersionId()};
    const valid=()=>alive&&epoch===generation&&isOpen(doc)&&!isBusy(doc)&&doc.path===source.path&&doc.model===source.model&&doc.savedText===source.base;
    try{
      const stat=await api.statFile(source.path);
      if(!valid())return;
      if(!stat.exists){missing(doc);metadata.delete(doc);return;}
      const old=previous?.path===source.path&&previous.model===source.model&&previous.base===source.base?previous:{mtimeMs:doc.mtimeMs,size:doc.font?.bytes ?? doc.image?.bytes ?? bytes(source.base)};
      const changed=stat.mtimeMs!==old.mtimeMs||stat.size!==old.size;
      if(!force&&!doc.missing&&!changed){metadata.set(doc,{...source,...stat,checkedAt:now()});return;}
      const latest=await api.readFile(source.path,{fresh:true});
      if(!valid()||doc.model.getVersionId()!==source.version||typeof latest.content!=='string')return;
      if(readOnlyDocument(doc)) {
        if (doc.font ? !latest.font : !latest.image) return;
        reload(doc, latest);
        metadata.set(doc,{...source,...stat,checkedAt:now()}); return;
      }
      if(latest.content===source.base){present(doc,latest);}
      else if(doc.dirty||doc.model.getValue()!==source.base){await conflict(doc);}
      else reload(doc,latest);
      if(alive&&epoch===generation&&isOpen(doc)&&doc.path===source.path&&doc.model===source.model&&(valid()||doc.savedText===latest.content))metadata.set(doc,{...source,base:doc.savedText,...stat,checkedAt:now()});
    }catch{/* Permission loss and disconnected servers leave buffers untouched. */}
  }
  function check({force=false,directories=null,manual=false}={}){
    if(running)return force?running.then(()=>check({force:true,directories,manual})):running;
    void updateWatches();
    const state=getState();
    if(!alive||state.enabled===false&&!manual||state.visible===false||state.blocked)return Promise.resolve();
    if(pendingDirectories.size){
      if(!force)directories=[...pendingDirectories];
      else if(directories)directories=[...new Set([...directories,...pendingDirectories])];
      force=true;pendingDirectories.clear();
    }
    const epoch=generation;
    running=(async()=>{
      if(state.root){
        const current=()=>{const latest=getState();return alive&&epoch===generation&&latest.root===state.root&&latest.nodes===state.nodes&&latest.showHidden===state.showHidden;};
        try{
          const result=await refreshExplorerSnapshot(state,api.scanFolder,{isCurrent:current,offset,limit:state.remote?4:12});
          if(result&&current()){offset=result.offset;if(result.nodes!==state.nodes)commitExplorer(result.nodes);}
        }catch{/* Keep the existing Explorer available while access is unavailable. */}
      }
      const docs=getDocuments().filter(doc=>doc.path&&(!directories||directories.some(directory=>{
        const file=doc.path.replace(/\\/g,'/'),folder=directory.replace(/\\/g,'/').replace(/\/$/,'');
        return file.startsWith(folder+'/');
      })));
      for(let at=0;at<docs.length;at+=3){
        if(!alive||epoch!==generation)return;
        await Promise.allSettled(docs.slice(at,at+3).map(doc=>checkDocument(doc,force,epoch)));
      }
    })().finally(()=>{running=null;});
    return running;
  }
  function tick(){
    timer=null;const epoch=generation;
    void check().finally(()=>{if(started&&alive&&epoch===generation)timer=schedule(tick,pollDelay());});
  }
  function changed(event){
    for(const directory of event.directories||[])pendingDirectories.add(directory);
    if(event.failed){watchKey='';watched=false;reschedulePolling();}
    if(eventTimer!==null)clearTimeout(eventTimer);
    const epoch=generation;
    eventTimer=setTimeout(()=>{eventTimer=null;if(alive&&epoch===generation)void check({force:true,directories:[...pendingDirectories]}).catch(()=>{});},120);
  }
  return {check,updateWatches,start(){if(started)return;alive=true;started=true;unsubscribe=api.onLocalFileChange?.(changed);tick();},stop(){
    started=false;alive=false;++generation;if(timer!==null)cancel(timer);timer=null;
    if(eventTimer!==null)clearTimeout(eventTimer);eventTimer=null;unsubscribe?.();unsubscribe=null;void updateWatches();
    pendingDirectories.clear();
  }};
}

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
  function check({force=false}={}){
    if(running)return force?running.then(()=>check({force:true})):running;
    const state=getState();
    if(!alive||state.enabled===false||state.visible===false||state.blocked)return Promise.resolve();
    const epoch=generation;
    running=(async()=>{
      if(state.root){
        const current=()=>{const latest=getState();return alive&&epoch===generation&&latest.root===state.root&&latest.nodes===state.nodes&&latest.showHidden===state.showHidden;};
        try{
          const result=await refreshExplorerSnapshot(state,api.scanFolder,{isCurrent:current,offset,limit:state.remote?4:12});
          if(result&&current()){offset=result.offset;if(result.nodes!==state.nodes)commitExplorer(result.nodes);}
        }catch{/* Keep the existing Explorer available while access is unavailable. */}
      }
      const docs=getDocuments().filter(doc=>doc.path);
      for(let at=0;at<docs.length;at+=3){
        if(!alive||epoch!==generation)return;
        await Promise.allSettled(docs.slice(at,at+3).map(doc=>checkDocument(doc,force,epoch)));
      }
    })().finally(()=>{running=null;});
    return running;
  }
  function tick(){
    timer=null;const epoch=generation;
    void check().finally(()=>{if(started&&alive&&epoch===generation)timer=schedule(tick,getState().remote?10000:2500);});
  }
  return {check,start(){if(started)return;alive=true;started=true;tick();},stop(){started=false;alive=false;++generation;if(timer!==null)cancel(timer);timer=null;}};
}

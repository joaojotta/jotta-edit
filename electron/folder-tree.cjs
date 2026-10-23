'use strict';
const path=require('node:path');
const fs=require('./project-fs.cjs');
const within=(root,file)=>{const relative=path.relative(root,file);return relative===''||(relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative));};
async function listFolderTree(root,{io=fs,showHidden=false,ignoreDirs=new Set(),maxFiles=8000,maxDepth=12,shallow=false}={}){
  if(!(await io.stat(root)).isDirectory())throw new Error('Not a folder');
  const realRoot=await io.realpath(root);let count=0,truncated=false;
  async function descend(dir,depth,ancestors){
    const real=await io.realpath(dir);
    if(!within(realRoot,real))throw new Error('Folder link is outside this workspace. Open its target folder directly.');
    if(ancestors.has(real))throw new Error('Folder link forms a loop.');
    const branch=new Set(ancestors);branch.add(real);
    const entries=await io.readdir(dir,{withFileTypes:true}),items=[];
    for(const entry of entries){
      if(!showHidden&&entry.name.startsWith('.'))continue;
      const file=path.join(dir,entry.name);let stat=entry,problem=entry.error||'';
      if(entry.isSymbolicLink()){
        try{const target=await io.realpath(file);if(!within(realRoot,target))throw new Error('Folder link is outside this workspace. Open its target folder directly.');stat=await io.stat(file);}
        catch(error){problem=error.message;stat={isDirectory:()=>true,isFile:()=>false};}
      }
      if(stat.isDirectory()&&ignoreDirs.has(entry.name))continue;
      if(stat.isDirectory()||stat.isFile())items.push({path:file,name:entry.name,dir:stat.isDirectory(),...(problem?{error:problem}:{})});
    }
    items.sort((a,b)=>Number(b.dir)-Number(a.dir)||a.name.localeCompare(b.name,undefined,{numeric:true}));
    const out=[];
    // Register the whole directory before descending: an earlier large subtree
    // must never hide a later sibling such as public_html.
    for(const item of items){
      if(item.dir){item.children=[];out.push(item);}
      else if(count<maxFiles){count++;out.push(item);}
      else truncated=true;
    }
    for(const item of out){
      if(!item.dir||item.error)continue;
      if(shallow){item.incomplete=true;continue;}
      if(count>=maxFiles||depth>=maxDepth){item.incomplete=true;truncated=true;continue;}
      try{item.children=await descend(item.path,depth+1,branch);}
      catch(error){item.error=error.message;}
    }
    return out;
  }
  return {root,nodes:await descend(root,0,new Set()),count,truncated};
}
module.exports={listFolderTree};

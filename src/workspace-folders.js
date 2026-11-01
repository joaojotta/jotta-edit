export const MAX_WORKSPACE_FOLDERS=20;
const slash=value=>String(value||'').replace(/\\/g,'/');
const normalized=value=>{const path=slash(value);return path==='/'||/^[a-z]:\/$/i.test(path)?path:path.replace(/\/+$/,'');};
export function folderContains(root,file){
  let base=normalized(root),target=normalized(file);
  if(/^[a-z]:|^\/\//i.test(base)){base=base.toLowerCase();target=target.toLowerCase();}
  return Boolean(base)&&(target===base||target.startsWith(base.endsWith('/')?base:base+'/'))&&!target.slice(base.length).split('/').includes('..');
}
export function owningFolder(folders,file){return folders.filter(folder=>folderContains(folder.path,file)).sort((a,b)=>b.path.length-a.path.length)[0]||null;}
export function validateFolderAddition(folders,path){
  if(folders.some(folder=>folderContains(folder.path,path)||folderContains(path,folder.path)))throw new Error('This folder overlaps a folder already in the workspace.');
  if(folders.length>=MAX_WORKSPACE_FOLDERS)throw new Error('A workspace supports up to 20 folders.');
}
export function workspaceTree(folders){
  if(folders.length===1)return folders[0].nodes;
  return folders.map(folder=>({path:folder.path,name:normalized(folder.path).split('/').pop()||folder.path,dir:true,workspaceRoot:true,children:folder.nodes,error:folder.error}));
}
export function captureWorkspaceTree(folders,nodes){
  if(folders.length===1)folders[0].nodes=nodes;
  else for(const folder of folders){const node=nodes.find(node=>node.path===folder.path);if(node)folder.nodes=node.children||[];}
}
export const workspaceIdentity=folders=>JSON.stringify(folders.map(folder=>typeof folder==='string'?folder:folder.path));

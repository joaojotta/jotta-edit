import {safeRepoPath,validateEntries,validLink} from './github-sync.mjs';
const generated=new Set(['.git','node_modules','vendor','.cache','.venv','venv','dist','web-dist','build','release','target','__pycache__']);
export function skipSyncPath(path, tracked=[]) {
  safeRepoPath(path);
  return path.split('/').some(part=>generated.has(part)) && !tracked.some(file=>file===path || file.startsWith(path+'/'));
}
export function cleanSyncState(value) {
  const link=validLink(value);
  const entries=value.entries || [];validateEntries(entries);
  if(value.head && !/^[a-f0-9]{40}$/.test(value.head))throw new Error('Invalid sync baseline.');
  return {...link,head:value.head || null,tree:typeof value.tree==='string'?value.tree:null,
    entries:entries.map(({path,sha,mode})=>{safeRepoPath(path);if(!/^[a-f0-9]{40}$/.test(sha))throw new Error('Invalid file hash.');return {path,sha,mode};})};
}
export function validateApply(files,changes) {
  validateEntries(files,{data:true});
  if(!Array.isArray(changes))throw new Error('Invalid sync changes.');
  for(const change of changes){safeRepoPath(change.path);if(change.data!==null)validateEntries([change],{data:true});}
  const result=new Map(files.map(file=>[file.path,file]));
  for(const change of changes){if(change.data===null)result.delete(change.path);else result.set(change.path,change);}
  validateEntries([...result.values()],{data:true});
  const paths=new Set([...result.keys()].map(path=>path.toLowerCase()));
  for(const path of paths){const parts=path.split('/');parts.pop();while(parts.length){if(paths.has(parts.join('/')))throw new Error('A file conflicts with a folder. Resolve the paths before syncing.');parts.pop();}}
}

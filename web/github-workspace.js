import {getMeta,putMeta,allFiles,atomicGithubFiles} from './storage.js';
import {encodeBytes,blobSha,validateEntries,safeRepoPath} from '../shared/github-sync.mjs';
import {skipSyncPath,cleanSyncState,validateApply} from '../shared/github-workspace.mjs';
export function virtualSyncFiles(records,root,tracked=[]) {
  const modes=new Map(tracked.map(file=>[file.path,file.mode]));
  if(records.some(file=>file.path===root+'/.git'||file.path.startsWith(root+'/.git/')))throw new Error('This is a Git checkout. Choose a separate folder for GitHub sync.');
  return records.filter(file=>file.path.startsWith(root+'/')&&!file.dir).flatMap(file=>{
    const relative=file.path.slice(root.length+1);safeRepoPath(relative);
    if(skipSyncPath(relative,[...modes.keys()]))return [];
    const bytes=file.binary ? new Uint8Array(file.binary) : new TextEncoder().encode(file.content || '');
    return [{path:relative,data:encodeBytes(bytes),mode:file.mode || modes.get(relative) || '100644'}];
  });
}
export function browserGitHubWorkspace(context) {
  async function check(root){const current=await context();if(!root||root!==current.root)throw new Error('Open this workspace before syncing.');if(current.mode==='native')throw new Error('Create a browser workspace with New checkout to sync GitHub repositories.');}
  return {
    async get(root){await check(root);const state=await getMeta('github-sync:'+root);return state?cleanSyncState(state):null;},
    async set(root,state){await check(root);await putMeta('github-sync:'+root,cleanSyncState(state));},
    async snapshot(root,tracked=[]){await check(root);const files=virtualSyncFiles(await allFiles(),root,tracked);validateEntries(files,{data:true});return Promise.all(files.map(async file=>({...file,sha:await blobSha(file.data)})));},
    async apply(root,changes,expected,tracked=[]){
      await check(root);validateApply(expected,changes);
      await atomicGithubFiles(records=>{
        const current=virtualSyncFiles(records,root,tracked);
        const signature=files=>JSON.stringify(files.map(({path,data,mode})=>({path,data,mode})).sort((a,b)=>a.path.localeCompare(b.path)));
        if(signature(current)!==signature(expected))throw new Error('Workspace changed after review. Refresh before syncing.');
        return changes.map(change=>({...change,path:root+'/'+change.path}));
      });
    }
  };
}

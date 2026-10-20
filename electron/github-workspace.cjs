'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const policy=import('../shared/github-sync.mjs');
const workspace=import('../shared/github-workspace.mjs');
class GitHubWorkspace {
  constructor(directory){this.directory=directory;this.queue=Promise.resolve();}
  async root(folder){
    if(typeof folder!=='string'||!path.isAbsolute(folder))throw new Error('Open a workspace folder first.');
    const root=await fs.realpath(folder);
    try{await fs.lstat(path.join(root,'.git'));throw new Error('This is a Git checkout. Choose a separate folder for GitHub sync.');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    return root;
  }
  statePath(root){return path.join(this.directory,crypto.createHash('sha256').update(root).digest('hex')+'.json');}
  async getState(folder){const root=await this.root(folder);try{return (await workspace).cleanSyncState(JSON.parse(await fs.readFile(this.statePath(root),'utf8')));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async setState(folder,value){
    const root=await this.root(folder), clean=(await workspace).cleanSyncState(value), file=this.statePath(root);
    await fs.mkdir(this.directory,{recursive:true,mode:0o700});await fs.writeFile(file+'.tmp',JSON.stringify(clean),{mode:0o600});await fs.rename(file+'.tmp',file);
  }
  async snapshot(folder,tracked=[]){
    const root=await this.root(folder), {encodeBytes,assertSyncLimits,validateEntries,blobSha}=await policy, {skipSyncPath}=await workspace;
    const trackedPaths=tracked.map(file=>typeof file==='string'?file:file.path);
    const files=[];let bytes=0;
    async function walk(directory,prefix=''){
      for(const entry of await fs.readdir(directory,{withFileTypes:true})){
        if(entry.name==='.git')continue;
        const relative=prefix+entry.name;
        if(skipSyncPath(relative,trackedPaths))continue;
        const target=path.join(directory,entry.name), stat=await fs.lstat(target);
        if(stat.isSymbolicLink()||!stat.isDirectory()&&!stat.isFile())throw new Error('Symlinks and special files are not supported by GitHub sync.');
        if(stat.isDirectory())await walk(target,relative+'/');
        else{
          bytes+=stat.size;assertSyncLimits(relative,stat.size,bytes,files.length+1);
          const content=await fs.readFile(target), data=encodeBytes(content);
          files.push({path:relative,data,mode:stat.mode&0o111?'100755':'100644',sha:await blobSha(content)});
        }
      }
    }
    await walk(root);validateEntries(files,{data:true});return files;
  }
  apply(folder,changes,expected,tracked=[]){
    const job=this.queue.catch(()=>{}).then(async()=>{
      const root=await this.root(folder),{decodeBytes,safeRepoPath}=await policy;
      const current=await this.snapshot(folder,tracked);
      (await workspace).validateApply(current,changes);
      const signature=files=>JSON.stringify(files.map(({path,data,mode})=>({path,data,mode})).sort((a,b)=>a.path.localeCompare(b.path)));
      if(signature(current)!==signature(expected))throw new Error('Workspace changed after review. Refresh before syncing.');
      // Stage every file and every backup before modifying workspace contents.
      const stage=await fs.mkdtemp(path.join(root,'.jotta-sync-')), touched=[], directories=[];
      try{
        for(let i=0;i<changes.length;i++){
          const change=changes[i];safeRepoPath(change.path);
          const old=current.find(file=>file.path===change.path);
          if(old)await fs.writeFile(path.join(stage,'old-'+i),decodeBytes(old.data));
          if(change.data!==null)await fs.writeFile(path.join(stage,'new-'+i),decodeBytes(change.data));
          const parts=change.path.split('/');parts.pop();let directory=root;
          for(const part of parts){directory=path.join(directory,part);try{const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Unsafe sync destination.');}catch(error){if(error.code!=='ENOENT')throw error;}}
          try{const stat=await fs.lstat(path.join(root,change.path));if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Unsafe sync destination.');}catch(error){if(error.code!=='ENOENT')throw error;}
        }
        for(let i=0;i<changes.length;i++){
          const change=changes[i], target=path.join(root,change.path);
          if(change.data!==null){
            const parts=change.path.split('/');parts.pop();let directory=root;
            for(const part of parts){directory=path.join(directory,part);try{await fs.mkdir(directory);directories.push(directory);}catch(error){if(error.code!=='EEXIST')throw error;}}
          }
          touched.push(i);
          if(change.data===null)await fs.rm(target,{force:true});
          else {await fs.rename(path.join(stage,'new-'+i),target);if(process.platform!=='win32')await fs.chmod(target,change.mode==='100755'?0o755:0o644);}
        }
      }catch(error){
        for(const i of touched.reverse()){
          const target=path.join(root,changes[i].path), old=current.find(file=>file.path===changes[i].path);
          try{if(old){await fs.copyFile(path.join(stage,'old-'+i),target);if(process.platform!=='win32')await fs.chmod(target,old.mode==='100755'?0o755:0o644);}else await fs.rm(target,{force:true});}
          catch{throw new Error(`Sync rollback failed. Recovery files remain in ${stage}`);}
        }
        for(const directory of directories.reverse())await fs.rmdir(directory).catch(()=>{});
        await fs.rm(stage,{recursive:true,force:true});throw error;
      }
      await fs.rm(stage,{recursive:true,force:true});
    });this.queue=job;return job;
  }
}
module.exports={GitHubWorkspace};

'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash,randomUUID}=require('node:crypto');
const {createRemoteClient,attributes}=require('./remote-clients.cjs');
const {resolveRemotePath}=require('./remote-paths.cjs');
const {RemoteActivity}=require('./remote-activity.cjs');
const locations=import('../shared/remote-location.mjs');
const MAX_BYTES=5*1024*1024;
const within=(root,file)=>file===root||file.startsWith(root+path.sep);
const error=(message,code)=>Object.assign(new Error(message),{code});
function cleanError(cause){
  const code=cause?.code;
  if(code==='ENOENT'||code===2||/STATUS_OBJECT_(NAME|PATH)_NOT_FOUND|STATUS_NO_SUCH_FILE/.test(code))return error('Remote entry does not exist.','ENOENT');
  if(code==='EEXIST'||/STATUS_OBJECT_NAME_COLLISION/.test(code))return error('Destination already exists.','EEXIST');
  if(code===3||code==='EACCES'||/STATUS_ACCESS_DENIED/.test(code))return error('Remote access denied. Check server permissions.','EACCES');
  return error('Remote operation failed. Check the connection, credentials and server permissions. Reconnect if needed.','EREMOTE');
}
class RemoteFolders {
  constructor({base=path.join(os.tmpdir(),'jotta-remote-workspaces'),clientFactory=createRemoteClient,confirmHostKey=async()=>false,timeout=30000,onActivity=()=>{}}={}){
    Object.assign(this,{base,clientFactory,confirmHostKey,timeout});this.connections=new Map();this.roots=new Set();this.trustedKeys={};this.saveChain=Promise.resolve();
    this.activity=new RemoteActivity({changed:onActivity});
    this.reportedFailures=new WeakSet();
  }
  async restoreRoots(file){
    this.rootsFile=file;this.base=path.join(path.dirname(file),'remote-workspaces');this.keysFile=path.join(path.dirname(file),'remote-host-keys.json');
    try{const roots=JSON.parse(await fs.readFile(file,'utf8'));if(Array.isArray(roots))for(const root of roots.slice(-100))if(typeof root==='string'&&path.isAbsolute(root))this.roots.add(root);}catch{}
    try{const keys=JSON.parse(await fs.readFile(this.keysFile,'utf8'));if(keys&&typeof keys==='object'&&!Array.isArray(keys))this.trustedKeys=keys;}catch{}
  }
  async remember(root){
    this.roots.delete(root);this.roots.add(root);while(this.roots.size>100)this.roots.delete(this.roots.values().next().value);
    if(!this.rootsFile)return;
    this.saveChain=this.saveChain.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(this.rootsFile),{recursive:true});await fs.writeFile(this.rootsFile,JSON.stringify([...this.roots]),{mode:0o600});});await this.saveChain;
  }
  owns(file){return typeof file==='string'&&within(this.base,path.resolve(file));}
  isRemote(file){return this.owns(file)||/^\\\\[^\\]+\\/.test(file)||/^\/run\/user\/\d+\/(?:gvfs(?:\/|$)|kio-fuse-[^/]+(?:\/|$))/.test(file)||[...this.roots].some(root=>within(root,file));}
  info(file){if(typeof file!=='string')return null;const entry=[...this.connections.values()].find(c=>within(c.root,file));return entry?{root:entry.root,uri:entry.uri}:null;}
  async ready(root,signal){
    signal?.throwIfAborted();if(!(await fs.stat(root)).isDirectory())throw new Error('Not a folder');await this.remember(root);return {root};
  }
  async connect(value,signal,credentials={}){
    const location=(await locations).remoteLocation(value,credentials);
    signal?.throwIfAborted();
    const id=createHash('sha256').update(location.uri).digest('hex').slice(0,24);
    // Virtual absolute paths keep editor models, tabs and history stable. Server
    // files are never downloaded into this namespace or passed to local fs calls.
    const label=(location.parts.at(-1)||location.hostname).replace(/[<>:"|?*\\/]/g,'_');
    const root=path.join(this.base,id,label);
    const previous=this.connections.get(root);
    this.activity.connection(root,location.uri,'connecting');
    let remotePath='/'+location.parts.slice(location.protocol==='smb'?1:0).join('/');
    let close=null,client,approvedKey;
    const abort=()=>{if(!close)return;const stop=close;close=null;try{Promise.resolve(stop()).catch(()=>{});}catch{}};
    const wait=promise=>new Promise((resolve,reject)=>{
      const cancel=()=>reject(signal.reason||new Error('Connection cancelled.'));
      if(signal?.aborted){Promise.resolve(promise).catch(()=>{});cancel();return;}
      signal?.addEventListener('abort',cancel,{once:true});
      Promise.resolve(promise).then(resolve,reject).finally(()=>signal?.removeEventListener('abort',cancel));
    });
    signal?.addEventListener('abort',abort,{once:true});
    try{
      client=await wait(this.clientFactory(location,credentials,{registerClose:fn=>{close=fn;if(signal?.aborted)abort();},onDisconnect:()=>{
        const entry=this.connections.get(root);if(entry?.client===client){entry.closed=true;this.activity.connection(root,location.uri,'disconnected');}
      },verifyHostKey:async hash=>{
        const server=location.hostname+':'+(location.port||22),fingerprint='SHA256:'+Buffer.from(hash,'hex').toString('base64').replace(/=+$/,'');
        if(this.trustedKeys[server]===fingerprint)return true;
        const accepted=await wait(this.confirmHostKey({server,fingerprint,changed:!!this.trustedKeys[server]},signal));
        if(accepted)approvedKey={server,fingerprint};return accepted;
      }}));
      close=()=>client.close();
      const selectedDirectory=client.directoryPath?await wait(client.directoryPath(remotePath)):null;
      remotePath=selectedDirectory||await wait(resolveRemotePath(client,remotePath));
      const stat=selectedDirectory?attributes({dir:true}):await wait(client.stat(remotePath));if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Not a regular folder');
      await wait(client.list(remotePath));signal?.throwIfAborted();
      if(approvedKey){this.trustedKeys[approvedKey.server]=approvedKey.fingerprint;if(this.keysFile){await fs.mkdir(path.dirname(this.keysFile),{recursive:true});await fs.writeFile(this.keysFile,JSON.stringify(this.trustedKeys),{mode:0o600});}}
      await this.remember(root);signal?.throwIfAborted();
      if(previous)previous.closed=true;
      this.connections.set(root,{root,remotePath,client,uri:location.uri,credentials:{...credentials},rootStat:selectedDirectory?stat:null,queue:Promise.resolve(),closed:false});
      this.activity.connection(root,location.uri,'connected');
      Promise.resolve(previous?.client.close()).catch(()=>{});
      return {root,uri:location.uri};
    }catch(cause){abort();this.activity.connection(root,location.uri,previous&&!previous.closed?'connected':signal?.aborted?'disconnected':'failed');if(signal?.aborted)throw signal.reason||new Error('Connection cancelled.');throw new Error('Could not connect to the remote folder. Check the address, username, password and server identity.');}
    finally{signal?.removeEventListener('abort',abort);}
  }
  async reconnect(root,signal){
    const connection=this.connections.get(root);if(!connection)throw new Error('Reconnect using Open Remote Folder and enter your credentials.');
    return this.connect(connection.uri,signal,connection.credentials);
  }
  recordFailure(file,kind,cause){
    if(cause&&typeof cause==='object'&&this.reportedFailures.has(cause))return;
    const connection=[...this.connections.values()].find(c=>typeof file==='string'&&within(c.root,path.resolve(file)));
    if(!connection)return;
    const id=this.activity.start(connection.root,file,kind);this.activity.finish(id,cause);
    if(cause&&typeof cause==='object')this.reportedFailures.add(cause);
  }
  resolve(file){
    const normalized=path.resolve(file),connection=[...this.connections.values()].find(c=>within(c.root,normalized));
    if(!connection||connection.closed)throw new Error('Remote folder is disconnected. Use Open Remote Folder to reconnect.');
    const relative=path.relative(connection.root,normalized).split(path.sep).join('/');
    if(/[\x00-\x1f\x7f\\]/.test(relative))throw new Error('Unsupported remote path.');
    return {connection,remote:path.posix.join(connection.remotePath,relative)};
  }
  async run(file,operation,kind){
    let connection,remote,id;
    const known=[...this.connections.values()].find(c=>typeof file==='string'&&within(c.root,file));
    if(kind&&known)id=this.activity.start(known.root,file,kind);
    try{({connection,remote}=this.resolve(file));}catch(cause){if(id){this.activity.finish(id,cause);this.reportedFailures.add(cause);}throw cause;}
    const pending=connection.queue.catch(()=>{}).then(async()=>{
      if(connection.closed)throw new Error('Remote folder is disconnected. Use Open Remote Folder to reconnect.');
      let timer;
      const progress=(transferred,total,phase)=>{if(id)this.activity.update(id,{transferred,total:Number.isFinite(total)?total:null,phase},true);};
      if(id)this.activity.update(id,{status:'running',phase:kind==='save'?'Checking server':kind==='read'?'Downloading':'Working'});
      try{return await Promise.race([operation(connection.client,remote,connection,progress),new Promise((_,reject)=>{timer=setTimeout(()=>{connection.closed=true;if(this.connections.get(connection.root)===connection)this.activity.connection(connection.root,connection.uri,'disconnected');Promise.resolve(connection.client.close()).catch(()=>{});reject(new Error('Remote operation timed out. Reconnect and try again.'));},this.timeout);})]);}
      finally{clearTimeout(timer);}
    });
    const result=pending.then(value=>{if(id)this.activity.finish(id);return value;},cause=>{if(id){this.activity.finish(id,cause);if(cause&&typeof cause==='object')this.reportedFailures.add(cause);}throw cause;});
    connection.queue=result;return result;
  }
  async safe(client,remote,connection,options){
    try{return await resolveRemotePath(client,remote,connection.remotePath,options);}
    catch(error){if(/^(Folder link|The server cannot|Unsupported remote|Not a folder)/.test(error.message))throw error;throw cleanError(error);}
  }
  async stat(file){return this.run(file,async(c,p,s)=>{p=await this.safe(c,p,s);try{return p===s.remotePath&&s.rootStat?s.rootStat:await c.stat(p,{follow:true});}catch(e){throw cleanError(e);}});}
  async lstat(file){return this.run(file,async(c,p,s)=>{p=await this.safe(c,p,s,{followLeaf:false});try{return await c.stat(p);}catch(e){throw cleanError(e);}});}
  async realpath(file){return this.run(file,async(c,p,s)=>{const resolved=await this.safe(c,p,s);return path.join(s.root,...path.posix.relative(s.remotePath,resolved).split('/'));});}
  async readdir(file,options){return this.run(file,async(c,p,s)=>{
    p=await this.safe(c,p,s);let entries;try{entries=await c.list(p);}catch(e){throw cleanError(e);}
    const out=[];
    for(const entry of entries){
      if(typeof entry.name!=='string'||entry.name==='.'||entry.name==='..'||/[\\/\x00-\x1f\x7f]/.test(entry.name))continue;
      if(!entry.isSymbolicLink()){out.push(entry);continue;}
      try{
        const target=await this.safe(c,path.posix.join(p,entry.name),s),stat=await c.stat(target,{follow:true});
        out.push({name:entry.name,size:stat.size,mode:stat.mode,mtimeMs:stat.mtimeMs,link:true,isDirectory:()=>stat.isDirectory(),isFile:()=>stat.isFile(),isSymbolicLink:()=>false});
      }catch(error){out.push({name:entry.name,link:true,error:error.message,isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false});}
    }
    return options?.withFileTypes?out:out.map(x=>x.name);
  },'list');}
  async readFile(file,options){return this.run(file,async(c,p,s,progress)=>{p=await this.safe(c,p,s);let bytes;try{const stat=await c.stat(p);if(!stat.isFile())throw new Error('Not a regular file');if(stat.size>MAX_BYTES)throw new Error('File exceeds the 5 MB editor limit');progress(0,stat.size,'Downloading');bytes=await c.read(p,value=>progress(value,stat.size,'Downloading'));progress(bytes.length,bytes.length,'Downloading');}catch(e){if(/^(File exceeds|Not a regular)/.test(e.message))throw e;throw cleanError(e);}
    if(bytes.length>MAX_BYTES)throw new Error('File exceeds the 5 MB editor limit');const encoding=typeof options==='string'?options:options?.encoding;return encoding?bytes.toString(encoding):bytes;},'read');}
  async mkdir(file){return this.run(file,async(c,p,s)=>{p=await this.safe(c,p,s,{missingLeaf:true});try{return await c.mkdir(p);}catch(e){throw cleanError(e);}},'create');}
  async open(file,flags){
    if(flags!=='wx')throw new Error('Unsupported remote open operation.');
    await this.run(file,async(c,p,s)=>{p=await this.safe(c,p,s,{missingLeaf:true});try{await c.stat(p);}catch(e){if(cleanError(e).code==='ENOENT'){try{await c.write(p,Buffer.alloc(0),0o644);}catch(cause){throw cleanError(cause);}return;}throw cleanError(e);}throw error('Destination already exists.','EEXIST');},'create');
    return {close:async()=>{}};
  }
  async rename(from,to){
    const target=this.resolve(to);return this.run(from,async(c,p,s)=>{if(target.connection!==s)throw new Error('Cannot move between remote connections.');p=await this.safe(c,p,s);const destination=await this.safe(c,target.remote,s,{missingLeaf:true});try{return await c.rename(p,destination,false);}catch(e){throw cleanError(e);}},'move');
  }
  async save(file,content,{expectedText}={}){
    if(typeof content!=='string'||Buffer.byteLength(content)>MAX_BYTES)throw new Error('File exceeds the 5 MB editor limit');
    return this.run(file,async(c,p,s,progress)=>{
      p=await this.safe(c,p,s,{missingLeaf:true});
      const unchanged=async()=>{if(typeof expectedText!=='string')return;let bytes;try{bytes=await c.read(p);}catch{throw new Error('Cannot verify the remote file. Your buffer is still unsaved. Reconnect before saving.');}if(bytes.toString('utf8')!==expectedText)throw new Error('File changed on the server. Compare or reload it before saving.');};
      await unchanged();let mode=0o644;
      let stat;try{stat=await c.stat(p);}catch(e){const mapped=cleanError(e);if(mapped.code!=='ENOENT')throw mapped;}
      if(stat){if(!stat.isFile())throw new Error('Remote saving requires a regular file.');mode=stat.mode&0o777;}
      const temporary=path.posix.join(path.posix.dirname(p),'.jotta-save-'+randomUUID());
      const bytes=Buffer.from(content);progress(0,bytes.length,'Uploading');
      try{try{await c.write(temporary,bytes,mode,value=>progress(value,bytes.length,'Uploading'));progress(bytes.length,bytes.length,'Checking server');}catch(e){throw cleanError(e);}await unchanged();try{await c.rename(temporary,p,true);}catch(e){throw cleanError(e);}
        progress(0,bytes.length,'Verifying');
        let verified;try{verified=await c.read(p,value=>progress(value,bytes.length,'Verifying'));progress(verified.length,bytes.length,'Verifying');}catch(e){throw cleanError(e);}
        if(verified.toString('utf8')!==content)throw new Error('The remote write could not be verified. Your buffer is still unsaved. Check the server file before retrying.');
      }finally{await c.remove(temporary).catch(()=>{});}
    },'save');
  }
  async trash(file){return this.run(file,async(c,p,s)=>{p=await this.safe(c,p,s);if(p===s.remotePath)throw new Error('Cannot delete the workspace root.');const dir=path.posix.join(s.remotePath,'.jotta-trash');
    let stat;try{stat=await c.stat(dir);}catch(e){const mapped=cleanError(e);if(mapped.code!=='ENOENT')throw mapped;try{await c.mkdir(dir);}catch(cause){throw cleanError(cause);}}
    if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw new Error('Remote trash is not a folder.');
    try{await c.rename(p,path.posix.join(dir,randomUUID()+'-'+path.posix.basename(p)),false);}catch(e){throw cleanError(e);}
  },'delete');}
  async close(){await Promise.allSettled([...this.connections.values()].map(c=>{c.closed=true;this.activity.connection(c.root,c.uri,'disconnected');return c.client.close();}));}
}
module.exports={RemoteFolders};

'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const locations=import('../shared/remote-location.mjs');
const publicEntry=entry=>({id:entry.id,kind:entry.kind,location:entry.location,name:entry.name,hasCredentials:!!entry.secret});
const storageError=()=>new Error('Could not save favourites. Check access to the application data folder.');
class Favourites {
  constructor(file,{safeStorage,platform=process.platform}={}){
    Object.assign(this,{file,safeStorage,platform});this.queue=Promise.resolve();
  }
  credentialsAvailable(){
    try{return !!this.safeStorage?.isEncryptionAvailable()&&(this.platform!=='linux'||!['basic_text','unknown'].includes(this.safeStorage.getSelectedStorageBackend()));}catch{return false;}
  }
  async read(){
    let value;
    try{value=JSON.parse(await fs.readFile(this.file,'utf8'));}
    catch(error){if(error.code==='ENOENT')return [];throw new Error('Could not read favourites. Check the application data folder.');}
    if(!Array.isArray(value))throw new Error('Could not read favourites. Check the application data folder.');
    return value.filter(x=>x&&typeof x.id==='string'&&['local','remote'].includes(x.kind)&&typeof x.location==='string'&&typeof x.name==='string').slice(0,200);
  }
  async list(){await this.queue.catch(()=>{});return {entries:(await this.read()).map(publicEntry),credentialsAvailable:this.credentialsAvailable()};}
  mutate(change){
    const pending=this.queue.catch(()=>{}).then(async()=>{
      const entries=await this.read(),result=await change(entries);
      const temporary=this.file+'.'+randomUUID()+'.tmp';
      try{
        await fs.mkdir(path.dirname(this.file),{recursive:true});
        await fs.writeFile(temporary,JSON.stringify(entries),{mode:0o600});
        await fs.rename(temporary,this.file);
      }catch{throw storageError();}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
      return result;
    });this.queue=pending;return pending;
  }
  async save(value,credentials){
    if(!value||!['local','remote'].includes(value.kind)||typeof value.location!=='string')throw new Error('Invalid favourite.');
    const kind=value.kind;
    let location=value.location,username='';
    if(kind==='remote'){
      location=(await locations).remoteLocation(location,credentials||{}).uri;
      username=decodeURIComponent(new URL(location).username);
    }else{
      if(!path.isAbsolute(location)||location.length>8192||/[\x00-\x1f\x7f]/.test(location)||credentials)throw new Error('Invalid favourite.');
      location=path.resolve(location);
    }
    const name=typeof value.name==='string'&&value.name.trim()?value.name.trim().slice(0,200):kind==='remote'?new URL(location).hostname:path.basename(location)||location;
    let secret;
    if(value.saveCredentials===true){
      if(kind!=='remote'||!this.credentialsAvailable())throw new Error('Secure credential storage is unavailable. Connect without saving credentials.');
      try{secret=this.safeStorage.encryptString(JSON.stringify({username,password:credentials?.password||''})).toString('base64');}
      catch{throw new Error('Could not save credentials. Unlock your system credential store and try again.');}
    }
    return this.mutate(entries=>{
      let entry=entries.find(x=>x.kind===kind&&x.location===location);
      if(!entry){if(entries.length>=200)throw new Error('Favourites limit reached. Remove an unused favourite first.');entry={id:randomUUID(),kind,location,name};entries.push(entry);}
      entry.name=name;if(secret!==undefined)entry.secret=secret;
      return publicEntry(entry);
    });
  }
  async get(id){await this.queue.catch(()=>{});const entry=(await this.read()).find(x=>x.id===id&&x.kind==='remote');if(!entry)throw new Error('Favourite no longer exists.');return entry;}
  async connection(id){
    const entry=await this.get(id);
    if(!entry.secret)return {location:entry.location,credentials:{}};
    if(!this.credentialsAvailable())throw new Error('Saved credentials are unavailable. Unlock your system credential store or delete the saved credentials.');
    try{
      const credentials=JSON.parse(this.safeStorage.decryptString(Buffer.from(entry.secret,'base64')));
      // Validate decrypted credentials and bind them to this exact saved address.
      if((await locations).remoteLocation(entry.location,credentials).uri!==entry.location)throw new Error();
      return {location:entry.location,credentials};
    }catch{throw new Error('Saved credentials could not be read. Delete them and enter your credentials again.');}
  }
  async connect(remote,location,credentials={},options={},signal){
    if(options.favouriteId){
      // A manually supplied password can bypass an unavailable saved key.
      const entry=await this.get(options.favouriteId);
      if(entry.location!==location)throw new Error('Favourite address changed. Select the favourite again.');
      if(!credentials.password){
        const saved=await this.connection(options.favouriteId);
        credentials={...saved.credentials,...credentials,password:saved.credentials.password||''};
      }
    }
    const result=await remote.connect(location,signal,credentials);
    if(options.saveFavourite===true){
      try{await this.save({kind:'remote',location:result.uri,saveCredentials:options.saveCredentials===true},credentials);}
      catch(error){return {...result,warning:error.message};}
    }
    return result;
  }
  deleteCredentials(id){return this.mutate(entries=>{const entry=entries.find(x=>x.id===id);if(entry)delete entry.secret;});}
  remove(id){return this.mutate(entries=>{const index=entries.findIndex(x=>x.id===id);if(index>=0)entries.splice(index,1);});}
}
module.exports={Favourites};

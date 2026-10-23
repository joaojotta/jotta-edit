'use strict';
const {Readable, Writable}=require('node:stream');
const path=require('node:path').posix;
const MAX_BYTES=5*1024*1024;

function missing(){return Object.assign(new Error('Remote entry does not exist.'),{code:'ENOENT'});}
function attributes({name='',dir=false,link=false,file=!dir&&!link,size=0,mtimeMs=0,mode=dir?0o755:0o644,linkTarget}={}){
  return {name,size,mtimeMs,mode,linkTarget,isDirectory:()=>dir,isFile:()=>file&&!link,isSymbolicLink:()=>link};
}
function boundedSink(){
  const chunks=[];let size=0;
  const stream=new Writable({write(chunk,_encoding,done){size+=chunk.length;if(size>MAX_BYTES)return done(new Error('File exceeds the 5 MB editor limit'));chunks.push(chunk);done();}});
  return {stream,bytes:()=>Buffer.concat(chunks)};
}

// These clients speak to the server from Electron. No processes, mount drivers,
// desktop services, native dialogs or shell credential handoffs are involved.
async function createRemoteClient(location,credentials,{verifyHostKey,registerClose=()=>{}}={}){
  const url=new URL(location.uri),username=decodeURIComponent(url.username);
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(location.protocol==='ftp'){
    const {Client}=require('basic-ftp'),client=new Client(30000);
    registerClose(()=>client.close());
    await client.access({host,port:Number(url.port)||21,user:username||'anonymous',password:credentials.password||''});
    const inDirectory=async(dir,operation)=>{
      const previous=await client.pwd();
      if(dir===previous)return operation();
      await client.cd(dir);
      try{return await operation();}finally{await client.cd(previous);}
    };
    // Enter the directory first: some FTP servers ignore MLSD/LIST path
    // arguments or return the link itself instead of the directory contents.
    const list=async dir=>inDirectory(dir,async()=>{
      let entries=await client.list();
      if(client.availableListCommands.includes('MLSD')&&entries.some(x=>(x.isSymbolicLink&&!x.link)||(!x.isSymbolicLink&&!x.isDirectory&&!x.isFile))){
        const commands=client.availableListCommands;let usedLegacy=false;
        try{
          client.availableListCommands=['LIST -a','LIST'];
          const legacy=new Map((await client.list()).map(x=>[x.name,x]));usedLegacy=true;
          entries=entries.map(x=>((x.isSymbolicLink&&!x.link)||(!x.isSymbolicLink&&!x.isDirectory&&!x.isFile))?(legacy.get(x.name)||x):x);
        }catch{/* Keep the original entries when the server only supports MLSD. */}
        finally{if(!usedLegacy)client.availableListCommands=commands;}
      }
      return entries.map(x=>attributes({name:x.name,dir:x.isDirectory,link:x.isSymbolicLink,file:x.isFile,size:x.size,mtimeMs:x.modifiedAt?.getTime()||0,linkTarget:x.link}));
    });
    const directoryPath=async file=>inDirectory(file,()=>client.pwd());
    const stat=async(file,{follow=false}={})=>{
      if(file==='/')return attributes({dir:true});
      const item=(await list(path.dirname(file))).find(x=>x.name===path.basename(file));if(!item)throw missing();
      if(follow&&item.isSymbolicLink()){
        await directoryPath(file);
        return attributes({...item,dir:true,link:false,file:false});
      }
      return item;
    };
    return {
      list,
      directoryPath,
      async directoryLinkPath(file,target){
        // LIST can expose an absolute host path outside the FTP namespace.
        // Prefer usable link metadata; otherwise let CWD/PWD verify the alias.
        if(target){
          if(!path.isAbsolute(target))return null;
          try{await stat(target);return null;}catch(error){if(error.code!=='ENOENT'&&error.code!==550)throw error;}
        }
        return directoryPath(file);
      },
      async readlink(file){const entry=(await list(path.dirname(file))).find(x=>x.name===path.basename(file));if(!entry)throw missing();return entry.linkTarget;},
      stat,
      async read(file){const sink=boundedSink();await client.downloadTo(sink.stream,file);return sink.bytes();},
      write:(file,bytes)=>client.uploadFrom(Readable.from([bytes]),file),
      mkdir:async file=>{await client.send('MKD '+file);},
      rename:(from,to)=>client.rename(from,to),
      remove:file=>client.remove(file),
      close:()=>client.close()
    };
  }
  if(location.protocol==='sftp'){
    if(!username)throw new Error('Enter a username for this server.');
    const Client=require('ssh2-sftp-client'),client=new Client('Jotta Edit', {error:()=>{},end:()=>{},close:()=>{}});
    registerClose(()=>client.client.destroy());
    await client.connect({host,port:Number(url.port)||22,username,password:credentials.password||undefined,
      readyTimeout:30000,keepaliveInterval:10000,keepaliveCountMax:2,
      hostHash:'sha256',hostVerifier:(hash,callback)=>{Promise.resolve(verifyHostKey?.(hash)).then(value=>callback(value===true),()=>callback(false));}});
    const stat=async file=>{const s=await client.lstat(file);return attributes({dir:s.isDirectory,link:s.isSymbolicLink,file:s.isFile,size:s.size,mtimeMs:s.modifyTime,mode:s.mode});};
    return {
      stat,
      readlink:file=>new Promise((resolve,reject)=>client.sftp.readlink(file,(error,target)=>error?reject(error):resolve(target))),
      list:async dir=>(await client.list(dir)).map(x=>attributes({name:x.name,dir:x.type==='d',link:x.type==='l',file:x.type==='-',size:x.size,mtimeMs:x.modifyTime})),
      async read(file){const sink=boundedSink();await client.get(file,sink.stream);return sink.bytes();},
      write:(file,bytes,mode)=>client.put(bytes,file,{writeStreamOptions:{flags:'wx',mode}}),
      mkdir:file=>client.mkdir(file),
      rename:(from,to,replace)=>replace?client.posixRename(from,to):client.rename(from,to),
      remove:file=>client.delete(file),
      close:()=>client.end()
    };
  }
  const {SmbClient}=await import('./smb-client.mjs');
  const split=username.indexOf('\\'),domain=split<0?'':username.slice(0,split),user=split<0?username:username.slice(split+1);
  const client=new SmbClient({host,domain,username:user||'guest',password:credentials.password||'',port:Number(url.port)||445,connectTimeout:30000,requestTimeout:30000,signing:'required'});
  let closed=false;
  const close=()=>{closed=true;client.destroy();};
  registerClose(close);
  await client.connect();if(closed){client.destroy();throw new Error('Connection cancelled.');}
  const file=value=>location.parts[0]+(value==='/'?'':value);
  const stats=s=>attributes({dir:s.isDirectory,link:!!(s.attributes&0x400),size:s.size,mtimeMs:s.mtime.getTime()});
  return {
    stat:async value=>stats(await client.stat(file(value))),
    list:async value=>(await client.readdir(file(value),{withFileTypes:true})).map(x=>attributes({name:x.name,dir:x.isDirectory()})),
    async read(value){const sink=boundedSink();await require('node:stream/promises').pipeline(client.createReadStream(file(value)),sink.stream);return sink.bytes();},
    write:(value,bytes)=>client.writeExclusive(file(value),bytes),
    mkdir:value=>client.mkdir(file(value)),
    rename:(from,to,replace)=>client.renameReplace(file(from),file(to),replace),
    remove:value=>client.rm(file(value)),
    close
  };
}
module.exports={createRemoteClient,attributes};

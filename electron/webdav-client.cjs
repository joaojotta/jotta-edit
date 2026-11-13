'use strict';
const path=require('node:path').posix;
const {attributes}=require('./remote-clients.cjs');
const MAX_FILE_BYTES=20*1024*1024,MAX_XML_BYTES=8*1024*1024;
let library;

async function bytesFrom(response,limit,progress=()=>{}){
  const chunks=[];let size=0;
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('WebDAV response exceeds the file limit.');}
  if(response.body)for await(const chunk of response.body){
    size+=chunk.length;if(size>limit)throw new Error('WebDAV response exceeds the file limit.');
    chunks.push(Buffer.from(chunk));progress(size);
  }
  return Buffer.concat(chunks);
}

function loadLibrary(){
  return library ||= import('webdav').then(dav=>{
    // Use Node's HTTP transport with normal TLS verification. Do not let an
    // authenticated request follow a redirect to another server or folder.
    dav.getPatcher().patch('fetch',async(address,options)=>{
      let response=await fetch(address,{...options,redirect:'manual'});
      if(response.status>=300&&response.status<400){
        const from=new URL(address),to=new URL(response.headers.get('location')||'',from);
        const collectionSlash=options.method==='PROPFIND'&&to.origin===from.origin&&
          to.pathname===from.pathname+'/'&&!to.search&&!to.hash&&!to.username&&!to.password;
        await response.body?.cancel();
        if(!collectionSlash)throw new Error('Use the final WebDAV server address without redirects.');
        response=await fetch(to,{...options,redirect:'error'});
      }
      response.text=async()=>{
        const text=(await bytesFrom(response,MAX_XML_BYTES)).toString('utf8');
        if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Unsupported WebDAV XML response.');
        return text;
      };
      return response;
    });
    return dav;
  });
}

async function createWebDavClient(location,credentials,{registerClose=()=>{}}={}){
  const lifetime=new AbortController();
  const close=()=>lifetime.abort(new Error('Connection closed.'));
  registerClose(close);
  const {createClient,AuthType}=await loadLibrary();
  lifetime.signal.throwIfAborted();
  const address=new URL(location.uri),username=decodeURIComponent(address.username);
  const client=createClient(address.origin,{
    username,password:credentials.password||'',authType:username?AuthType.Auto:AuthType.None
  });
  const options=()=>({signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(30000)])});
  const run=async operation=>{
    lifetime.signal.throwIfAborted();
    try{return await operation(options());}catch(cause){
      const code=cause.status===404?'ENOENT':cause.status===412?'EEXIST':
        [401,403,423].includes(cause.status)?'EACCES':'EREMOTE';
      // Transport errors may contain response URLs or authentication details.
      throw Object.assign(new Error('WebDAV operation failed.'),{code});
    }
  };
  const stats=entry=>attributes({name:entry.basename,dir:entry.type==='directory',
    size:Number.isFinite(entry.size)?entry.size:0,mtimeMs:Date.parse(entry.lastmod)||0});
  const stat=file=>run(async opts=>stats(await client.stat(file,opts)));
  return {
    stat,
    async directoryPath(file){if(!(await stat(file)).isDirectory())throw new Error('Not a folder');return file;},
    list:dir=>run(async opts=>(await client.getDirectoryContents(dir,opts))
      .filter(entry=>path.dirname(entry.filename)===path.normalize(dir)&&
        entry.basename!=='.'&&entry.basename!=='..'&&!/[\\/\x00-\x1f\x7f]/.test(entry.basename))
      .map(stats)),
    read:(file,progress)=>run(async opts=>bytesFrom(await client.customRequest(file,{...opts,method:'GET'}),MAX_FILE_BYTES,progress)),
    write:(file,bytes,_mode,progress=()=>{})=>run(async opts=>{
      const created=await client.putFileContents(file,bytes,{...opts,overwrite:false});
      if(!created)throw Object.assign(new Error('Destination already exists.'),{status:412});
      progress(bytes.length);
    }),
    mkdir:file=>run(opts=>client.createDirectory(file,opts)),
    rename:(from,to,replace)=>run(opts=>client.moveFile(from,to,{...opts,overwrite:!!replace})),
    remove:file=>run(opts=>client.deleteFile(file,opts)),
    close
  };
}
module.exports={createWebDavClient};

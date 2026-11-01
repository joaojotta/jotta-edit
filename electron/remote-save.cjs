'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
async function writeRemoteText(file,content,{expectedText,io=fs}={}) {
  async function unchanged(){
    if(typeof expectedText!=='string')return;
    let current;try{current=await io.readFile(file,'utf8');}catch{throw new Error('Cannot verify the remote file. Your buffer is still unsaved. Reconnect before saving.');}
    if(current!==expectedText)throw new Error('File changed on the server. Compare or reload it before saving.');
  }
  await unchanged();
  let mode=0o644;
  try{const stat=await io.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Remote saving requires a regular file.');mode=stat.mode&0o777;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=path.join(path.dirname(file),'.jotta-save-'+randomUUID());
  try{
    const handle=await io.open(temporary,'wx',mode);
    // Explicit truncation initializes the cache on KIO FUSE's FTP backend.
    // O_EXCL creation alone can otherwise try to download the empty stage first.
    try{await handle.truncate(0);await handle.writeFile(content,'utf8');await handle.sync();}finally{await handle.close();}
    await unchanged();
    await io.rename(temporary,file);
    if(await io.readFile(file,'utf8')!==content)throw new Error('The remote write could not be verified. Your buffer is still unsaved. Check the server file before retrying.');
  }finally{await io.rm(temporary,{force:true}).catch(()=>{});}
}
module.exports={writeRemoteText};

'use strict';
const fs=require('./project-fs.cjs');
async function fileMetadata(file,{io=fs}={}){
  try{
    const stat=await io.stat(file);
    if(!stat.isFile())return {exists:false};
    return {exists:true,mtimeMs:stat.mtimeMs||0,size:stat.size};
  }catch(error){
    if(['ENOENT','ENOTDIR'].includes(error.code))return {exists:false};
    throw error;
  }
}
module.exports={fileMetadata};

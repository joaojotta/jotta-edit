'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
class FolderBrowser {
  constructor(home,{io=fs,timeout=10000}={}){Object.assign(this,{home,io,timeout});}
  location(value){
    if(value==null||value==='')return this.home;
    if(typeof value!=='string'||value.length>8192||value.includes('\0'))throw new Error('Enter an absolute folder path.');
    if(value==='~')return this.home;if(value.startsWith('~/'))return path.join(this.home,value.slice(2));
    if(!path.isAbsolute(value))throw new Error('Enter an absolute folder path.');return path.normalize(value);
  }
  async bounded(operation){let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Folder access timed out. Choose another location.')),this.timeout);})]);}finally{clearTimeout(timer);}}
  async select(value){const target=this.location(value);const stat=await this.bounded(this.io.stat(target));if(!stat.isDirectory())throw new Error('Not a folder');return target;}
  async selectFile(value){const target=this.location(value);const stat=await this.bounded(this.io.stat(target));if(!stat.isFile())throw new Error('Not a file');return target;}
  async list(value,{showHidden=false}={}){
    const target=this.location(value),entries=await this.bounded(this.io.readdir(target,{withFileTypes:true}));
    const visible=x=>showHidden||!x.name.startsWith('.');
    const folders=entries.filter(x=>x.isDirectory()&&visible(x)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    const files=entries.filter(x=>x.isFile()&&visible(x)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    return {
      path:target,parent:path.dirname(target),home:this.home,
      folders:folders.slice(0,2000).map(x=>({name:x.name,path:path.join(target,x.name)})),
      files:files.slice(0,2000).map(x=>({name:x.name,path:path.join(target,x.name)})),
      truncated:folders.length>2000||files.length>2000
    };
  }
}
module.exports={FolderBrowser};

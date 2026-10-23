'use strict';
const local=require('node:fs/promises');
let remote;
const methods=new Set(['stat','lstat','realpath','readdir','readFile','mkdir','open','rename']);
module.exports=new Proxy(local,{get(target,name){
  if(name==='setRemote')return value=>{remote=value;};
  if(methods.has(name))return (file,...args)=>remote?.owns(file)?remote[name](file,...args):target[name](file,...args);
  return target[name];
}});

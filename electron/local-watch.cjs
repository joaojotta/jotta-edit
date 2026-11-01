'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Watch only visible directories and parents of open files. This also catches
// atomic-save renames without recursively watching a whole dependency tree.
class LocalWatchService {
  constructor({watch=fs.watch,isRemote=()=>false,changed=()=>{},delay=180,maxDirectories=256}={}) {
    Object.assign(this,{watch,isRemote,changed,delay,maxDirectories});
    this.watchers=new Map();this.pending=new Set();this.timer=null;
  }
  configure({folders=[],files=[]}={}) {
    if(!Array.isArray(folders)||!Array.isArray(files)||folders.length+files.length>10000)throw new Error('Invalid file watches');
    const directories=new Set();
    for(const [values,parent] of [[files,true],[folders,false]])for(const value of values){
      if(typeof value!=='string'||!path.isAbsolute(value)||value.includes('\0'))continue;
      if(!this.isRemote(value))directories.add(parent?path.dirname(value):path.normalize(value));
    }
    const selected=new Set([...directories].slice(0,this.maxDirectories));
    for(const [directory,watcher] of this.watchers)if(!selected.has(directory)){watcher.close();this.watchers.delete(directory);}
    if(!selected.size){clearTimeout(this.timer);this.timer=null;this.pending.clear();this.failed=false;}
    let complete=directories.size<=this.maxDirectories;
    for(const directory of selected){
      if(this.watchers.has(directory))continue;
      try{
        const watcher=this.watch(directory,{persistent:false},()=>this.queue(directory));
        this.watchers.set(directory,watcher);
        watcher.on('error',()=>{
          if(this.watchers.get(directory)!==watcher)return;
          watcher.close();this.watchers.delete(directory);this.queue(directory,true);
        });
      }catch{complete=false;}
    }
    return {complete:complete&&this.watchers.size===selected.size,count:this.watchers.size};
  }
  queue(directory,failed=false){
    this.pending.add(directory);this.failed ||= failed;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>{
      this.timer=null;const directories=[...this.pending];this.pending.clear();
      const failed=Boolean(this.failed);this.failed=false;this.changed({directories,failed});
    },this.delay);
  }
  close(){
    clearTimeout(this.timer);this.timer=null;this.pending.clear();this.failed=false;
    for(const watcher of this.watchers.values())watcher.close();this.watchers.clear();
  }
}
module.exports={LocalWatchService};

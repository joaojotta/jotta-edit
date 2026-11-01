'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {LocalWatchService}=require('../electron/local-watch.cjs');

test('local watches are bounded, reused and skip remote paths',()=>{
  const opened=[],closed=[];
  const service=new LocalWatchService({maxDirectories:2,isRemote:file=>file.startsWith('/remote'),watch:(directory,options,notify)=>{
    const watcher=new EventEmitter();watcher.close=()=>closed.push(directory);opened.push({directory,options,notify,watcher});return watcher;
  }});
  assert.deepEqual(service.configure({folders:['/project','/project/src','/remote/server'],files:['/project/a.txt']}),{complete:true,count:2});
  assert.equal(service.configure({folders:['/project','/project/src']}).complete,true);assert.equal(opened.length,2);
  assert.equal(service.configure({folders:['/project','/project/src','/third']}).complete,false);
  service.close();assert.equal(closed.length,2);assert.equal(service.watchers.size,0);
});

test('watch errors and unavailable directories allow fallback and retry; close cancels events',async()=>{
  let fail=true;const events=[],handles=[];
  const service=new LocalWatchService({delay:5,changed:event=>events.push(event),watch:(_directory,_options,notify)=>{
    if(fail)throw new Error('Unsupported filesystem');const handle=new EventEmitter();handle.close=()=>{};handles.push({handle,notify});return handle;
  }});
  assert.equal(service.configure({folders:['/project']}).complete,false);
  fail=false;assert.equal(service.configure({folders:['/project']}).complete,true);
  handles[0].notify();handles[0].handle.emit('error',new Error('Watch failed'));
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(events.length,1);assert.equal(events[0].failed,true);
  assert.equal(service.watchers.size,0);assert.equal(service.configure({folders:['/project']}).complete,true);
  handles[1].notify();service.close();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(events.length,1);
});

test('real directory watches catch atomic replacement and file creation',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-watch-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  let resolveEvent;const events=[];
  const service=new LocalWatchService({delay:20,changed:event=>{events.push(event);resolveEvent?.();}});t.after(()=>service.close());
  const file=path.join(directory,'a.txt');await fs.writeFile(file,'before');
  assert.equal(service.configure({files:[file]}).complete,true);
  const pending=new Promise((resolve,reject)=>{resolveEvent=resolve;const timer=setTimeout(()=>reject(new Error('No watch event')),2000);t.after(()=>clearTimeout(timer));});
  await fs.writeFile(file+'.tmp','after');await fs.rename(file+'.tmp',file);await fs.writeFile(path.join(directory,'new.txt'),'new');
  await pending;assert.deepEqual(events[0].directories,[directory]);assert.equal(await fs.readFile(file,'utf8'),'after');
});

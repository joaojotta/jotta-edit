'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const refresh=import('../src/automatic-refresh.js');
const file=name=>({name,path:'/project/'+name,dir:false});
test('Explorer refresh merges created, renamed and deleted entries without losing cached subfolders',async()=>{
  const {mergeFolderListing,refreshExplorerSnapshot}=await refresh;
  const folder={name:'src',path:'/project/src',dir:true,children:[{name:'old.css',path:'/project/src/old.css',dir:false}]};
  const original=[folder,file('old.txt')];assert.equal(mergeFolderListing(original,[{...folder,children:[]},file('old.txt')]),original);
  const calls=[];const updated=await refreshExplorerSnapshot({root:'/project',nodes:original,expanded:['/project/src'],showHidden:false},async path=>{calls.push(path);return {nodes:path==='/project'?[{...folder,children:[]},file('new.txt')]:[{name:'new.css',path:path+'/new.css',dir:false}]};});
  assert.deepEqual(calls,['/project','/project/src']);assert.equal(updated.nodes[0].children[0].name,'new.css');assert.equal(updated.nodes[1].name,'new.txt');
  assert.equal(original[0].children[0].name,'old.css','background merging must not mutate the old snapshot');
  assert.equal(await refreshExplorerSnapshot({root:'/project',nodes:original,expanded:[]},async()=>({nodes:[]}),{isCurrent:()=>false}),null);
});
async function fixture({dirty=false}={}){
  const {createAutomaticRefresh}=await refresh;
  let text=dirty?'my changes':'original',version=1,latest='external',stamp=2,exists=true,busy=false,reads=0,conflicts=0;
  const doc={path:'/a',model:{getValue:()=>text,getVersionId:()=>version},savedText:'original',mtimeMs:1,dirty};
  const state={root:null,nodes:[],expanded:[],visible:true,enabled:true};const docs=[doc];
  const api={statFile:async()=>({exists,mtimeMs:stamp,size:new TextEncoder().encode(latest).length}),readFile:async()=>{reads++;return {content:latest,mtimeMs:stamp};}};
  const controller=createAutomaticRefresh({api,getState:()=>state,getDocuments:()=>docs,isOpen:value=>docs.includes(value),isBusy:()=>busy,
    reload:(value,next)=>{text=next.content;version++;value.savedText=text;value.mtimeMs=next.mtimeMs;value.dirty=false;value.missing=false;},
    missing:value=>{value.missing=true;value.dirty=true;},present:value=>{if(value.missing){value.missing=false;value.dirty=text!==value.savedText;}},conflict:async()=>{conflicts++;}});
  return {doc,state,docs,api,controller,setLatest(value,time=stamp+1){latest=value;stamp=time;},edit(value){text=value;version++;doc.dirty=text!==doc.savedText;},setExists:value=>{exists=value;},setBusy:value=>{busy=value;},get text(){return text;},get reads(){return reads;},get conflicts(){return conflicts;}};
}
test('clean files reload while dirty buffers retain their baseline and enter conflict review',async()=>{
  const clean=await fixture();await clean.controller.check();assert.equal(clean.text,'external');assert.equal(clean.doc.savedText,'external');assert.equal(clean.doc.dirty,false);
  const dirty=await fixture({dirty:true});await dirty.controller.check();assert.equal(dirty.text,'my changes');assert.equal(dirty.doc.savedText,'original');assert.equal(dirty.conflicts,1);
  await dirty.controller.check();assert.equal(dirty.reads,1,'unchanged metadata must not repeatedly download the same file');
});
test('image refresh updates encoded images even though the text baseline stays empty',async()=>{
  const {createAutomaticRefresh}=await refresh;
  const doc={path:'/photo.png',image:{type:'image/png',bytes:10,url:'old'},savedText:'',mtimeMs:1,
    model:{getValue:()=>'',getVersionId:()=>1}};
  let reads=0;
  const next={content:'',image:{type:'image/png',bytes:12,url:'new'},mtimeMs:2};
  const controller=createAutomaticRefresh({api:{statFile:async()=>({exists:true,mtimeMs:2,size:12}),readFile:async()=>{reads++;return next;}},
    getState:()=>({root:null,enabled:true,visible:true}),getDocuments:()=>[doc],isOpen:()=>true,
    reload:(value,latest)=>{value.image=latest.image;value.mtimeMs=latest.mtimeMs;},
    conflict:()=>assert.fail('Raster image should not enter text conflict review')});
  await controller.check();assert.equal(doc.image.url,'new');
  await controller.check();assert.equal(reads,1,'unchanged images should reuse loaded pixels');
});
test('edits, saves, close and stop during asynchronous reads prevent stale reloads',async()=>{
  for(const action of [f=>f.edit('typed while reading'),f=>{f.doc.savedText='just saved';},f=>f.docs.splice(0),f=>f.controller.stop()]){
    const f=await fixture();let finish;f.api.readFile=()=>new Promise(resolve=>{finish=resolve;});
    const checking=f.controller.check();await new Promise(resolve=>setImmediate(resolve));action(f);finish({content:'external',mtimeMs:2});await checking;
    assert.notEqual(f.text,'external');
  }
});
test('external deletion preserves the buffer, permission errors never mark it missing, and reappearing files recover',async()=>{
  const f=await fixture();f.setExists(false);await f.controller.check();assert.equal(f.text,'original');assert.equal(f.doc.missing,true);
  f.setExists(true);f.setLatest('original');await f.controller.check();assert.equal(f.doc.missing,false);assert.equal(f.doc.dirty,false);
  f.api.statFile=async()=>{throw new Error('Permission denied');};await f.controller.check();assert.equal(f.doc.missing,false);
});
test('hidden, disabled and busy states pause work; forced focus checks detect content behind unchanged metadata',async()=>{
  const f=await fixture();f.state.visible=false;await f.controller.check();assert.equal(f.reads,0);
  f.state.visible=true;f.state.enabled=false;await f.controller.check();assert.equal(f.reads,0);
  f.state.enabled=true;f.setBusy(true);await f.controller.check();assert.equal(f.reads,0);
  f.setBusy(false);await f.controller.check();assert.equal(f.text,'external');
  f.setLatest('modified',2);await f.controller.check();assert.equal(f.text,'external','same size and mtime is deferred to a forced check');
  await f.controller.check({force:true});assert.equal(f.text,'modified');
});
test('metadata reads distinguish missing files from unavailable storage',async t=>{
  const {fileMetadata}=require('../electron/file-metadata.cjs'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-metadata-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const name=path.join(root,'a.txt');await fs.writeFile(name,'hello');const stat=await fileMetadata(name);assert.equal(stat.exists,true);assert.equal(stat.size,5);
  await fs.unlink(name);assert.deepEqual(await fileMetadata(name),{exists:false});
  await assert.rejects(fileMetadata(name,{io:{stat:async()=>{const error=new Error('Permission denied');error.code='EACCES';throw error;}}}),/Permission/);
});
test('stop and restart during a pending scan resume only one polling timer and discard the old workspace',async()=>{
  const {createAutomaticRefresh}=await refresh;let finish,commits=0;const timers=[];
  const state={root:'/first',nodes:[],expanded:[],enabled:true,visible:true};
  const controller=createAutomaticRefresh({api:{scanFolder:()=>new Promise(resolve=>{finish=resolve;})},
    getState:()=>state,getDocuments:()=>[],isOpen:()=>false,commitExplorer:()=>{commits++;},
    schedule:fn=>{timers.push(fn);return timers.length;},cancel:()=>{}});
  controller.start();controller.stop();state.root='/second';controller.start();
  finish({nodes:[file('stale.txt')]});await controller.check();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(commits,0);assert.equal(timers.length,1);controller.stop();
});

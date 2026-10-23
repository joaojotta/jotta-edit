'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {listFolderTree}=require('../electron/folder-tree.cjs');
const {attributes}=require('../electron/remote-clients.cjs');
test('a shallow folder scan lists immediate contents without scanning siblings or reporting a file-limit truncation',async()=>{
 const reads=[];
 const io={stat:async()=>attributes({dir:true}),realpath:async file=>file,readdir:async file=>{
  reads.push(file);
  if(file==='/workspace/public_html')return [attributes({name:'index.html'}),attributes({name:'assets',dir:true})];
  throw new Error('A shallow scan must not visit this folder');
 }};
 const listing=await listFolderTree('/workspace/public_html',{io,shallow:true});
 assert.deepEqual(reads,['/workspace/public_html']);
 assert.equal(listing.count,1);assert.equal(listing.truncated,false);
 assert.equal(listing.nodes.find(x=>x.name==='index.html').dir,false);
 const assets=listing.nodes.find(x=>x.name==='assets');assert.equal(assets.incomplete,true);assert.deepEqual(assets.children,[]);
});
test('a large earlier folder cannot hide public_html or later sibling folders',async()=>{
 const root='/workspace';
 const io={stat:async()=>attributes({dir:true}),realpath:async file=>file,readdir:async file=>{
  if(file===root)return ['backups','public_html','z-later'].map(name=>attributes({name,dir:true}));
  if(file.endsWith('/backups'))return Array.from({length:8001},(_,i)=>attributes({name:String(i)+'.txt'}));
  return [attributes({name:'index.html'})];
 }};
 const listing=await listFolderTree(root,{io});
 assert.equal(listing.count,8000);assert.equal(listing.truncated,true);
 assert.deepEqual(listing.nodes.map(x=>x.name),['backups','public_html','z-later']);
 const web=listing.nodes.find(x=>x.name==='public_html');assert.equal(web.incomplete,true);
 const expanded=await listFolderTree(web.path,{io});assert.equal(expanded.nodes[0].name,'index.html');
});
test('local in-workspace public_html links remain visible and cyclic or outside links do not recurse',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-tree-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'project','sites','example'),{recursive:true});const project=path.join(root,'project');
 await fs.writeFile(path.join(project,'sites','example','index.html'),'hello');await fs.symlink('sites/example',path.join(project,'public_html'));
 await fs.symlink('.',path.join(project,'loop'));await fs.mkdir(path.join(root,'outside'));await fs.symlink('../outside',path.join(project,'outside'));
 const listing=await listFolderTree(project);
 const web=listing.nodes.find(x=>x.name==='public_html');assert.equal(web.dir,true);assert.equal(web.children[0].name,'index.html');
 assert.match(listing.nodes.find(x=>x.name==='loop').error,/loop/);assert.match(listing.nodes.find(x=>x.name==='outside').error,/outside/);
});
test('hidden and ignored directories follow their filters while inaccessible folders remain listed',async()=>{
 const io={stat:async()=>attributes({dir:true}),realpath:async file=>file,readdir:async file=>{
  if(file!=='/root')throw new Error('Remote access denied.');return ['public_html','.hidden','node_modules'].map(name=>attributes({name,dir:true}));
 }};
 const listing=await listFolderTree('/root',{io,ignoreDirs:new Set(['node_modules'])});assert.deepEqual(listing.nodes.map(x=>x.name),['public_html']);assert.match(listing.nodes[0].error,/denied/);
 assert.equal((await listFolderTree('/root',{io,showHidden:true})).nodes.length,3);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

class Element {
  constructor(){this.children=[];this.style={};this.events={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(){}
  addEventListener(name,handler){this.events[name]=handler;}
}
function explorer(scanFolder,{root='/workspace',nodes}={}){
  const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
  const tree=new Element(),status=[],opened=[];
  const node=nodes?.find(x=>x.name==='public_html')||{path:root+'/public_html',name:'public_html',dir:true,children:[]};
  const state={root,nodes:nodes||[node],expanded:new Set(),files:[],removedFolders:new Set(),showHidden:false};
  const context=vm.createContext({state,api:{scanFolder},document:{createElement:()=>new Element()},
    $:()=>tree,tr:value=>value,activeDocument:()=>null,makeIcon:()=>new Element(),makeThemedIcon:()=>new Element(),
    fileIconPath:()=>'',attachDropTarget(){},showExplorerContext(){},removeFolderFromView(){},
    showStatus:message=>status.push(message),openFile:file=>opened.push(file)});
  vm.runInContext(source.slice(source.indexOf('function filterRemovedFolders('),source.indexOf('function removeFolderFromView(')),context);
  vm.runInContext(source.slice(source.indexOf('function renderTree()'),source.indexOf('async function refreshFolder(')),context);
  context.renderTree();
  return {state,node,tree,status,opened,render:()=>context.renderTree()};
}
test('expanding a cached empty public_html fetches and renders its current files',async()=>{
  const requests=[];
  const ui=explorer(async(folder,options)=>{requests.push({folder,options});return {
    nodes:[{path:folder+'/index.html',name:'index.html',dir:false}],truncated:false};});
  await ui.tree.children[0].events.click();
  assert.equal(requests.length,1);
  assert.equal(requests[0].folder,ui.node.path);
  assert.equal(requests[0].options.shallow,true);
  assert.equal(ui.node.children[0].name,'index.html');
  assert.equal(ui.tree.children.length,2);
  await ui.tree.children[1].events.click();
  assert.deepEqual(ui.opened,['/workspace/public_html/index.html']);
});
test('failed empty-folder expansion shows the error and can be retried',async()=>{
  let attempts=0;
  const ui=explorer(async()=>{if(++attempts===1)throw new Error('Remote access denied.');return {nodes:[],truncated:false};});
  await ui.tree.children[0].events.click();
  assert.equal(ui.state.expanded.has(ui.node.path),false);
  assert.ok(ui.status.includes('Remote access denied.'));
  await ui.tree.children[0].events.click();
  assert.equal(attempts,2);
  assert.ok(ui.status.includes('No visible files or folders'));
});
test('late folder listings cannot populate another workspace',async()=>{
  let finish;
  const ui=explorer(()=>new Promise(resolve=>{finish=resolve;}));
  ui.node.incomplete=true;
  const pending=ui.tree.children[0].events.click();
  ui.state.root='/another';ui.state.nodes=[];
  finish({nodes:[{path:'/workspace/public_html/stale.html',name:'stale.html',dir:false}],truncated:false});
  await pending;
  assert.equal(ui.node.children.length,0);
  assert.equal(ui.state.nodes.length,0);
});
test('real FTP public_html contents render after an empty initial Explorer scan',
 {skip:!process.env.JOTTA_PROTOCOL_TEST_PYTHONPATH},async t=>{
  const fsp=require('node:fs/promises'),os=require('node:os'),net=require('node:net'),{spawn}=require('node:child_process');
  const {RemoteFolders}=require('../electron/remote-folders.cjs'),{listFolderTree}=require('../electron/folder-tree.cjs');
  const disk=await fsp.mkdtemp(path.join(os.tmpdir(),'jotta-ftp-expand-'));
  t.after(()=>fsp.rm(disk,{recursive:true,force:true}));
  await fsp.mkdir(path.join(disk,'public_html'));await fsp.writeFile(path.join(disk,'public_html','index.html'),'server contents');
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
  const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const server=spawn('python3',[path.join(__dirname,'fixtures','remote-servers.py'),'ftp-first-empty-mlsd',disk,String(port)],
    {env:{...process.env,PYTHONPATH:process.env.JOTTA_PROTOCOL_TEST_PYTHONPATH},stdio:['ignore','pipe','pipe']});
  t.after(()=>server.kill());server.stderr.resume();
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('FTP expansion server did not start')),10000);
    server.once('exit',()=>{clearTimeout(timer);reject(new Error('FTP expansion server exited'));});
    server.stdout.on('data',chunk=>{if(String(chunk).includes('READY')){clearTimeout(timer);resolve();}});
  });
  const remote=new RemoteFolders();t.after(()=>remote.close());
  const {root}=await remote.connect(`ftp://127.0.0.1:${port}/`,undefined,{username:'test',password:'test-password'});
  const initial=await listFolderTree(root,{io:remote});
  assert.equal(initial.nodes[0].children.length,0);assert.equal(initial.nodes[0].incomplete,undefined);
  const ui=explorer((folder,options)=>listFolderTree(folder,{io:remote,...options}),initial);
  await ui.tree.children[0].events.click();
  assert.equal(ui.node.children[0].name,'index.html');assert.equal(ui.tree.children.length,2);
  await ui.tree.children[1].events.click();
  assert.equal(await remote.readFile(ui.opened[0],'utf8'),'server contents');
});

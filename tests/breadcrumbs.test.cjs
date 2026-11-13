'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {panelDom}=require('./fixtures/panel-dom.cjs');
const breadcrumbs=import('../src/breadcrumbs.js');
test('workspace breadcrumbs retain original paths and never navigate above the workspace',async()=>{
  const {breadcrumbSegments}=await breadcrumbs;
  const parts=breadcrumbSegments('/work/project/src/styles/site.css',{root:'/work/project'});
  assert.deepEqual(parts.map(item=>[item.label,item.path,item.folder]),[
    ['project','/work/project',true],['src','/work/project/src',true],['styles','/work/project/src/styles',true],['site.css','/work/project/src/styles/site.css',false]
  ]);
  assert.equal(breadcrumbSegments('/work/project-two/a.txt',{root:'/work/project'})[0].path,'/');
});
test('Windows drive roots, UNC shares and standalone POSIX files produce valid absolute folder paths',async()=>{
  const {breadcrumbSegments}=await breadcrumbs;
  assert.deepEqual(breadcrumbSegments('C:\\Users\\Joao\\a.css').map(item=>item.path),['C:/','C:/Users','C:/Users/Joao','C:/Users/Joao/a.css']);
  assert.deepEqual(breadcrumbSegments('C:\\a.css',{root:'C:\\'}).map(item=>item.path),['C:/','C:/a.css']);
  assert.deepEqual(breadcrumbSegments('\\\\server\\share\\src\\a.txt').map(item=>item.path),['//server/share','//server/share/src','//server/share/src/a.txt']);
  assert.deepEqual(breadcrumbSegments('/a.txt').map(item=>item.path),['/','/a.txt']);
});
test('browser standalone identities remain private while browser and remote workspace paths stay bounded',async()=>{
  const {breadcrumbSegments}=await breadcrumbs;
  for(const prefix of ['local-files','imports','downloads'])assert.deepEqual(breadcrumbSegments('/'+prefix+'/private-id/a.css',{platform:'web'}),[{label:'a.css',path:null,folder:false}]);
  assert.equal(breadcrumbSegments('/workspace/My Project/src/a.txt',{platform:'web'})[0].path,'/workspace/My Project');
  assert.equal(breadcrumbSegments('/app/remote-workspaces/private-id/public_html/a.php',{root:'/app/remote-workspaces/private-id/public_html'})[0].label,'public_html');
  assert.equal(breadcrumbSegments(null,{label:'draft'})[0].path,null);
});
async function fixture(list) {
  const {installBreadcrumbs}=await breadcrumbs;
  const {documentRef,elements}=panelDom(['host']);
  const create=documentRef.createElement;documentRef.body=create('body');
  // The popup uses a browser DOM; add only the selectors and containment needed here.
  documentRef.createElement=tag=>{
    const node=create(tag);
    node.querySelector=selector=>node.querySelectorAll(selector)[0]||null;
    node.contains=target=>node===target||node.children.some(child=>child===target||child.contains?.(target));
    return node;
  };
  const opened=[],revealed=[],status=[];
  const panel=installBreadcrumbs({host:elements.host,list,open:(...args)=>opened.push(args),reveal:async folder=>{revealed.push(folder);return true;},notify:value=>status.push(value),documentRef});
  panel.render({path:'/project/src/a.css',root:'/project',name:'a.css'});
  return {panel,host:elements.host,popup:documentRef.body.children[0],opened,revealed,status};
}
test('a folder popup browses children, previews files and reveals the chosen folder',async()=>{
  const requested=[];
  const f=await fixture(async folder=>{requested.push(folder);return {nodes:[{name:'nested',path:folder+'/nested',dir:true},{name:'file.css',path:folder+'/file.css',dir:false}]};});
  await f.panel.browse('/project/src',null,'/project');
  assert.equal(f.popup.hidden,false);
  let entries=f.popup.children[3];entries.children[1].onclick();
  assert.equal(f.opened[0][0],'/project/src/file.css');assert.equal(f.opened[0][1].preview,true);
  entries.children[0].onclick();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(requested,['/project/src','/project/src/nested']);
  await f.popup.children[1].children[1].onclick();
  assert.deepEqual(f.revealed,['/project/src/nested']);assert.equal(f.popup.hidden,true);
});
test('closed or superseded folder listings cannot update the visible contents',async()=>{
  const pending=new Map();const f=await fixture(folder=>new Promise(resolve=>pending.set(folder,resolve)));
  const first=f.panel.browse('/project/src',null,'/project');f.panel.close();
  pending.get('/project/src')({nodes:[{name:'stale',path:'/project/src/stale'}]});await first;
  assert.equal(f.popup.hidden,true);
  const old=f.panel.browse('/project/old',null,'/project'),fresh=f.panel.browse('/project/new',null,'/project');
  pending.get('/project/new')({nodes:[{name:'fresh',path:'/project/new/fresh'}]});await fresh;
  pending.get('/project/old')({nodes:[{name:'stale',path:'/project/old/stale'}]});await old;
  assert.equal(f.popup.children[3].children[0].textContent,'fresh');
});
test('listing errors remain visible and inaccessible entries do not open files',async()=>{
  const f=await fixture(async()=>{throw new Error('Folder access expired');});
  await f.panel.browse('/project/src',null,'/project');assert.match(f.popup.children[2].textContent,/expired/);
  const blocked=await fixture(async()=>({nodes:[{name:'blocked.css',path:'/project/blocked.css',error:'Access denied'}]}));
  await blocked.panel.browse('/project',null,'/project');blocked.popup.children[3].children[0].onclick();
  assert.deepEqual(blocked.opened,[]);assert.deepEqual(blocked.status,['Access denied']);
});

test('status-bar folder navigation opens above its trigger and clears stale positioning',async()=>{
  const f=await fixture(async()=>({nodes:[]}));
  const trigger=f.host.children[0];
  const viewportHeight=globalThis.innerHeight || 700;
  trigger.getBoundingClientRect=()=>({left:40,top:viewportHeight-24,bottom:viewportHeight-2});
  await f.panel.browse('/project',trigger,'/project');
  assert.equal(f.popup.style.top,'auto');
  assert.equal(f.popup.style.bottom,'28px');
  assert.equal(f.popup.style.maxHeight,`${viewportHeight-36}px`);
  trigger.getBoundingClientRect=()=>({left:40,top:30,bottom:50});
  await f.panel.browse('/project',trigger,'/project');
  assert.equal(f.popup.style.bottom,'auto');
  assert.equal(f.popup.style.top,'50px');
});

test('the status-bar path is hidden without a document and restored for drafts',async()=>{
  const f=await fixture(async()=>({nodes:[]}));
  f.panel.render(null);assert.equal(f.host.hidden,true);
  f.panel.render({name:'untitled-1'});assert.equal(f.host.hidden,false);
  assert.equal(f.host.children[0].textContent,'untitled-1');
});

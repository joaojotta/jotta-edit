'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const folders=import('../src/workspace-folders.js');
test('workspace roots validate boundaries, reject overlap, and resolve each file to its owning folder',async()=>{
  const {owningFolder,validateFolderAddition,folderContains,MAX_WORKSPACE_FOLDERS}=await folders;
  const roots=[{path:'/one'},{path:'/two'}];
  assert.equal(owningFolder(roots,'/two/src/main.js'),roots[1]);assert.equal(owningFolder(roots,'/two-other/a'),null);
  assert.equal(folderContains('C:\\Work','c:/work/a.txt'),true);assert.equal(folderContains('/','/a.txt'),true);
  assert.equal(folderContains('/one','/one/../secret'),false);
  assert.throws(()=>validateFolderAddition(roots,'/one/nested'),/overlaps/);
  assert.throws(()=>validateFolderAddition(roots,'/'),/overlaps/);
  assert.throws(()=>validateFolderAddition(Array.from({length:MAX_WORKSPACE_FOLDERS},(_,i)=>({path:'/root'+i})),'/another'),/20 folders/);
});
test('combined Explorer roots preserve folder listings across refresh, addition and removal',async()=>{
  const {workspaceTree,captureWorkspaceTree}=await folders;
  const roots=[{path:'/one',nodes:[{path:'/one/a',name:'a'}]},{path:'/two',nodes:[{path:'/two/b',name:'b'}]}];
  const nodes=workspaceTree(roots);assert.equal(nodes.length,2);assert.equal(nodes[1].workspaceRoot,true);
  nodes[1].children=[{path:'/two/new',name:'new'}];captureWorkspaceTree(roots,nodes);
  roots.shift();assert.deepEqual(workspaceTree(roots),[{path:'/two/new',name:'new'}]);
});
test('multi-folder search includes unsaved buffers, disambiguates file paths and stays inside the workspace',async()=>{
  const {searchProjectFiles,projectSearchLabel}=await import('../src/project-search.js');
  const root=['/one','/two'],reads=[];
  const result=await searchProjectFiles({root,paths:['/one/a.txt','/two/a.txt','/outside/secret.txt'],query:'needle',buffers:new Map([['/two/a.txt','unsaved needle']]),
    readFile:async path=>{reads.push(path);return {content:'disk needle'};}});
  assert.deepEqual(reads,['/one/a.txt']);assert.equal(result.results.length,2);assert.equal(result.results[1].text,'unsaved needle');
  assert.equal(projectSearchLabel(root,'/one/a.txt'),'one/a.txt');assert.equal(projectSearchLabel(root,'/two/a.txt'),'two/a.txt');
});
test('background refresh updates every root while retaining listings for an unavailable folder',async()=>{
  const {refreshExplorerSnapshot}=await import('../src/automatic-refresh.js');
  const context={root:'/one',roots:['/one','/two'],expanded:[],showHidden:false,nodes:[
    {path:'/one',name:'one',dir:true,workspaceRoot:true,children:[{path:'/one/old',name:'old'}]},
    {path:'/two',name:'two',dir:true,workspaceRoot:true,children:[{path:'/two/keep',name:'keep'}]}]};
  const result=await refreshExplorerSnapshot(context,async root=>{if(root==='/two')throw new Error('Disconnected');return {nodes:[{path:'/one/new',name:'new'}]};});
  assert.equal(result.nodes[0].children[0].name,'new');assert.equal(result.nodes[1].children[0].name,'keep');
});
test('session recovery preserves folder order, active root and drafts while accepting legacy sessions',()=>{
  const {normalizeSession}=require('../electron/session-store.cjs');
  const saved=normalizeSession({root:'/two',folders:['/one','/two','/one'],tabs:[{path:null,text:'draft',dirty:true}]});
  assert.deepEqual(saved.folders,['/one','/two']);assert.equal(saved.root,'/two');assert.equal(saved.tabs[0].text,'draft');
  assert.equal(normalizeSession({root:'/legacy',files:[]}).folders,undefined);
  assert.throws(()=>normalizeSession({folders:[null]}),/Invalid workspace folders/);
});

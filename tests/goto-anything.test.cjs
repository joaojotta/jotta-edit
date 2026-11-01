'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tools=import('../src/goto-anything.js');
test('Go to Anything parses lines, symbols and file locations without confusing Windows drives',async()=>{
  const {parseAnythingQuery:parse}=await tools;
  assert.deepEqual(parse(':42'),{mode:'line',line:42,column:1});
  assert.deepEqual(parse(':42:9'),{mode:'line',line:42,column:9});
  assert.deepEqual(parse('@render tree'),{mode:'symbols',query:'render tree'});
  assert.deepEqual(parse('file.css:42'),{mode:'files',query:'file.css',line:42,column:1});
  assert.deepEqual(parse('C:\\src\\file.css:42:8'),{mode:'files',query:'C:\\src\\file.css',line:42,column:8});
  assert.equal(parse('C:\\src\\file.css').line,null);
  for(const value of [':0',':-1',':42bad',':99999999999999999'])assert.equal(parse(value).line,null);
});
function model(){return {getLineCount:()=>10};}
test('line and symbol navigation target the active unsaved model and clamp lines',async()=>{
  const {anythingResults}=await tools;
  const current=model(),positions=[];
  const context={model:current,reveal:(...args)=>positions.push(args),loadOutline:async()=>({entries:[{name:'renderTree',kind:'Function',line:4,column:7},{name:'save',kind:'Function',line:8,column:2}]})};
  (await anythingResults(':42',context))[0].action();
  assert.deepEqual(positions[0],[current,10,1]);
  const symbols=await anythingResults('@rtr',context);assert.equal(symbols.length,1);symbols[0].action();
  assert.deepEqual(positions[1],[current,4,7]);
  assert.deepEqual(await anythingResults('@foo',{...context,model:null}),[]);
});
test('file locations use fuzzy names, deduplicate open documents and include unnamed drafts',async()=>{
  const {anythingResults}=await tools;
  const opened=[],selected=[],positions=[];
  const draft={id:'draft',name:'untitled-1',model:model()},context={files:['/project/src/site.css','/project/src/app.js'],documents:[{id:'site',path:'/project/src/site.css',name:'site.css'},draft],relative:path=>path.slice(9),open:(...args)=>opened.push(args),select:id=>selected.push(id),reveal:(...args)=>positions.push(args)};
  const files=await anythingResults('site.css:9:2',context);assert.equal(files.length,1);files[0].action();
  assert.deepEqual(opened,[['/project/src/site.css',{line:9,column:2}]]);
  const drafts=await anythingResults('untitled:4',context);drafts[0].action();
  assert.deepEqual(selected,['draft']);assert.deepEqual(positions,[[draft.model,4,1]]);
  assert.equal((await anythingResults('',context)).length,3);
});

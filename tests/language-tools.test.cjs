'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const tools=import('../src/language-tools.js');
function model(file,text='bad',lang='python'){
  let version=1;const listeners={};
  return {uri:{fsPath:file},getValue:()=>text,getLanguageId:()=>lang,getVersionId:()=>version,isDisposed:()=>false,
    onDidChangeContent(fn){listeners.content=fn;return {dispose(){}};},onDidChangeLanguage(fn){listeners.language=fn;return {dispose(){}};},
    edit(value){text=value;version++;listeners.content?.();}};
}
async function fixture(){
  const {installLanguageTools}=await tools;const docs=[{path:'/project/a.py',name:'a.py',savedText:'bad',model:model('/project/a.py')}];
  const definitions={},renames={},markers=[],closes=[],syncs=[];let diagnostics;
  const monaco={MarkerSeverity:{Error:8,Warning:4,Info:2,Hint:1},Range:class {constructor(startLineNumber,startColumn,endLineNumber,endColumn){Object.assign(this,{startLineNumber,startColumn,endLineNumber,endColumn});}},Uri:{file:file=>({fsPath:file})},
    editor:{setModelMarkers:(...args)=>markers.push(args)},languages:{
      registerDefinitionProvider(lang,provider){definitions[lang]=provider;return {dispose(){}};},registerRenameProvider(lang,provider){renames[lang]=provider;return {dispose(){}};}
    }};
  const api={syncLanguage:async params=>syncs.push(params),closeLanguage:async file=>closes.push(file),onLanguageDiagnostics(fn){diagnostics=fn;return ()=>{};},
    languageDefinition:async()=>[{file:'/project/b.py',range:{start:{line:0,character:0},end:{line:0,character:3}}}],
    languageRename:async()=>[{file:'/project/a.py',edits:[{range:{start:{line:0,character:0},end:{line:0,character:3}},newText:'good'}]}],
  };
  const controller=installLanguageTools({api,monaco,getDocuments:()=>docs,getRoot:()=>'/project',openFile:async()=>true,loadDocument:async file=>{
    const doc={path:file,name:file.split('/').pop(),savedText:'bad',model:model(file)};docs.push(doc);return doc;
  }});
  return {controller,docs,api,monaco,definitions,renames,markers,closes,syncs,diagnostics:event=>diagnostics(event)};
}
test('diagnostic ranges and severity convert to safe Monaco markers',async()=>{
  const {diagnosticMarkers}=await tools;
  const markers=diagnosticMarkers([{message:'broken',severity:2,source:'test',range:{start:{line:2,character:3},end:{line:2,character:4}}},{message:'invalid',range:{start:{line:-1,character:0},end:{line:0,character:0}}}],{MarkerSeverity:{Error:8,Warning:4,Info:2,Hint:1}});
  assert.equal(markers.length,1);assert.equal(markers[0].severity,4);assert.equal(markers[0].startLineNumber,3);assert.equal(markers[0].startColumn,4);
});
test('rename text edits honor UTF-16 and CRLF, and reject overlapping or invalid ranges',async()=>{
  const {textAfterEdits}=await tools,edit=(start,end,newText)=>({range:{start,end},newText});
  assert.equal(textAfterEdits('😀bad\r\nbad',[edit({line:0,character:2},{line:0,character:5},'good'),edit({line:1,character:0},{line:1,character:3},'good')]),'😀good\r\ngood');
  assert.throws(()=>textAfterEdits('bad',[edit({line:0,character:0},{line:0,character:2},'a'),edit({line:0,character:1},{line:0,character:3},'b')]),/Overlapping/);
  assert.throws(()=>textAfterEdits('bad',[edit({line:2,character:0},{line:2,character:3},'x')]),/Invalid/);
});
test('language diagnostics clear on edits and ignore late model versions and closed documents',async t=>{
  const f=await fixture();t.after(()=>f.controller.dispose());const doc=f.docs[0];f.controller.track(doc);
  const event={file:doc.path,lang:'python',version:1,diagnostics:[{message:'bad',range:{start:{line:0,character:0},end:{line:0,character:3}}}]};
  f.diagnostics(event);assert.equal(f.markers.at(-1)[2].length,1);
  doc.model.edit('good');assert.deepEqual(f.markers.at(-1)[2],[]);const count=f.markers.length;
  f.diagnostics(event);assert.equal(f.markers.length,count);
  f.controller.untrack(doc);f.docs.splice(0);f.diagnostics({...event,version:2});assert.equal(f.closes[0],'/project/a.py');
});
test('definition results are discarded after edits or cancellation',async t=>{
  const f=await fixture();t.after(()=>f.controller.dispose());const doc=f.docs[0],position={lineNumber:1,column:2},token={isCancellationRequested:false};
  const locations=await f.definitions.python.provideDefinition(doc.model,position,token);assert.equal(locations[0].uri.fsPath,'/project/b.py');
  f.api.languageDefinition=async()=>{doc.model.edit('changed');return [{file:'/project/b.py'}];};
  assert.deepEqual(await f.definitions.python.provideDefinition(doc.model,position,token),[]);
});
test('rename loads all affected models and returns version-checked edits without changing text or writing files',async t=>{
  const f=await fixture();t.after(()=>f.controller.dispose());
  const change={range:{start:{line:0,character:0},end:{line:0,character:3}},newText:'good'};
  f.api.languageRename=async()=>[{file:'/project/a.py',edits:[change]},{file:'/project/b.py',edits:[change]}];
  const result=await f.renames.python.provideRenameEdits(f.docs[0].model,{lineNumber:1,column:2},'good',{isCancellationRequested:false});
  assert.equal(result.edits.length,2);assert.equal(result.edits[1].resource.fsPath,'/project/b.py');assert.equal(result.edits[1].versionId,1);
  assert.equal(f.docs.length,2);assert.ok(f.docs.every(doc=>doc.model.getValue()==='bad'));
  assert.ok(f.syncs.length>0,'unsaved buffers synchronize before Rename Symbol');
});
test('rename rejects stale buffers and invalid edits as a whole',async t=>{
  const f=await fixture();t.after(()=>f.controller.dispose());const doc=f.docs[0];
  f.api.languageRename=async()=>{doc.model.edit('user edits');return [];};
  const result=await f.renames.python.provideRenameEdits(doc.model,{lineNumber:1,column:2},'new',{isCancellationRequested:false});
  assert.deepEqual(result.edits,[]);assert.match(result.rejectReason,/Files changed/);assert.equal(doc.model.getValue(),'user edits');
});

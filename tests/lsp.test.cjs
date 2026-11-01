'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LspBridge,LspProcess,commandAvailable } = require('../electron/lsp.cjs');

test('LSP bridge initializes, opens files, updates and retrieves completions', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-lsp-'));
  const fakeServer = path.resolve(__dirname, 'fake-lsp.cjs');
  fs.writeFileSync(path.join(temp, 'lsp.json'), JSON.stringify({ python: [process.execPath, fakeServer] }));
  const bridge = new LspBridge(temp);
  try {
    const request = { root: temp, file: path.join(temp, 'sample.py'), lang: 'python', content: 'prin', line: 1, column: 5 };
    const first = await bridge.complete(request);
    assert.equal(first[0].label, 'fakeCompletion');
    const second = await bridge.complete({ ...request, content: 'print(' });
    assert.equal(second[0].insertText, 'fakeCompletion');
    assert.deepEqual(await bridge.complete({ ...request, lang: 'unknown' }), []);
  } finally {
    await bridge.shutdown();
    await fs.promises.rm(temp, { recursive: true, force: true, maxRetries: 12, retryDelay: 150 });
  }
});

test('language servers publish versioned diagnostics, handle incremental changes, definition, rename and close',async t=>{
  const temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),'jotta-language-'));
  await fs.promises.writeFile(path.join(temp,'lsp.json'),JSON.stringify({python:[process.execPath,path.join(__dirname,'fake-lsp.cjs')]}));
  const events=[],bridge=new LspBridge(temp,{diagnostics:event=>events.push(event)});t.after(async()=>{await bridge.shutdown();await fs.promises.rm(temp,{recursive:true,force:true,maxRetries:12,retryDelay:150});});
  const params={root:temp,file:path.join(temp,'sample.py'),lang:'python',content:'bad',version:10,line:1,column:2};
  await bridge.sync(params);await bridge.complete(params);
  assert.equal(events[0].version,10);assert.equal(events[0].diagnostics[0].message,'Bad symbol');
  const locations=await bridge.definition(params);assert.equal(locations[0].file,params.file);assert.equal(locations[0].range.start.line,0);
  const edits=await bridge.rename({...params,newName:'good'});assert.equal(edits[0].version,10);assert.equal(edits[0].edits[0].newText,'good');
  await bridge.sync({...params,content:'good\r\n😀',version:11});await bridge.complete({...params,content:'good\r\n😀',version:11});
  assert.equal(events.at(-1).version,11);assert.deepEqual(events.at(-1).diagnostics,[]);
  bridge.close(params.file);assert.equal([...bridge.processes.values()][0].documents.size,0);
});

test('stale and closed-document diagnostics are discarded',()=>{
  const events=[],instance=new LspProcess([],null,{diagnostics:event=>events.push(event)}),uri=require('node:url').pathToFileURL('/sample.py').toString();
  instance.documents.set(uri,{version:2,clientVersion:8});
  instance.message({method:'textDocument/publishDiagnostics',params:{uri,version:1,diagnostics:[{message:'stale'}]}});
  assert.equal(events.length,0);
  instance.message({method:'textDocument/publishDiagnostics',params:{uri,version:2,diagnostics:[]}});assert.equal(events[0].version,8);
  instance.documents.clear();instance.message({method:'textDocument/publishDiagnostics',params:{uri,diagnostics:[{}]}});assert.equal(events.length,1);
});

test('language server configuration validates commands, reports availability and preserves disabled servers',async t=>{
  const temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),'jotta-lsp-settings-'));t.after(()=>fs.promises.rm(temp,{recursive:true,force:true}));
  const bridge=new LspBridge(temp);t.after(()=>bridge.shutdown());
  const servers=await bridge.configure({python:[process.execPath,path.join(__dirname,'fake-lsp.cjs')],php:false,rust:['jotta-nonexistent-language-server']});
  assert.equal(servers.find(server=>server.lang==='python').available,true);
  assert.equal(servers.find(server=>server.lang==='php').enabled,false);
  assert.equal(servers.find(server=>server.lang==='rust').available,false);
  await assert.rejects(bridge.configure({python:['bad\ncommand']}),/Invalid/);
  assert.equal(await commandAvailable(process.execPath),true);
  assert.deepEqual(JSON.parse(await fs.promises.readFile(path.join(temp,'lsp.json'),'utf8')).php,false);
});

test('closing a document during language-server initialization does not reopen it',async()=>{
  const bridge=new LspBridge('/tmp');let finish;
  const instance={sync:()=>assert.fail('Closed file was synchronized'),close(){}};
  bridge.instance=()=>new Promise(resolve=>{finish=resolve;});
  const syncing=bridge.sync({file:'/closed.py'});bridge.close('/closed.py');finish(instance);await syncing;
});

test('shutdown forcibly closes a language server that ignores TERM and protocol exit', {timeout:7000},async()=>{
  const server=new LspProcess([process.execPath,path.join(__dirname,'fake-lsp.cjs'),'--ignore-shutdown'],os.tmpdir());
  try{
    await server.start();const pid=server.child.pid,started=Date.now();
    await server.shutdown();
    assert.equal(server.closed,true);assert.ok(Date.now()-started<4000,'shutdown must remain bounded');
    assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
  }finally{if(!server.closed)server.terminate('SIGKILL');}
});

test('shutdown kills descendants holding inherited pipes after the launcher exits', {skip:process.platform==='win32',timeout:7000},async()=>{
  const server=new LspProcess([process.execPath,path.join(__dirname,'fake-lsp.cjs'),'--fork-child'],os.tmpdir());
  try{
    await server.start();assert.ok(server.capabilities.testChildPid);
    // Ensure the child has time to install its TERM handler before shutdown.
    await new Promise(resolve=>setTimeout(resolve,100));
    const started=Date.now();await server.shutdown();
    assert.equal(server.closed,true);assert.ok(Date.now()-started<4000,'descendants must not hold the test runner open');
  }finally{if(!server.closed)server.terminate('SIGKILL');}
});

test('installed clangd reports C errors and navigates and renames unsaved symbols',{
  skip:process.env.JOTTA_LSP_INTEGRATION!=='1'||require('node:child_process').spawnSync('clangd',['--version'],{stdio:'ignore',timeout:3000}).status!==0,timeout:20000
},async t=>{
  const temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),'jotta-clangd-')),file=path.join(temp,'main.c'),events=[];
  const bridge=new LspBridge(temp,{diagnostics:event=>events.push(event)});
  t.after(async()=>{await bridge.shutdown();await fs.promises.rm(temp,{recursive:true,force:true,maxRetries:12,retryDelay:150});});
  const content='int main(void) { return missing; }\n';await fs.promises.writeFile(file,content);
  const params={root:temp,file,lang:'c',content,version:1,line:1,column:25};
  await bridge.sync(params);
  const deadline=Date.now()+10000;
  while(!events.some(event=>event.version===1&&event.diagnostics.some(item=>item.severity===1))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(events.some(event=>event.diagnostics.some(item=>item.severity===1)),'clangd should diagnose the undefined symbol');
  const updated='int add(int x) { return x + 1; }\nint main(void) { return add(2); }\n';
  const request={...params,content:updated,version:2,line:2,column:updated.split('\n')[1].indexOf('add')+1};
  const definitions=await bridge.definition(request);assert.equal(definitions[0].file,file);assert.equal(definitions[0].range.start.line,0);
  const groups=await bridge.rename({...request,newName:'increment'});
  assert.ok(groups.flatMap(group=>group.edits).length>=2);assert.ok(groups.flatMap(group=>group.edits).every(edit=>edit.newText==='increment'));
  assert.equal(await fs.promises.readFile(file,'utf8'),content,'language operations must not write the unsaved draft to disk');
  await bridge.sync({...request,file:path.join(temp,'other.cpp'),lang:'cpp',content:'int helper;\n',version:3});
  assert.equal(bridge.processes.size,1,'C and C++ documents in one project should share clangd');
});

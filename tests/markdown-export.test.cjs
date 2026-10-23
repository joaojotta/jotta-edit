'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {exportMarkdown}=require('../electron/markdown-export.cjs');

async function fixture(t){
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-export-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));return folder;
}
const request={format:'html',name:'guide.html',html:'<!doctype html><title>Draft</title><p>Unsaved text</p>'};
test('HTML export writes the requested content and cancellation leaves the destination alone',async t=>{
  const folder=await fixture(t),filePath=path.join(folder,'guide.html');
  await fs.writeFile(filePath,'previous');
  const cancelled=await exportMarkdown(request,{dialog:{showSaveDialog:async()=>({canceled:true,filePath})}});
  assert.equal(cancelled.canceled,true);assert.equal(await fs.readFile(filePath,'utf8'),'previous');
  const result=await exportMarkdown(request,{dialog:{showSaveDialog:async()=>({canceled:false,filePath})}});
  assert.equal(result.path,filePath);assert.equal(await fs.readFile(filePath,'utf8'),request.html);
});
test('export refuses source extensions and destinations already open, including symlinks',async t=>{
  const folder=await fixture(t),source=path.join(folder,'guide.md'),open=path.join(folder,'existing.html');
  await fs.writeFile(source,'source');await fs.writeFile(open,'open buffer on disk');
  const deps=filePath=>({dialog:{showSaveDialog:async()=>({filePath})}});
  await assert.rejects(exportMarkdown(request,deps(source)),/extension/);
  await assert.rejects(exportMarkdown({...request,protectedPaths:[open]},deps(open)),/open in the editor/);
  if(process.platform!=='win32'){
    const alias=path.join(folder,'alias.html');await fs.symlink(open,alias);
    await assert.rejects(exportMarkdown({...request,protectedPaths:[open]},deps(alias)),/open in the editor/);
  }
  assert.equal(await fs.readFile(source,'utf8'),'source');assert.equal(await fs.readFile(open,'utf8'),'open buffer on disk');
});
test('PDF rendering is isolated and failed rendering preserves an existing output',async t=>{
  const folder=await fixture(t),filePath=path.join(folder,'guide.pdf');
  await fs.writeFile(filePath,'previous PDF');let options,destroyed=false,fail=false;
  class Window{
    constructor(value){options=value;this.webContents={setWindowOpenHandler:()=>{},on:()=>{},printToPDF:async settings=>{
      assert.equal(settings.printBackground,true);if(fail)throw new Error('printer failure');return Buffer.from('%PDF-test');
    }};}
    async loadURL(url){assert.ok(url.startsWith('data:text/html;charset=utf-8,'));}
    isDestroyed(){return destroyed;}
    destroy(){destroyed=true;}
  }
  const deps={dialog:{showSaveDialog:async()=>({filePath})},BrowserWindow:Window};
  await exportMarkdown({...request,format:'pdf',name:'guide.pdf'},deps);
  assert.equal(options.show,false);assert.equal(options.webPreferences.javascript,false);
  assert.equal(options.webPreferences.sandbox,true);assert.equal(options.webPreferences.nodeIntegration,false);
  assert.equal(destroyed,true);assert.equal(await fs.readFile(filePath,'utf8'),'%PDF-test');
  destroyed=false;fail=true;
  await assert.rejects(exportMarkdown({...request,format:'pdf',name:'guide.pdf'},deps),/printer failure/);
  assert.equal(destroyed,true);assert.equal(await fs.readFile(filePath,'utf8'),'%PDF-test');
});
test('invalid export requests fail before presenting a destination dialog',async()=>{
  for(const value of [{...request,format:'exe'},{...request,html:null},{...request,name:'../guide.html'},{...request,protectedPaths:'bad'}]){
    await assert.rejects(exportMarkdown(value,{}),/Invalid Markdown export/);
  }
});
test('export names retain descriptive filenames and replace Markdown extensions',async()=>{
  const {markdownExportName}=await import('../src/markdown-export.js');
  assert.equal(markdownExportName('Guia de utilização.MARKDOWN','html'),'Guia de utilização.html');
  assert.equal(markdownExportName('README.md','pdf'),'README.pdf');
  assert.equal(markdownExportName('','html'),'untitled.html');
  assert.equal(markdownExportName('bad/name?.md','pdf'),'bad_name_.pdf');
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {chooseMarkdownExport,exportMarkdown}=require('../electron/markdown-export.cjs');

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

test('desktop opens the destination chooser before image preparation and cancellation skips all rendering',async()=>{
  const {exportMarkdownDocument}=await import('../src/markdown-export.js');
  for(const format of ['html','pdf']){
    const calls=[];
    const result=await exportMarkdownDocument({format,source:'![missing](missing.png)',name:'guide.md',api:{
      chooseMarkdownExport:async options=>{calls.push(options);return {canceled:true};},
      exportMarkdown:async()=>assert.fail('Cancellation must not write a file')
    }},{render:async()=>assert.fail('Cancellation must not render or read images')});
    assert.equal(result.canceled,true);assert.equal(calls.length,1);assert.equal(calls[0].name,'guide.'+format);
  }
});

test('export uses the selected destination once and rechecks documents opened while preparing',async()=>{
  const {exportMarkdownDocument}=await import('../src/markdown-export.js');
  let paths=['/work/guide.md'];const order=[];
  const result=await exportMarkdownDocument({format:'html',source:'# Unsaved draft',name:'guide.md',documentPath:'/work/guide.md',api:{
    chooseMarkdownExport:async options=>{order.push('choose');assert.deepEqual(options.protectedPaths,paths);return {path:'/output/guide.html'};},
    exportMarkdown:async options=>{order.push('write');assert.equal(options.destination,'/output/guide.html');assert.equal(options.html,'<h1>Unsaved draft</h1>');assert.deepEqual(options.protectedPaths,paths);return {path:options.destination};}
  },getProtectedPaths:()=>paths},{render:async options=>{order.push('render');assert.equal(options.source,'# Unsaved draft');paths=[...paths,'/output/another.html'];return '<h1>Unsaved draft</h1>';}});
  assert.deepEqual(order,['choose','render','write']);assert.equal(result.path,'/output/guide.html');
});

test('failed image preparation happens after destination selection and never writes an export',async()=>{
  const {exportMarkdownDocument}=await import('../src/markdown-export.js');let selected=false;
  await assert.rejects(exportMarkdownDocument({format:'pdf',source:'![missing](missing.png)',name:'guide.md',api:{
    chooseMarkdownExport:async()=>{selected=true;return {path:'/output/guide.pdf'};},
    exportMarkdown:async()=>assert.fail('Failed preparation must not write a file')
  }},{render:async()=>{assert.equal(selected,true);throw new Error('Missing image');}}),/Missing image/);
});

test('destination selection focuses the app and defaults to a local document folder or Documents',async t=>{
  const folder=await fixture(t),documents=path.join(folder,'Documents'),source=path.join(folder,'project','guide.md');
  let options,focused=false,restored=false;
  const deps={defaultDirectory:documents,isRemote:file=>file.startsWith(path.join(folder,'remote')),parent:{
    isDestroyed:()=>false,isMinimized:()=>true,restore:()=>{restored=true;},focus:()=>{focused=true;}
  },dialog:{showSaveDialog:async(parent,value)=>{assert.equal(focused,true);assert.equal(restored,true);options=value;return {canceled:true};}}};
  await chooseMarkdownExport({...request,documentPath:source},deps);
  assert.equal(options.defaultPath,path.join(folder,'project','guide.html'));
  await chooseMarkdownExport(request,deps);assert.equal(options.defaultPath,path.join(documents,'guide.html'));
  await chooseMarkdownExport({...request,documentPath:path.join(folder,'remote','guide.md')},deps);
  assert.equal(options.defaultPath,path.join(documents,'guide.html'));
});

test('chosen destinations do not prompt again and cannot overwrite a newly opened file',async t=>{
  const folder=await fixture(t),destination=path.join(folder,'guide.html');await fs.writeFile(destination,'previous');
  const deps={dialog:{showSaveDialog:()=>assert.fail('Destination was already chosen')}};
  await assert.rejects(exportMarkdown({...request,destination,protectedPaths:[destination]},deps),/open in the editor/);
  assert.equal(await fs.readFile(destination,'utf8'),'previous');
  await assert.rejects(exportMarkdown({...request,destination:'relative.html'},deps),/destination/);
  await exportMarkdown({...request,destination},deps);assert.equal(await fs.readFile(destination,'utf8'),request.html);
});

test('browser exports still render and use download or print without a desktop chooser',async()=>{
  const {exportMarkdownDocument}=await import('../src/markdown-export.js');
  const result=await exportMarkdownDocument({format:'pdf',source:'# Draft',name:'guide.md',api:{
    exportMarkdown:async options=>{assert.equal(options.destination,undefined);assert.equal(options.html,'printable');return {printing:true};}
  }},{render:async()=> 'printable'});
  assert.equal(result.printing,true);
});

function imageFixture(references,language='en'){
  const images=references.map(reference=>({reference,node:{alt:'Image description',replaceWith(placeholder){this.placeholder=placeholder;}}}));
  const documentRef={documentElement:{lang:language},createElement:()=>({})};
  return {images,documentRef};
}

test('a missing image referenced three times leaves three labelled placeholders and exports the rest',async()=>{
  const {embedMarkdownExportImages}=await import('../src/markdown-export.js');
  const {images,documentRef}=imageFixture(['image.png','image.png','image.png']);let reads=0;
  const missing=await embedMarkdownExportImages({images,documentRef,documentPath:'/work/info.md',readAsset:async()=>{reads++;throw new Error('ENOENT');}});
  assert.deepEqual(missing,['image.png']);assert.equal(reads,1);
  for(const {node} of images){assert.equal(node.src,undefined);assert.equal(node.placeholder.textContent,'Image unavailable: image.png (Image description)');}
});

test('available images remain embedded when another image is missing, and HTTPS images stay external',async()=>{
  const {embedMarkdownExportImages}=await import('../src/markdown-export.js');
  const {images,documentRef}=imageFixture(['good.png','missing.png','good.png','https://example.com/image.png']);
  const url='data:image/png;base64,AA==';let reads=0;
  const missing=await embedMarkdownExportImages({images,documentRef,documentPath:'/work/info.md',readAsset:async({reference})=>{
    reads++;if(reference==='missing.png')throw new Error('ENOENT');return {url,bytes:1};
  }});
  assert.deepEqual(missing,['missing.png']);assert.equal(reads,2);
  assert.equal(images[0].node.src,url);assert.equal(images[2].node.src,url);assert.equal(images[3].node.src,'https://example.com/image.png');
  assert.ok(images[1].node.placeholder);assert.equal(images[0].node.loading,'eager');
});

test('unavailable images do not bypass folder boundaries and Portuguese placeholders retain their reference',async()=>{
  const {embedMarkdownExportImages}=await import('../src/markdown-export.js');
  const {images,documentRef}=imageFixture(['../private.png'],'pt-PT');
  const missing=await embedMarkdownExportImages({images,documentRef,documentPath:'/work/info.md',root:'/work',readAsset:async()=>assert.fail('Outside-workspace images must not be read')});
  assert.deepEqual(missing,['../private.png']);assert.match(images[0].node.placeholder.textContent,/Imagem indisponível: \.\.\/private\.png/);
});

test('source, image-count and total embedded-image limits still stop oversized exports',async()=>{
  const {embedMarkdownExportImages,markdownExportHTML}=await import('../src/markdown-export.js');
  await assert.rejects(markdownExportHTML({source:'x'.repeat(1024*1024+1),documentRef:{}}),/1 MiB/);
  const tooMany=imageFixture(Array(65).fill('good.png'));
  await assert.rejects(embedMarkdownExportImages({...tooMany,documentPath:'/work/info.md'}),/64 images/);
  const tooLarge=imageFixture(['1.png','2.png','3.png','4.png','5.png']);
  await assert.rejects(embedMarkdownExportImages({...tooLarge,documentPath:'/work/info.md',readAsset:async()=>({url:'data:image/png;base64,AA==',bytes:5*1024*1024})}),/20 MiB/);
});

test('successful exports report the saved path and unavailable image references together',async()=>{
  const {exportMarkdownDocument}=await import('../src/markdown-export.js');
  for(const format of ['html','pdf']){
    const result=await exportMarkdownDocument({format,source:'# Draft',name:'info.md',api:{
      chooseMarkdownExport:async()=>({path:'/output/info.'+format}),
      exportMarkdown:async options=>{assert.equal(options.html,'with placeholders');return {path:options.destination};}
    }},{render:async options=>{options.onMissingImage('image.png');options.onMissingImage('image.png');return 'with placeholders';}});
    assert.equal(result.path,'/output/info.'+format);assert.deepEqual(result.missingImages,['image.png']);
  }
});

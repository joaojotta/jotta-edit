'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
test('font files load as bounded binary previews on desktop and in workspace archives',async t=>{
  const {readFont}=require('../electron/font-files.cjs');
  const {fontType,fontData,FONT_LIMIT,readOnlyDocument}=await import('../shared/font-files.mjs');
  const {fileByteLimit}=await import('../shared/image-files.mjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-fonts-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const bytes=Buffer.from([0,1,0,0,255,10]);
  for(const ext of ['TTF','otf','woff','woff2']){
    const file=path.join(root,'preview.'+ext);await fs.writeFile(file,bytes);
    const doc=await readFont(file);assert.equal(doc.content,'');assert.equal(doc.font.type,fontType(file));
    assert.deepEqual(Buffer.from(doc.font.url.split(',')[1],'base64'),bytes);assert.equal(readOnlyDocument(doc),true);
    assert.equal(fileByteLimit(file),FONT_LIMIT);
  }
  assert.equal(await readFont('/unrelated.txt'),null);assert.equal(fontType('old.eot'),null);
  const large=path.join(root,'large.ttf'),file=await fs.open(large,'w');await file.truncate(FONT_LIMIT+1);await file.close();
  await assert.rejects(readFont(large),/20 MB/);assert.throws(()=>fontData('font.ttf',new Uint8Array(FONT_LIMIT+1)),/20 MB/);
  const {writeZip,readZip}=await import('../web/zip.js');
  const font=new Uint8Array(6*1024*1024);font[0]=255;
  const [entry]=await readZip(writeZip([{name:'fonts/test.woff2',content:font}]));assert.deepEqual(entry.content,font);
});
async function fixture(){
  const {installFontPreview}=await import('../src/font-preview.js');
  const {panelDom}=require('./fixtures/panel-dom.cjs');
  const {documentRef}=panelDom([]),loaded=new Set(),pending=[];
  documentRef.fonts={add:face=>loaded.add(face),delete:face=>loaded.delete(face)};
  const create=documentRef.createElement;
  documentRef.createElement=tag=>{const el=create(tag);el.appendChild=function(child){this.append(child);return child;};el.classList.add=()=>{};return el;};
  class Face{constructor(family,source){this.family=family;this.source=source;}load(){return new Promise((resolve,reject)=>pending.push({face:this,resolve:()=>resolve(this),reject}));}}
  const host=documentRef.createElement('div');
  const view=installFontPreview({host,documentRef,FontFaceClass:Face});
  const toolbar=host.children[0],status=host.children[1],content=host.children[2];
  return {view,host,loaded,pending,status,content,sample:content.children[0].children[0],size:toolbar.children[1].children[0],reset:toolbar.children[2]};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const doc=(id,url=id)=>({id,name:id+'.woff2',font:{url:'data:font/woff2;base64,'+url,type:'font/woff2',bytes:1024},dirty:false});
test('preview text and size are independent of the file and loaded fonts are released on navigation',async()=>{
  const f=await fixture(),first=doc('first');assert.equal(f.view.show(first),true);assert.equal(f.content.hidden,true);
  f.pending[0].resolve();await tick();assert.equal(f.loaded.size,1);assert.equal(f.content.hidden,false);
  f.sample.value='Olá ☕';f.sample.dispatch('input');f.view.zoom(1);assert.equal(first.fontPreview.size,50);assert.equal(first.dirty,false);
  f.size.value='999';f.size.dispatch('input');assert.equal(f.size.value,'160');
  f.view.show(doc('second'));assert.equal(f.loaded.size,0);
  f.view.show(first);assert.equal(f.sample.value,'Olá ☕');assert.equal(f.size.value,'160');
  f.pending[1].resolve();await tick();assert.equal(f.loaded.size,0,'late font loads must not attach to another tab');
  f.pending[2].resolve();await tick();assert.equal(f.loaded.size,1);
  f.reset.onclick();assert.equal(first.fontPreview.size,48);assert.match(f.sample.value,/quick brown fox/);
  f.view.show(null);assert.equal(f.loaded.size,0);assert.equal(f.host.hidden,true);
});
test('corrupt fonts show an error and disposed previews ignore pending loads',async()=>{
  const f=await fixture();f.view.show(doc('bad'));f.pending[0].reject(new Error('Invalid font'));await tick();
  assert.match(f.status.textContent,/Cannot preview/);assert.equal(f.content.hidden,true);
  f.view.show(doc('valid'));f.view.dispose();f.pending[1].resolve();await tick();assert.equal(f.loaded.size,0);
});

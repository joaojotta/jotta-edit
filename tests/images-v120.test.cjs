'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
test('desktop image reads preserve encoded bytes, support SVG source and enforce size limits',async t=>{
  const {readImage}=require('../electron/image-files.cjs');
  const {imageType,IMAGE_LIMIT}=await import('../shared/image-files.mjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jotta-images-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const bytes=Buffer.from([71,73,70,56,57,97,0,255,10]);
  for(const ext of ['png','jpeg','jpg','jfif','gif','apng','webp','avif','bmp','ico']){
    const file=path.join(root,'image.'+ext);await fs.writeFile(file,bytes);
    const data=await readImage(file);assert.equal(data.content,'');assert.equal(data.image.type,imageType(file));
    assert.deepEqual(Buffer.from(data.image.url.split(',')[1],'base64'),bytes);
  }
  const svg=path.join(root,'drawing.SVG'),code='<svg xmlns="http://www.w3.org/2000/svg"><text>☕</text></svg>';
  await fs.writeFile(svg,code);assert.equal((await readImage(svg)).content,code);
  const huge=path.join(root,'huge.png');const handle=await fs.open(huge,'w');await handle.truncate(IMAGE_LIMIT+1);await handle.close();
  await assert.rejects(readImage(huge),/20 MB/);assert.equal(await readImage(path.join(root,'other.bin')),null);
});
test('expanded typography settings round trip and reject values above the new limits',async()=>{
  const {parseSettingsImport}=await import('../src/settings-transfer.js');
  const settings={fontsize:72,uiFontSize:32,explorerFontSize:48,markdownFontSize:72};
  const file=preferences=>JSON.stringify({format:'jotta-edit-settings',version:1,preferences});
  assert.deepEqual(parseSettingsImport(file(settings)),settings);
  for(const [key,value] of Object.entries(settings))assert.throws(()=>parseSettingsImport(file({[key]:value+1})),/Invalid/);
});
test('workspace ZIP backups preserve larger images while keeping text limits',async()=>{
  const {writeZip,readZip}=await import('../web/zip.js');
  const bytes=new Uint8Array(6*1024*1024);bytes[0]=137;bytes[1]=80;
  const archive=writeZip([{name:'images/photo.png',content:bytes}]);
  const [file]=await readZip(archive);assert.equal(file.name,'images/photo.png');assert.deepEqual(file.content,bytes);
  assert.throws(()=>writeZip([{name:'too-large.txt',content:bytes}]),/browser file limits/);
});
test('bundled colour emoji includes coffee and supplementary emoji glyphs',async()=>{
  // Parse the TrueType cmap directly, verifying the bundled asset rather than system fonts.
  const font=await fs.readFile(path.join(__dirname,'../public/fonts/NotoColorEmoji.ttf'));
  let cmap;
  for(let i=0;i<font.readUInt16BE(4);i++){
    const entry=12+i*16;if(font.toString('ascii',entry,entry+4)==='cmap')cmap=font.readUInt32BE(entry+8);
  }
  assert.ok(cmap);
  let groups=[];
  for(let i=0;i<font.readUInt16BE(cmap+2);i++){
    const offset=cmap+font.readUInt32BE(cmap+4+i*8+4);
    if(font.readUInt16BE(offset)!==12)continue;
    for(let j=0;j<font.readUInt32BE(offset+12);j++)groups.push([font.readUInt32BE(offset+16+j*12),font.readUInt32BE(offset+20+j*12)]);
  }
  for(const symbol of ['☕','😀','🚀','🫶'])assert.ok(groups.some(([start,end])=>symbol.codePointAt(0)>=start&&symbol.codePointAt(0)<=end),symbol);
});

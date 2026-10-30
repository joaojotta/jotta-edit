'use strict';
const fs=require('./project-fs.cjs');
async function readFont(file) {
  const {fontType,fontData,FONT_LIMIT}=await import('../shared/font-files.mjs');
  if (!fontType(file)) return null;
  const stat=await fs.stat(file);
  if (!stat.isFile()) throw new Error('Not a regular file');
  if (stat.size>FONT_LIMIT) throw new Error('Font exceeds the 20 MB limit');
  const bytes=await fs.readFile(file);
  return {path:file,content:'',font:fontData(file,bytes),mtimeMs:stat.mtimeMs};
}
module.exports={readFont};

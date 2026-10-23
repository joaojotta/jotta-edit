'use strict';
const fs=require('./project-fs.cjs');
const path=require('node:path');
async function readMarkdownAsset({reference,documentPath,root}={}){
  const {markdownTarget,markdownImageType}=await import('../shared/markdown-paths.mjs'),target=markdownTarget(reference,documentPath,root);
  const type=target?.kind==='file'&&markdownImageType(target.path);
  if(!type)throw new Error('Only local image files can be loaded in Markdown preview.');
  const [scope,file]=await Promise.all([fs.realpath(target.scope),fs.realpath(target.path)]),relative=path.relative(scope,file);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Image is outside the Markdown folder or workspace.');
  const stat=await fs.stat(file);if(!stat.isFile()||stat.size>5*1024*1024)throw new Error('Markdown images must be files up to 5 MiB.');
  const bytes=await fs.readFile(file);if(bytes.length>5*1024*1024)throw new Error('Markdown image exceeds 5 MiB.');
  return {url:'data:'+type+';base64,'+bytes.toString('base64'),bytes:bytes.length};
}
module.exports={readMarkdownAsset};

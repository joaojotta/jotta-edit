export function externalMarkdownLink(value){
  if(typeof value!=='string'||value.length>4096||/[\x00-\x1f\x7f]/.test(value))return null;
  try{const url=new URL(value);return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
function normalize(value){
  if(typeof value!=='string')return null;
  const path=value.replace(/\\/g,'/'),prefix=/^[a-z]:\//i.test(path)?path.slice(0,2)+'/':path.startsWith('//')?'//':path.startsWith('/')?'/':'';
  if(!prefix)return null;
  const parts=[];for(const part of path.slice(prefix.length).split('/')){if(part==='..'){if(!parts.length)return null;parts.pop();}else if(part&&part!=='.')parts.push(part);}
  return prefix+parts.join('/');
}
function inside(root,path){const fold=value=>/^[a-z]:|^\/\//i.test(root)?value.toLowerCase():value;return fold(path)===fold(root)||fold(path).startsWith(fold(root).replace(/\/$/,'')+'/');}
export function markdownTarget(reference,documentPath,workspaceRoot){
  if(typeof reference!=='string'||reference.length>4096||/[\x00-\x1f\x7f]/.test(reference))return null;
  const external=externalMarkdownLink(reference);if(external)return {kind:'external',url:external};
  if(reference.startsWith('#')){try{return {kind:'anchor',fragment:decodeURIComponent(reference.slice(1))};}catch{return null;}}
  if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference))return null;
  const doc=documentPath?normalize(documentPath):null,workspace=workspaceRoot?normalize(workspaceRoot):null;
  const parent=doc?.slice(0,doc.lastIndexOf('/')+1)||null;
  const folder=parent&&(parent==='/'||/^[a-z]:\/$/i.test(parent)?parent:parent.replace(/\/$/,''));
  const scope=workspace&&(!doc||inside(workspace,doc))?workspace:folder;
  if(!scope)return null;
  let relative,fragment;
  try{relative=decodeURIComponent(reference.split(/[?#]/)[0]);fragment=decodeURIComponent(reference.includes('#')?reference.slice(reference.indexOf('#')+1):'');}catch{return null;}
  if(!relative||/[\\\x00-\x1f\x7f]/.test(relative)||/^[a-z][a-z0-9+.-]*:|^\/\//i.test(relative))return null;
  const base=relative.startsWith('/')?scope:(folder||scope),path=normalize(base+'/'+relative.replace(/^\//,''));
  return path&&inside(scope,path)?{kind:'file',path,scope,fragment}:null;
}

export const markdownImageTypes=Object.freeze({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',svg:'image/svg+xml',bmp:'image/bmp',ico:'image/x-icon'});
export function markdownImageType(path){return markdownImageTypes[path.split('.').at(-1).toLowerCase()]||null;}

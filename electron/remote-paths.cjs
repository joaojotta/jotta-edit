'use strict';
const path=require('node:path').posix;
function remotePath(value){
  if(typeof value!=='string'||!value.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(value))throw new Error('Unsupported remote path.');
  return path.normalize(value);
}
const within=(root,file)=>root==='/'||file===root||file.startsWith(root+'/');
// Resolve links one component at a time so the final path and all operations
// stay inside the selected server folder. The server still enforces its ACLs.
async function resolveRemotePath(client,file,root='/',{missingLeaf=false,followLeaf=true}={}){
  root=remotePath(root);file=remotePath(file);
  if(!within(root,file))throw new Error('Folder link is outside this workspace. Open its target folder directly.');
  let parts=path.relative(root,file).split('/').filter(Boolean),current=root,links=0;
  const seen=new Set();
  for(let i=0;i<parts.length;i++){
    current=path.join(current,parts[i]);let stat;
    try{stat=await client.stat(current);}catch(error){if(missingLeaf&&i===parts.length-1&&['ENOENT',2].includes(error.code))return current;throw error;}
    if(stat.isSymbolicLink()){
      if(!followLeaf&&i===parts.length-1)return current;
      if(++links>40||seen.has(current))throw new Error('Folder link forms a loop.');seen.add(current);
      const target=client.readlink?await client.readlink(current):undefined;
      if(target!=null&&(typeof target!=='string'||/[\\\x00-\x1f\x7f]/.test(target)))throw new Error('The server cannot resolve this folder link. Open its target folder directly.');
      const directory=client.directoryLinkPath?await client.directoryLinkPath(current,target):null;
      if(!directory&&!target)throw new Error('The server cannot resolve this folder link. Open its target folder directly.');
      const resolved=directory?remotePath(directory):path.resolve(path.dirname(current),target);
      if(!within(root,resolved))throw new Error('Folder link is outside this workspace. Open its target folder directly.');
      // A chrooted FTP server may confirm the alias itself as its usable path.
      if(directory&&resolved===current)continue;
      parts=[...path.relative(root,resolved).split('/').filter(Boolean),...parts.slice(i+1)];current=root;i=-1;
    }else if(i<parts.length-1&&!stat.isDirectory())throw new Error('Not a folder');
  }
  return current;
}
module.exports={resolveRemotePath};

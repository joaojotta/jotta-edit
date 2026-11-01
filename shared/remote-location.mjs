export function remoteLocation(value,credentials={}) {
  if(!credentials||typeof credentials!=='object'||Array.isArray(credentials))throw new Error('Enter a valid username and password.');
  const {username='',password=''}=credentials;
  if([username,password].some(value=>typeof value!=='string'||value.length>4096||/[\x00-\x1f\x7f]/.test(value)))throw new Error('Enter a valid username and password.');
  try{encodeURIComponent(username);encodeURIComponent(password);}catch{throw new Error('Enter a valid username and password.');}
  if(typeof value!=='string'||value.length>4096||/[\x00-\x1f\x7f]/.test(value)||! /^(ftp|sftp|smb):\/\//i.test(value.trim()))
    throw new Error('Enter an ftp://, sftp:// or smb:// folder address.');
  let url;
  try {url=new URL(value.trim());} catch {throw new Error('Enter a valid remote folder address.');}
  if(!url.hostname||url.search||url.hash)throw new Error('Use a server and folder path without a query or fragment.');
  if(url.password)throw new Error('Leave passwords out of the address. Use the Password field.');
  if(username)url.username=encodeURIComponent(username);
  if(password&&!url.username)throw new Error('Enter a username when providing a password.');
  let parts;
  try {parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);decodeURIComponent(url.username);}
  catch {throw new Error('The remote address contains invalid encoded characters.');}
  if(parts.some(part=>/[\\/\x00-\x1f\x7f]/.test(part)||part==='.'||part==='..')||/[\x00-\x1f\x7f]/.test(decodeURIComponent(url.username)))
    throw new Error('The remote folder path contains unsupported characters.');
  if(url.protocol==='smb:'&&!parts.length)throw new Error('Include the SMB share name, for example smb://server/share.');
  if(!url.pathname)url.pathname='/';
  return {uri:url.href,protocol:url.protocol.slice(0,-1),hostname:url.hostname,port:url.port,parts};
}

export function smbPath(location) {
  if(location.protocol!=='smb'||location.port||! /^[a-z0-9_.-]+$/i.test(location.hostname)||location.parts.some(part=>/[<>:"|?*]/.test(part)))
    throw new Error('Map this SMB share with the operating system, then choose the mounted folder.');
  return '\\\\'+location.hostname+'\\'+location.parts.join('\\');
}

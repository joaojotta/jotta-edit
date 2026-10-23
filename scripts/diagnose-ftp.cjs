#!/usr/bin/env node
'use strict';
const {Client}=require('basic-ftp');
const {RemoteFolders}=require('../electron/remote-folders.cjs');
const {listFolderTree}=require('../electron/folder-tree.cjs');

const flag=(entry,key)=>typeof entry[key]==='function'?entry[key]():!!entry[key];
function summary(entries){
  return {
    entries:entries.length,
    files:entries.filter(x=>flag(x,'isFile')).length,
    folders:entries.filter(x=>flag(x,'isDirectory')).length,
    links:entries.filter(x=>flag(x,'isSymbolicLink')).length,
    unknown:entries.filter(x=>!flag(x,'isFile')&&!flag(x,'isDirectory')&&!flag(x,'isSymbolicLink')).length,
    hidden:entries.filter(x=>x.name.startsWith('.')).length,
    unsafeNames:entries.filter(x=>x.name==='.'||x.name==='..'||/[\\/\x00-\x1f\x7f]/.test(x.name)).length
  };
}
// Reports contain counts and fixed labels, never server text, paths, filenames
// or credentials. Read-only probes do not download or modify server files.
const failure=error=>({ok:false,...(Number.isInteger(error.code)?{replyCode:error.code}:{}),
  ...(String(error.message).includes('only supports MLSD')?{unsupportedListingFormat:true}:{})});
async function inspectFtp({address,username='',password='',write=report=>console.log(JSON.stringify(report))}){
  const {remoteLocation}=await import('../shared/remote-location.mjs');
  const location=remoteLocation(address,{username,password});
  if(location.protocol!=='ftp')throw new Error('This diagnostic requires an ftp:// address.');
  const url=new URL(location.uri),target='/'+location.parts.join('/');
  const client=new Client(15000);let rawStats={};
  const parser=client.parseList;
  client.parseList=raw=>{
    rawStats={rawBytes:Buffer.byteLength(raw),rawLines:raw.split(/\r?\n/).filter(x=>x.trim()).length};
    return parser(raw);
  };
  try{
    await client.access({host:url.hostname.replace(/^\[|\]$/g,''),port:Number(url.port)||21,
      user:decodeURIComponent(url.username)||'anonymous',password});
    const initial=await client.pwd(),commands=[...client.availableListCommands];
    const probe=async(label,operation)=>{
      rawStats={};
      try{const entries=await operation();write({probe:label,ok:true,...rawStats,...summary(entries)});}
      catch(error){write({probe:label,...rawStats,...failure(error)});}
    };
    await probe('path-argument listing',async()=>{client.availableListCommands=[...commands];return client.list(target);});
    for(const command of ['default','MLSD','LIST -a','LIST','NLST']){
      await probe('CWD then '+command,async()=>{
        await client.cd(target);
        client.availableListCommands=command==='default'?[...commands]:[command];
        if(command==='NLST')client.parseList=raw=>{
          rawStats={rawBytes:Buffer.byteLength(raw),rawLines:raw.split(/\r?\n/).filter(x=>x.trim()).length};
          return raw.split(/\r?\n/).filter(x=>x&&x!=='.'&&x!=='..').map(name=>({name}));
        };
        const entries=await client.list();
        const actual=await client.pwd();
        write({probe:'directory check: '+command,changedFromLogin:actual!==initial,matchesRequested:actual===target});
        return entries;
      });
    }
  }catch(error){write({probe:'FTP connection',...failure(error)});}
  finally{client.close();}

  const remote=new RemoteFolders({timeout:15000});
  try{
    const {root}=await remote.connect(location.uri,AbortSignal.timeout(20000),{password});
    const entries=await remote.readdir(root,{withFileTypes:true});
    write({probe:'application filesystem',ok:true,...summary(entries)});
    const ignored=new Set(['.git','.svn','.hg','node_modules','vendor','.venv','venv','dist','build','.next','.cache','target','__pycache__']);
    for(const showHidden of [false,true]){
      const listing=await listFolderTree(root,{io:remote,shallow:true,showHidden,ignoreDirs:ignored});
      write({probe:showHidden?'Explorer with hidden files':'Explorer default',ok:true,
        visibleEntries:listing.nodes.length,visibleFiles:listing.count,truncated:listing.truncated});
    }
  }catch(error){write({probe:'application filesystem',...failure(error)});}
  finally{await remote.close();}
}
async function main(){
  const readline=require('node:readline/promises'),{Writable}=require('node:stream');
  let muted=false;
  const output=new Writable({write(chunk,_encoding,done){if(!muted)process.stdout.write(chunk);done();}});
  const input=readline.createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
  let address,username,password;
  console.log('Read-only FTP listing diagnostic. No filenames, paths or passwords are included in the report.');
  try{
    address=(await input.question('FTP folder address (include /public_html): ')).trim();
    username=(await input.question('Username (blank to use address username or anonymous): ')).trim()||decodeURIComponent(new URL(address).username)||'anonymous';
    process.stdout.write('Password (hidden): ');muted=true;
    password=await input.question('');
  }finally{muted=false;input.close();process.stdout.write('\n');}
  await inspectFtp({address,username,password});
}
if(require.main===module){
  if(process.argv.length>2)console.log('Usage: node scripts/diagnose-ftp.cjs\nEnter the FTP folder address and credentials at the prompts, without putting passwords in the address.');
  else main().catch(()=>{console.error('Diagnostic could not finish. Check the FTP address and input, then retry.');process.exitCode=1;});
}
module.exports={inspectFtp};

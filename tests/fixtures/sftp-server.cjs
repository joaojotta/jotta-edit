'use strict';
const {Server,utils:{sftp:{STATUS_CODE}}}=require('ssh2');
const {generateKeyPairSync}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const hostKey=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
async function startSftp(root){
  const clients=new Set();
  const server=new Server({hostKeys:[hostKey]},client=>{
    clients.add(client);client.on('error',()=>{});client.on('close',()=>clients.delete(client));
    client.on('authentication',ctx=>ctx.method==='password'&&ctx.username==='test'&&ctx.password==='test-password'?ctx.accept():ctx.reject());
    client.on('ready',()=>client.on('session',accept=>accept().on('sftp',accept=>{
      const stream=accept(),handles=new Map();let sequence=0;
      // ssh2's test server sends a fixed VERSION packet with no extensions.
      // Advertise the POSIX rename handler implemented below on the wire.
      const send=stream._protocol.channelData;
      stream._protocol.channelData=function(id,data){
        if(data.length===9&&data[4]===2&&data.readUInt32BE(0)===5){
          const name=Buffer.from('posix-rename@openssh.com'),extension=Buffer.alloc(8+name.length+1);
          extension.writeUInt32BE(name.length,0);name.copy(extension,4);extension.writeUInt32BE(1,4+name.length);extension[extension.length-1]=49;
          data=Buffer.concat([data,extension]);data.writeUInt32BE(data.length-4,0);
        }
        return send.call(this,id,data);
      };
      const local=value=>{const result=path.resolve(root,'.'+value);if(result!==root&&!result.startsWith(root+path.sep))throw new Error('Outside root');return result;};
      const fail=(id,e)=>stream.status(id,e.code==='ENOENT'?STATUS_CODE.NO_SUCH_FILE:e.code==='EACCES'?STATUS_CODE.PERMISSION_DENIED:STATUS_CODE.FAILURE);
      const handle=object=>{const key=String(++sequence);handles.set(key,object);return Buffer.from(key);};
      const stat=s=>({mode:s.mode,uid:s.uid,gid:s.gid,size:s.size,atime:Math.floor(s.atimeMs/1000),mtime:Math.floor(s.mtimeMs/1000)});
      const on=(name,fn)=>stream.on(name,(id,...args)=>Promise.resolve().then(()=>fn(id,...args)).catch(e=>fail(id,e)));
      on('REALPATH',async(id,p)=>stream.name(id,[{filename:p==='.'?'/':p,longname:p,attrs:{}}]));
      on('STAT',async(id,p)=>stream.attrs(id,stat(await fs.stat(local(p)))));
      on('LSTAT',async(id,p)=>stream.attrs(id,stat(await fs.lstat(local(p)))));
      on('READLINK',async(id,p)=>{const target=await fs.readlink(local(p));stream.name(id,[{filename:target,longname:target,attrs:{}}]);});
      on('FSTAT',async(id,h)=>stream.attrs(id,stat(await handles.get(h.toString()).stat())));
      on('OPENDIR',async(id,p)=>{
        const dir=local(p),names=await fs.readdir(dir);
        const items=await Promise.all(names.map(async name=>{const info=await fs.lstat(path.join(dir,name));return {filename:name,longname:(info.isDirectory()?'d':info.isSymbolicLink()?'l':'-')+'rwxr-xr-x 1 test test 0 Jan 1 00:00 '+name,attrs:stat(info)};}));
        stream.handle(id,handle({items}));
      });
      on('READDIR',async(id,h)=>{const dir=handles.get(h.toString());if(dir.items.length){stream.name(id,dir.items);dir.items=[];}else stream.status(id,STATUS_CODE.EOF);});
      on('OPEN',async(id,p,flags,attrs)=>{const {flagsToString}=require('ssh2').utils.sftp;const file=await fs.open(local(p),flagsToString(flags),attrs.mode);stream.handle(id,handle(file));});
      on('READ',async(id,h,offset,length)=>{const bytes=Buffer.alloc(length),result=await handles.get(h.toString()).read(bytes,0,length,offset);result.bytesRead?stream.data(id,bytes.subarray(0,result.bytesRead)):stream.status(id,STATUS_CODE.EOF);});
      on('WRITE',async(id,h,offset,bytes)=>{await handles.get(h.toString()).write(bytes,0,bytes.length,offset);stream.status(id,STATUS_CODE.OK);});
      on('CLOSE',async(id,h)=>{const value=handles.get(h.toString());await value?.close?.();handles.delete(h.toString());stream.status(id,STATUS_CODE.OK);});
      on('MKDIR',async(id,p)=>{await fs.mkdir(local(p));stream.status(id,STATUS_CODE.OK);});
      on('REMOVE',async(id,p)=>{await fs.unlink(local(p));stream.status(id,STATUS_CODE.OK);});
      on('RENAME',async(id,a,b)=>{await fs.rename(local(a),local(b));stream.status(id,STATUS_CODE.OK);});
      on('EXTENDED',async(id,name,...args)=>{if(name==='posix-rename@openssh.com'){const data=args[0],length=data.readUInt32BE(0),from=data.subarray(4,4+length).toString(),offset=4+length,to=data.subarray(offset+4,offset+4+data.readUInt32BE(offset)).toString();await fs.rename(local(from),local(to));stream.status(id,STATUS_CODE.OK);}else stream.status(id,STATUS_CODE.OP_UNSUPPORTED);});
    })));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {port:server.address().port,close:async()=>{for(const client of clients)client.end();await new Promise(resolve=>server.close(resolve));}};
}
module.exports={startSftp};

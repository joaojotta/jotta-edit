// Narrow extensions to the pinned smb3-client 0.2 API: exclusive staging,
// reparse-point metadata and atomic replacement. Reuse its signed/encrypted
// transport and wire codecs; do not modify installed package sources.
import {Client} from 'smb3-client';
const base=import.meta.resolve('smb3-client');
const [{Open},{writeAll},{metaToStat},{splitSharePath,toSmbPath},{FileAccess,ShareAccess,CreateDisposition,CreateOptions},setInfo,commands,{SmbError}]=await Promise.all([
  import(new URL('./open/open.js',base)),import(new URL('./open/write.js',base)),import(new URL('./open/query.js',base)),import(new URL('./paths.js',base)),
  import(new URL('./wire/structs/create.js',base)),import(new URL('./wire/structs/setInfo.js',base)),import(new URL('./wire/commands.js',base)),import(new URL('./errors.js',base))
]);
export class SmbClient extends Client {
  async withFile(file,options,operation){
    const {share,rest}=splitSharePath(file),tree=await this.treeFor(share);
    const open=await Open.create(tree,{filename:toSmbPath(rest),shareAccess:ShareAccess.READ|ShareAccess.WRITE|ShareAccess.DELETE,fileAttributes:0,...options});
    let failed=false;
    try{return await operation(open,tree);}catch(error){failed=true;throw error;}
    finally{try{await open.close();}catch(error){if(!failed)throw error;}}
  }
  stat(file){return this.withFile(file,{desiredAccess:FileAccess.FILE_READ_ATTRIBUTES,createDisposition:CreateDisposition.OPEN,createOptions:0x00200000},open=>metaToStat(open.meta));}
  writeExclusive(file,bytes){return this.withFile(file,{desiredAccess:FileAccess.FILE_WRITE_DATA|FileAccess.FILE_READ_ATTRIBUTES,createDisposition:CreateDisposition.CREATE,createOptions:CreateOptions.NON_DIRECTORY_FILE|CreateOptions.WRITE_THROUGH},open=>writeAll(open,0n,bytes));}
  renameReplace(from,to,replace){
    if(!replace)return super.rename(from,to);
    const source=splitSharePath(from),target=splitSharePath(to);
    if(source.share!==target.share)throw new Error('Cannot rename across SMB shares.');
    return this.withFile(from,{desiredAccess:FileAccess.DELETE|FileAccess.FILE_READ_ATTRIBUTES,createDisposition:CreateDisposition.OPEN,createOptions:0},async(open,tree)=>{
      const buffer=setInfo.encodeFileRenameInformation({replaceIfExists:true,fileName:toSmbPath(target.rest)});
      const body=setInfo.encodeSetInfoRequest({infoType:1,fileInformationClass:10,fileId:open.fileId,buffer});
      const signing=tree.session.makeSigning();
      const response=await tree.conn.send(commands.SmbCommand.SET_INFO,body,{sessionId:tree.session.sessionId,treeId:tree.treeId,...(signing?{signing}:{}),encrypt:tree.encryptRequired,creditCharge:1});
      if(!commands.isSuccess(response.header.status))throw new SmbError({status:response.header.status,message:'SMB replacement failed.'});
    });
  }
  destroy(){this.conn?.close();this.conn?.transport?.socket?.destroy();}
}

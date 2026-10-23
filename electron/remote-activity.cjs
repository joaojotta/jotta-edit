'use strict';
const {randomUUID}=require('node:crypto');
const KNOWN_ERRORS=new Set([
  'File changed on the server. Compare or reload it before saving.',
  'Cannot verify the remote file. Your buffer is still unsaved. Reconnect before saving.',
  'The remote write could not be verified. Your buffer is still unsaved. Check the server file before retrying.',
  'Remote operation timed out. Reconnect and try again.',
  'Remote folder is disconnected. Use Open Remote Folder to reconnect.',
  'Remote access denied. Check server permissions.',
  'Remote entry does not exist.',
  'Destination already exists.',
  'File exceeds the 5 MB editor limit'
]);
class RemoteActivity {
  constructor({changed=()=>{},now=Date.now}={}){this.changed=changed;this.now=now;this.connections=new Map();this.operations=new Map();this.lastProgress=0;this.revision=0;}
  snapshot(){return {revision:this.revision,connections:[...this.connections.values()].map(c=>({...c})),operations:[...this.operations.values()].map(o=>({...o}))};}
  emit(){++this.revision;try{this.changed(this.snapshot());}catch{/* The UI must not break filesystem operations. */}}
  connection(root,uri,status){
    this.connections.set(root,{root,uri,status,canReconnect:status==='connected'||this.connections.get(root)?.canReconnect===true,updated:this.now()});
    if(this.connections.size>50)for(const [id,c] of this.connections){if(id!==root&&!['connected','connecting'].includes(c.status)){this.connections.delete(id);if(this.connections.size<=50)break;}}
    this.emit();
  }
  start(root,file,kind){
    const id=randomUUID();this.operations.set(id,{id,root,file,kind,status:'queued',phase:'Waiting',transferred:0,total:null,started:this.now(),retryable:false});this.prune();this.emit();return id;
  }
  update(id,change,progress=false){
    const entry=this.operations.get(id);if(!entry||['completed','failed'].includes(entry.status))return;
    const phaseChanged=change.phase&&entry.phase!==change.phase,totalChanged=change.total!==undefined&&entry.total!==change.total;
    Object.assign(entry,change);
    if(!progress||phaseChanged||totalChanged||this.now()-this.lastProgress>=100){this.lastProgress=this.now();this.emit();}
  }
  finish(id,cause){
    const entry=this.operations.get(id);if(!entry)return;
    Object.assign(entry,{status:cause?'failed':'completed',phase:cause?'Failed':'Complete',finished:this.now(),retryable:!!cause&&['read','list','save'].includes(entry.kind),error:cause?(KNOWN_ERRORS.has(cause.message)?cause.message:'Remote operation failed. Check the connection and server permissions.'):''});this.prune();this.emit();
  }
  prune(){
    const finished=[...this.operations.values()].filter(o=>['failed','completed'].includes(o.status));
    for(const entry of finished.slice(0,Math.max(0,finished.length-60)))this.operations.delete(entry.id);
  }
  dismiss(id){const entry=this.operations.get(id);if(entry&&['failed','completed'].includes(entry.status))this.operations.delete(id);this.emit();}
  clearCompleted(){for(const [id,entry] of this.operations)if(entry.status==='completed')this.operations.delete(id);this.emit();}
}
module.exports={RemoteActivity};

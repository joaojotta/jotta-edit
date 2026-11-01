'use strict';
let buf = Buffer.alloc(0);
const documents=new Map();
const stubborn=process.argv.includes('--ignore-shutdown');
if(stubborn){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);}
const descendant=process.argv.includes('--fork-child')?require('node:child_process').spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdin.resume();"],{stdio:'inherit'}):null;
function send(id, result) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, result }), 'utf8');
  process.stdout.write(Buffer.from(`Content-Length: ${body.length}\r\n\r\n`));
  process.stdout.write(body);
}
process.stdin.on('data', chunk => {
  buf = Buffer.concat([buf, chunk]);
  while (true) {
    const end = buf.indexOf('\r\n\r\n');
    if (end < 0) return;
    const match = /Content-Length:\s*(\d+)/i.exec(buf.subarray(0,end).toString('ascii'));
    if (!match) throw new Error('missing length');
    const len = Number(match[1]);
    if (buf.length < end + 4 + len) return;
    const msg = JSON.parse(buf.subarray(end+4,end+4+len).toString('utf8'));
    buf = buf.subarray(end+4+len);
    if (msg.method === 'initialize') send(msg.id, { capabilities: { completionProvider: {},textDocumentSync:{openClose:true,change:2},definitionProvider:true,renameProvider:true,testChildPid:descendant?.pid } });
    if(msg.method==='shutdown')send(msg.id,null);
    if(msg.method==='exit'&&!stubborn)process.exit(0);
    if (msg.method === 'textDocument/completion') send(msg.id, [{ label: 'fakeCompletion', kind: 3, insertText: 'fakeCompletion' }]);
    if(msg.method==='textDocument/didOpen')documents.set(msg.params.textDocument.uri,msg.params.textDocument);
    if(msg.method==='textDocument/didChange'){
      const document=documents.get(msg.params.textDocument.uri),change=msg.params.contentChanges[0];
      if(!change.range)throw new Error('Expected incremental document changes');
      document.text=change.text;document.version=msg.params.textDocument.version;
    }
    if(['textDocument/didOpen','textDocument/didChange'].includes(msg.method)){
      const document=documents.get(msg.params.textDocument.uri),body=Buffer.from(JSON.stringify({jsonrpc:'2.0',method:'textDocument/publishDiagnostics',params:{
        uri:document.uri,version:document.version,diagnostics:document.text.includes('bad')?[{range:{start:{line:0,character:0},end:{line:0,character:3}},severity:1,message:'Bad symbol',source:'fake'}]:[]
      }}));process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);process.stdout.write(body);
    }
    if(msg.method==='textDocument/definition')send(msg.id,[{targetUri:msg.params.textDocument.uri,targetSelectionRange:{start:{line:0,character:0},end:{line:0,character:3}},targetRange:{start:{line:0,character:0},end:{line:0,character:3}}}]);
    if(msg.method==='textDocument/rename')send(msg.id,{documentChanges:[{textDocument:{uri:msg.params.textDocument.uri,version:documents.get(msg.params.textDocument.uri).version},edits:[{range:{start:{line:0,character:0},end:{line:0,character:3}},newText:msg.params.newName}]}]});
    if(msg.method==='textDocument/didClose')documents.delete(msg.params.textDocument.uri);
  }
});

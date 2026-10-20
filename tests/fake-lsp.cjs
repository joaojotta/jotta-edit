'use strict';
let buf = Buffer.alloc(0);
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
    if (msg.method === 'initialize') send(msg.id, { capabilities: { completionProvider: {} } });
    if (msg.method === 'textDocument/completion') send(msg.id, [{ label: 'fakeCompletion', kind: 3, insertText: 'fakeCompletion' }]);
  }
});

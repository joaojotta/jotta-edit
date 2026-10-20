/** Dependency-free ZIP store writer and bounded ZIP reader for browser project backups. */
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_FILES = 2000, MAX_FILE = 5 * 1024 * 1024, MAX_TOTAL = 40 * 1024 * 1024;
let crcTable;
function crc32(data) {
  crcTable ||= Array.from({length:256}, (_, n) => {
    for (let j=0;j<8;j++) n = n&1 ? 0xedb88320^(n>>>1) : n>>>1;
    return n>>>0;
  });
  let crc=0xffffffff;
  for (const byte of data) crc = crcTable[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function join(chunks) {
  const len = chunks.reduce((s,v) => s+v.length,0);
  const out = new Uint8Array(len); let at=0;
  for (const c of chunks) {out.set(c,at); at+=c.length;}
  return out;
}
export function safeArchivePath(name) {
  if (typeof name !== 'string' || !name || name.startsWith('/') || name.includes('\\') || name.includes('\0')) return false;
  const segments = name.split('/');
  return segments.every((segment,i) => (segment || (i === segments.length-1 && name.endsWith('/'))) && segment !== '..' && segment !== '.');
}
export function writeZip(files) {
  if (files.length > MAX_FILES) throw new Error('Too many files for a web archive');
  const chunks=[], central=[]; let offset=0, total=0;
  for (const file of files) {
    if (!safeArchivePath(file.name) || file.name.endsWith('/')) throw new Error('Invalid ZIP entry name');
    const name = encoder.encode(file.name);
    const bytes = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    if (bytes.length > MAX_FILE || (total += bytes.length) > MAX_TOTAL) throw new Error('ZIP project exceeds browser file limits');
    const crc=crc32(bytes);
    const local=new Uint8Array(30+name.length); const l=new DataView(local.buffer);
    l.setUint32(0,0x04034b50,true); l.setUint16(4,20,true); l.setUint16(6,0x800,true);
    l.setUint32(14,crc,true); l.setUint32(18,bytes.length,true); l.setUint32(22,bytes.length,true);
    l.setUint16(26,name.length,true); local.set(name,30);
    const head=new Uint8Array(46+name.length), h=new DataView(head.buffer);
    h.setUint32(0,0x02014b50,true);h.setUint16(4,20,true);h.setUint16(6,20,true);h.setUint16(8,0x800,true);
    h.setUint32(16,crc,true);h.setUint32(20,bytes.length,true);h.setUint32(24,bytes.length,true);
    h.setUint16(28,name.length,true);h.setUint32(42,offset,true);head.set(name,46);
    central.push(head);chunks.push(local,bytes);offset+=local.length+bytes.length;
  }
  const directory=join(central), end=new Uint8Array(22), e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);
  e.setUint32(12,directory.length,true);e.setUint32(16,offset,true);
  return new Blob([...chunks,directory,end],{type:'application/zip'});
}
export async function readZip(blob) {
  if (blob.size > MAX_TOTAL + MAX_FILES*300) throw new Error('ZIP archive is too large');
  const bytes=new Uint8Array(await blob.arrayBuffer()), d=new DataView(bytes.buffer);
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)
    if (d.getUint32(i,true)===0x06054b50) {eocd=i;break;}
  if(eocd<0) throw new Error('Invalid ZIP archive');
  const count=d.getUint16(eocd+10,true); if(count>MAX_FILES) throw new Error('Too many ZIP entries');
  let at=d.getUint32(eocd+16,true), total=0; const result=[];
  for(let i=0;i<count;i++) {
    if(at+46>bytes.length || d.getUint32(at,true)!==0x02014b50) throw new Error('Corrupt ZIP directory');
    const method=d.getUint16(at+10,true), size=d.getUint32(at+20,true), original=d.getUint32(at+24,true);
    const n=d.getUint16(at+28,true), extra=d.getUint16(at+30,true), comment=d.getUint16(at+32,true);
    const name=decoder.decode(bytes.subarray(at+46,at+46+n));
    const offset=d.getUint32(at+42,true);at+=46+n+extra+comment;
    if(!safeArchivePath(name) || name.endsWith('/')) continue;
    if(original>MAX_FILE || (total+=original)>MAX_TOTAL) throw new Error('ZIP extracted size exceeds browser limits');
    if(method!==0 && method!==8) throw new Error('Unsupported ZIP compression method');
    if(offset+30>bytes.length || d.getUint32(offset,true)!==0x04034b50) throw new Error('Invalid ZIP entry');
    const nameLen=d.getUint16(offset+26,true), extraLen=d.getUint16(offset+28,true);
    const pos=offset+30+nameLen+extraLen;
    if(pos+size>bytes.length) throw new Error('Truncated ZIP data');
    let data=bytes.subarray(pos,pos+size);
    if(method===8) {
      if(typeof DecompressionStream==='undefined') throw new Error('ZIP decompression is not supported in this browser');
      const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const reader=stream.getReader(), parts=[];let length=0;
      try {
        while(true) {
          const {value,done}=await reader.read();if(done)break;
          length+=value.length;
          if(length>MAX_FILE) {await reader.cancel();throw new Error('ZIP entry exceeds decompressed size limit');}
          parts.push(value);
        }
      } finally {reader.releaseLock();}
      data=join(parts);
    }
    if(data.length!==original || crc32(data)!==d.getUint32(at-(46+n+extra+comment)+16,true)) throw new Error('Corrupt ZIP entry');
    if(data.includes(0)) result.push({name,content:data});
    else {try {result.push({name,content:new TextDecoder('utf-8',{fatal:true}).decode(data)});}
      catch {result.push({name,content:data});}}
  }
  return result;
}

'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const md5=value=>createHash('md5').update(value).digest('hex');
async function startWebDav(disk,{digest=false,handle=()=>false}={}){
  const requests=[],authorization='Basic '+Buffer.from('test:test-password').toString('base64');
  const server=http.createServer(async(req,res)=>{
    requests.push({method:req.method,url:req.url,headers:req.headers});
    if(await handle(req,res))return;
    let authenticated=req.headers.authorization===authorization;
    if(digest){
      const values=Object.fromEntries([...String(req.headers.authorization||'').matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)].map(m=>[m[1],m[2]??m[3]]));
      authenticated=values.username==='test'&&values.realm==='jotta'&&values.nonce==='test-nonce'&&values.uri===req.url&&values.response===
        md5(`${md5('test:jotta:test-password')}:test-nonce:${values.nc}:${values.cnonce}:auth:${md5(req.method+':'+req.url)}`);
    }
    if(!authenticated){res.writeHead(401,{'WWW-Authenticate':digest?'Digest realm="jotta", nonce="test-nonce", qop="auth", algorithm=MD5':'Basic realm="jotta"'});res.end();return;}
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'')||'/';
      if(pathname!=='/dav'&&!pathname.startsWith('/dav/')){res.writeHead(404);res.end();return;}
      const local=path.resolve(disk,'.'+pathname.slice(4));
      if(local!==disk&&!local.startsWith(disk+path.sep)){res.writeHead(403);res.end();return;}
      const stat=await fs.stat(local).catch(()=>null);
      const fail=code=>{res.writeHead(code);res.end();};
      if(req.method==='PROPFIND'){
        if(!stat)return fail(404);
        const entry=async(url,file)=>{
          const s=await fs.stat(file),href=url.split('/').map(encodeURIComponent).join('/')+(s.isDirectory()?'/':'');
          return `<d:response><d:href>${xml(href)}</d:href><d:propstat><d:prop><d:resourcetype>${s.isDirectory()?'<d:collection/>':''}</d:resourcetype><d:getcontentlength>${s.size}</d:getcontentlength><d:getlastmodified>${s.mtime.toUTCString()}</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
        };
        const entries=[await entry(pathname,local)];
        if(req.headers.depth==='1'&&stat.isDirectory())for(const child of await fs.readdir(local))entries.push(await entry(pathname+'/'+child,path.join(local,child)));
        res.writeHead(207,{'Content-Type':'application/xml'});res.end('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">'+entries.join('')+'</d:multistatus>');return;
      }
      if(req.method==='GET'){
        if(!stat)return fail(404);if(!stat.isFile())return fail(403);
        const bytes=await fs.readFile(local);res.writeHead(200,{'Content-Length':bytes.length});res.end(bytes);return;
      }
      if(req.method==='PUT'){
        if(stat&&req.headers['if-none-match']==='*')return fail(412);
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        await fs.writeFile(local,Buffer.concat(chunks));res.writeHead(201);res.end();return;
      }
      if(req.method==='MKCOL'){
        if(stat)return fail(405);await fs.mkdir(local);res.writeHead(201);res.end();return;
      }
      if(req.method==='MOVE'){
        if(!stat)return fail(404);
        const dest=decodeURIComponent(new URL(req.headers.destination).pathname);
        if(!dest.startsWith('/dav/'))return fail(403);
        const target=path.resolve(disk,'.'+dest.slice(4));
        if(!target.startsWith(disk+path.sep))return fail(403);
        if(req.headers.overwrite==='F'&&await fs.stat(target).catch(()=>null))return fail(412);
        await fs.rename(local,target);res.writeHead(201);res.end();return;
      }
      if(req.method==='DELETE'){
        if(!stat)return fail(404);await fs.rm(local,{recursive:true});res.writeHead(204);res.end();return;
      }
      fail(405);
    }catch{if(!res.headersSent)res.writeHead(500);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}/dav`,requests,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
module.exports={startWebDav};

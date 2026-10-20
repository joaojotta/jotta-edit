import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const parent=path.dirname(fileURLToPath(import.meta.url));
function offlineBundle() {
  return {
    name:'jotta-offline-precache',
    closeBundle() {
      const dist=path.join(parent,'web-dist');
      const files=[];
      function visit(dir,relative='') {
        for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
          const item=relative?relative+'/'+entry.name:entry.name;
          if(entry.isDirectory()) visit(path.join(dir,entry.name),item);
          else if(!/^(sw\.js|.*\.map)$/.test(item))files.push('./'+item);
        }
      }
      fs.copyFileSync(path.join(parent,'web/manifest.webmanifest'),path.join(dist,'manifest.webmanifest'));
      fs.mkdirSync(path.join(dist,'icons'),{recursive:true});
      fs.copyFileSync(path.join(parent,'assets/icons/192x192.png'),path.join(dist,'icons/192.png'));
      fs.copyFileSync(path.join(parent,'assets/icons/512x512.png'),path.join(dist,'icons/512.png'));
      visit(dist);
      const version=JSON.parse(fs.readFileSync(path.join(parent,'package.json'),'utf8')).version;
      const script=`const VERSION=${JSON.stringify('jotta-edit-web-'+version+'-'+Date.now())};\nconst ASSETS=${JSON.stringify([...new Set(['./','./index.html',...files])])};\nself.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));\nself.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jotta-edit-web-')&&k!==VERSION).map(k=>caches.delete(k)))),self.clients.claim()])));\nself.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;const update=reply=>{if(reply.ok){const copy=reply.clone();caches.open(VERSION).then(c=>c.put(event.request,copy));}return reply;};if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).then(update).catch(()=>caches.match('./index.html')));return;}event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(update).catch(()=>Response.error())));});`;
      fs.writeFileSync(path.join(dist,'sw.js'),script);
    }
  };
}
export default defineConfig({
  root: path.join(parent,'web'), publicDir: path.join(parent,'public'),base:'./',
  build:{outDir:path.join(parent,'web-dist'),emptyOutDir:true,chunkSizeWarningLimit:3500,target:'es2022'},
  plugins:[offlineBundle()]
});

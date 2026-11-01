// Development service worker. The production build injects the hashed asset manifest.
const CACHE='jotta-web-dev';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});

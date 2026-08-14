/* Cut Tracker service worker */
const CACHE='cut-tracker-v2';
const SHELL=[
  './','index.html','styles.css','app.js','manifest.webmanifest',
  'icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png'
];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  // never cache the Google Sheet data — always go to network (app has its own localStorage fallback)
  if(url.hostname.includes('docs.google.com')||url.hostname.includes('googleusercontent.com'))return;
  // app shell: cache-first, refresh in background
  if(url.origin===self.location.origin){
    e.respondWith(
      caches.match(req).then(cached=>{
        const net=fetch(req).then(res=>{
          if(res&&res.status===200){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}
          return res;
        }).catch(()=>cached);
        return cached||net;
      })
    );
  }
});

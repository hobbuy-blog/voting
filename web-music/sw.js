/* CL Player service worker. Bump V to force clients to refresh the cache. */
const V="cl-player-v5";
const CORE=["./","./index.html","./manifest.webmanifest","./favicon-32.png","./apple-touch-icon.png","./apple-touch-icon-120.png","./apple-touch-icon-152.png","./apple-touch-icon-167.png","./icon-192.png","./icon-512.png","./icon-maskable-512.png"];
const FONT_CSS="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=swap";
const JSMT="https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js";
const EXT=/^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)$/;

self.addEventListener("install",e=>{e.waitUntil((async()=>{
 const c=await caches.open(V);
 await c.addAll(CORE);
 try{ /* icon font: cache the CSS and every font file it references */
  const r=await fetch(FONT_CSS),t=await r.clone().text();
  await c.put(FONT_CSS,r);
  for(const m of t.matchAll(/url\((https:[^)\s]+)\)/g)){try{await c.add(m[1])}catch(_){}}
 }catch(_){}
 try{await c.add(JSMT)}catch(_){}
 await self.skipWaiting();
})())});

self.addEventListener("activate",e=>{e.waitUntil((async()=>{
 for(const k of await caches.keys())if(k!==V)await caches.delete(k);
 await self.clients.claim();
})())});

/* cache-first, refreshed in the background (stale-while-revalidate) */
self.addEventListener("fetch",e=>{
 const q=e.request;if(q.method!=="GET")return;
 const u=new URL(q.url),same=u.origin===location.origin;
 if(!same&&!EXT.test(u.hostname))return;
 e.respondWith((async()=>{
  const c=await caches.open(V);
  const hit=await c.match(q,{ignoreSearch:same});
  const net=fetch(q).then(r=>{if(r&&(r.ok||r.type==="opaque"))c.put(q,r.clone());return r}).catch(()=>null);
  if(hit){e.waitUntil(net);return hit}
  const r=await net;if(r)return r;
  if(q.mode==="navigate"){const f=await c.match("./index.html");if(f)return f}
  return new Response("Offline",{status:503,statusText:"Offline"});
 })());
});

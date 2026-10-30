importScripts('/db.js');
const SHELL=['/','/app.js','/db.js','/style.css','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open('dot-shell-v4').then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('dot-shell-')&&key!=='dot-shell-v4')await caches.delete(key);await clients.claim();})()));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);if(u.origin!==location.origin)return;
 if(u.pathname==='/share'&&e.request.method==='POST'){e.respondWith((async()=>{
  const data=await e.request.formData(),files=data.getAll('image');
  if(files.length!==1||!(files[0] instanceof File)||!['image/png','image/jpeg'].includes(files[0].type)||files[0].size>8388608)return new Response('请只选一张 JPG 或 PNG 照片，大小不超过 8 MB。',{status:400,headers:{'Content-Type':'text/plain;charset=utf-8'}});
  const id=crypto.randomUUID();await D.put({id,file:files[0],created:Date.now(),state:'local'});return Response.redirect('/?share='+id,303);
 })());return;}
 if(e.request.method==='GET'&&SHELL.includes(u.pathname))e.respondWith(fetch(e.request).catch(()=>caches.match(u.pathname)));
});

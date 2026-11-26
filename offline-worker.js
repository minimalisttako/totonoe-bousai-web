/* ととのえ防災：v232 オフライン起動保護。ユーザーの記録データはキャッシュに含めない。 */
const CACHE='totonoe-offline-shell-v262';
const ROOT=new URL('./',self.registration.scope).href;
const PATHS=['./','./manifest.webmanifest','./assets/mascot-tako-open-v30.svg','./assets/mascot-tako-blink-v30.svg','./assets/mascot-tricera-open-v30.svg','./assets/mascot-tricera-blink-v30.svg','./assets/mascot-shimaenaga-open-v30.svg','./assets/mascot-shimaenaga-blink-v30.svg','./assets/app-icon.svg','./assets/experience-v261.js','./assets/home-sky-background.svg','./assets/chibi-icons-v232.webp','./assets/achievement-art-v244.webp','./assets/achievement-friends-and-badges-v245.webp','./assets/home-mascot-poses-v251.webp','./assets/home-trio-v260.webp','./assets/stories-v261.js','./assets/comic-v261-00.webp','./assets/comic-v261-01.webp','./assets/comic-v261-02.webp','./assets/comic-v261-03.webp','./assets/comic-v261-04.webp','./assets/comic-v261-05.webp','./assets/comic-v261-06.webp','./assets/comic-v261-07.webp','./assets/comic-v261-08.webp','./assets/comic-v261-09.webp','./assets/comic-v261-10.webp','./assets/comic-v261-11.webp','./assets/comic-v261-12.webp','./assets/comic-v261-13.webp','./assets/comic-v261-14.webp','./assets/comic-v261-15.webp','./assets/comic-v261-16.webp','./assets/comic-v261-17.webp','./assets/comic-v261-18.webp','./assets/comic-v261-19.webp','./assets/comic-v261-20.webp','./assets/comic-v261-21.webp','./assets/comic-v261-22.webp','./assets/comic-v261-23.webp','./assets/comic-v261-24.webp','./assets/comic-v261-25.webp','./assets/comic-v261-26.webp','./assets/comic-v261-27.webp','./assets/comic-v261-28.webp','./assets/comic-v261-29.webp','./assets/comic-v261-30.webp','./assets/comic-v261-31.webp','./assets/comic-v261-32.webp','./assets/comic-v261-33.webp','./assets/comic-v261-34.webp','./assets/comic-v261-35.webp','./assets/comic-v261-36.webp','./assets/comic-v261-37.webp','./assets/comic-v261-38.webp','./assets/comic-v261-39.webp'];
const URLS=PATHS.map(p=>new URL(p,ROOT).href);
const ASSETROOT=new URL('./assets/',ROOT).pathname;
const HOME=new URL('./',ROOT).pathname;
const INDEX=new URL('./index.html',ROOT).pathname;
function usable(response,html=false){return !!(response&&response.ok&&(!html||(response.headers.get('content-type')||'').includes('text/html')))}
async function offlineFetch(url,html){
 let last;
 for(let attempt=0;attempt<3;attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch(new Request(url,{cache:'reload',signal:controller.signal}));
   if(!usable(response,html))throw Error('Invalid offline file');
   if(html&&!(await response.clone().text()).includes(CACHE))throw Error('App and worker versions differ');
   return response;
  }catch(e){last=e}finally{clearTimeout(timer)}
 }throw last;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE),previous=(await caches.keys()).filter(n=>n.startsWith('totonoe-offline-shell-')&&n!==CACHE);
 for(const [i,url] of URLS.entries()){
  // SVG assets have immutable versioned paths; reuse already saved copies.
  let response=null;
  if(PATHS[i].startsWith('./assets/')){
   for(const name of previous){const old=await caches.open(name),candidate=await old.match(url);if(usable(candidate)){response=candidate;break}}
  }
  if(!response)response=await offlineFetch(url,i===0);
  await cache.put(url,response);
 }
 for(const url of URLS){if(!usable(await cache.match(url)))throw Error('Incomplete offline cache')}
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 for(const url of URLS){if(!(await cache.match(url)))throw Error('Incomplete offline cache');}
 const names=await caches.keys();
 await Promise.all(names.filter(n=>n.startsWith('totonoe-offline-shell-')&&n!==CACHE).map(n=>caches.delete(n)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==new URL(ROOT).origin)return;
 if(request.mode==='navigate'&&(url.pathname===HOME||url.pathname===INDEX)){
  event.respondWith((async()=>{
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),4000);
   try{
    const response=await fetch(request,{signal:controller.signal,cache:'no-store'});
    if(!usable(response,true))throw Error('Invalid app response');
    // オンラインの新しいHTMLだけを保存済みの旧オフライン一式に混ぜない。
    // 必須ファイル一式は次のService Workerインストール時にまとめて更新する。
    return response;
   }catch(_){return await (await caches.open(CACHE)).match(ROOT)||new Response('オフライン用データがありません。通信を回復してアプリを開いてください。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}
   finally{clearTimeout(timer);}
  })());
  return;
 }
 if(url.pathname.startsWith(ASSETROOT)&&(url.pathname.endsWith('.svg')||url.pathname.endsWith('.png')||URLS.includes(url.href))||url.pathname===new URL('./manifest.webmanifest',ROOT).pathname){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE),cached=await cache.match(request,{ignoreSearch:true});
   if(cached)return cached;
   try{const response=await fetch(request);if(usable(response))await cache.put(request,response.clone());return response;}
   catch(_){return new Response('Offline asset unavailable',{status:503});}
  })());
 }
});

// Expose the active cache version for a reliable client-side readiness check.
self.addEventListener('message',event=>{
 if(event.data?.type!=='TOTONOE_CACHE_VERSION')return;
 if(event.ports?.[0])event.ports[0].postMessage({cache:CACHE});
});

self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow(new URL('?page=more',self.registration.scope).href))});

/* ととのえ防災：v87 オフライン起動保護。ユーザーの記録データはキャッシュに含めない。 */
const CACHE='totonoe-offline-shell-v87';
const ROOT=new URL('./',self.registration.scope).href;
const PATHS=['./','./manifest.webmanifest','./assets/mascot-tako-open-v30.svg','./assets/mascot-tako-blink-v30.svg','./assets/mascot-tricera-open-v30.svg','./assets/mascot-tricera-blink-v30.svg','./assets/mascot-shimaenaga-open-v30.svg','./assets/mascot-shimaenaga-blink-v30.svg','./assets/app-icon.svg','./assets/home-sky-background.svg'];
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
 if(url.pathname.startsWith(ASSETROOT)&&(url.pathname.endsWith('.svg')||url.pathname.endsWith('.png'))||url.pathname===new URL('./manifest.webmanifest',ROOT).pathname){
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

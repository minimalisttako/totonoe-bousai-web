const SHELL_CACHE = 'totonoe-offline-shell-v3';
const SHELL_URL = new URL('./', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(new Request(SHELL_URL, {cache:'reload'}));
    if (!response.ok || response.redirected || !(response.headers.get('content-type') || '').includes('text/html')) throw new Error('App shell unavailable');
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(SHELL_URL, response);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('totonoe-offline-shell-') && name !== SHELL_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== scope.origin || ![scope.pathname, new URL('index.html', self.registration.scope).pathname].includes(url.pathname)) return;
  event.respondWith((async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(request, {signal:controller.signal, cache:'no-store'});
      if (!response.ok || response.redirected || !(response.headers.get('content-type') || '').includes('text/html')) throw new Error('App shell unavailable');
      try { const cache = await caches.open(SHELL_CACHE); await cache.put(SHELL_URL, response.clone()); } catch (_) {}
      return response;
    } catch (_) {
      const cache = await caches.open(SHELL_CACHE);
      const saved = await cache.match(SHELL_URL);
      return saved || new Response('Offline copy is unavailable. Reconnect and open the app once.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
    } finally { clearTimeout(timer); }
  })());
});

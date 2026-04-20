// Bump when fetch/caching rules change so clients drop old caches.
const CACHE_NAME = 'vyria-v3';
const STATIC_ASSETS = ['/', '/dashboard', '/offline.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isApi = sameOrigin && url.pathname.startsWith('/api/');

  /** Navegação de documento — em alguns browsers móveis mode/destination variam; usar também Sec-Fetch-*. */
  const secFetchDest = event.request.headers.get('Sec-Fetch-Dest') || '';
  const secFetchMode = event.request.headers.get('Sec-Fetch-Mode') || '';
  const isHtmlNavigation =
    (event.request.mode === 'navigate' &&
      event.request.destination === 'document') ||
    secFetchDest === 'document' ||
    secFetchMode === 'navigate';

  if (isApi) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response.ok) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || new Response(JSON.stringify({ offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return;
  }

  if (isHtmlNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!sameOrigin) return response;
          if (!response.ok) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          return Response.error();
        });
    })
  );
});

// Gerado em runtime pelo deploy — não editar CACHE_NAME manualmente aqui.
const CACHE_NAME = '__SW_CACHE_NAME__';
const STATIC_ASSETS = ['/offline.html', '/manifest.json'];

/** Segmentos que não são slugs de loja (alinhado a lib/app-reserved-routes + rotas técnicas). */
const RESERVED_FIRST = new Set([
  'admin',
  'dashboard',
  'login',
  'register',
  'acesso-suspenso',
  'planos',
  'api',
  '_next',
]);

function firstSegmentReservedOrAsset(seg) {
  if (!seg) return true;
  if (seg.includes('.')) return true;
  return RESERVED_FIRST.has(seg.toLowerCase());
}

/** Uma só pasta na raiz, tipo /minha-loja — cardápio público (não pode ir para cache-first no mobile). */
function isPublicStorefrontPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 1) return false;
  return !firstSegmentReservedOrAsset(parts[0]);
}

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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const path = url.pathname;
  const accept = event.request.headers.get('Accept') || '';

  if (sameOrigin && path.startsWith('/api/')) {
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
          return (
            cached ||
            new Response(JSON.stringify({ offline: true }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        })
    );
    return;
  }

  /** Bundles Next: só rede — nunca cachear JS/CSS (evita menu/UI antiga após deploy). */
  if (sameOrigin && path.startsWith('/_next/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  /** Painel: rede primeiro; offline só como fallback. */
  if (sameOrigin && path.startsWith('/dashboard')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  /**
   * Cardápio /[slug]: sempre rede. Em Safari/iOS/WebViews o pedido muitas vezes NÃO vem como
   * mode=navigate + destination=document e caía no ramo cache-first antigo (404 ou HTML velho).
   */
  if (sameOrigin && isPublicStorefrontPath(path)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  const secFetchDest = event.request.headers.get('Sec-Fetch-Dest') || '';
  const secFetchMode = event.request.headers.get('Sec-Fetch-Mode') || '';
  const isLikelyHtmlNavigation =
    (event.request.mode === 'navigate' && event.request.destination === 'document') ||
    secFetchDest === 'document' ||
    secFetchMode === 'navigate' ||
    accept.includes('text/html');

  if (sameOrigin && isLikelyHtmlNavigation) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  /** Pedidos RSC / flight do Next (mesmo path que a página; não usar cache-first). */
  if (
    sameOrigin &&
    (accept.includes('text/x-component') ||
      event.request.headers.get('Rsc') === '1' ||
      event.request.headers.get('Next-Router-Prefetch') === '1')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (sameOrigin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (!response.ok) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || 'Novo pedido recebido';
  const body = payload.body || 'Abre o painel para ver os detalhes.';
  const url = payload.url || '/dashboard/orders';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: 'vyria-new-order',
      renotify: true,
      data: { url },
      vibrate: [120, 40, 120],
      requireInteraction: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/dashboard/orders';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if (client.url && client.url.includes('/dashboard')) {
            client.navigate?.(targetUrl);
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

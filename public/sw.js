// Hand-rolled service worker for the golf-app PWA.
//
// Strategy:
//   * Runtime caching only — we do NOT precache hashed Next.js chunks because
//     they change every build. The first navigation seeds the cache.
//   * Network-first for HTML navigations so users see fresh data when online.
//   * Cache-first for /_next/* static assets (immutable, content-hashed).
//   * Pass-through for cross-origin (e.g. Supabase) and /auth/* and /api/*.
//
// Bump CACHE_VERSION when SW logic changes so old clients get the new SW.
const CACHE_VERSION = 'v1';
const RUNTIME_CACHE = `golf-app-runtime-${CACHE_VERSION}`;

self.addEventListener('install', () => {
  // Take over as soon as the new SW is installed; we have no precache to wait on.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('golf-app-') && n !== RUNTIME_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function shouldCache(url) {
  // Cache same-origin Next.js static assets and navigation HTML.
  // Do NOT cache Supabase API calls (we have IndexedDB), the auth callback,
  // or anything cross-origin.
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/auth/')) return false;
  if (url.pathname.startsWith('/api/')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!shouldCache(url)) return;

  const accept = request.headers.get('accept') || '';
  const isNavigation = request.mode === 'navigate' || accept.includes('text/html');

  // Network-first for navigations so online users see fresh content.
  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = (await cache.match(request)) || (await cache.match('/'));
          if (cached) return cached;
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Cache-first for hashed static assets.
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          return Response.error();
        }
      })(),
    );
  }
});

// Background Sync hook for the IndexedDB score queue. The client registers the
// 'sync-scores' tag in PwaBoot; the browser fires this event when the device
// is back online even if no tab is open.
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-scores') {
    event.waitUntil(triggerClientSync());
  }
});

async function triggerClientSync() {
  // Wake any open clients so their syncWorker drains the queue.
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'drain-sync-queue' });
  }
}

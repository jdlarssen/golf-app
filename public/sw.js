// Hand-rolled service worker for the golf-app PWA.
//
// Strategy:
//   * Runtime caching only — we do NOT precache hashed Next.js chunks because
//     they change every build. The first navigation seeds the cache.
//   * Network-first for HTML navigations so online users see fresh content.
//   * Cache-first for /_next/* static assets (immutable, content-hashed).
//   * Pass-through for cross-origin (e.g. Supabase) and /auth/* and /api/*.
//
// Security: we only cache a known allowlist of PUBLIC shell routes.
// Authenticated / personal SSR pages (profile, admin, games, cup, liga, …)
// are deliberately NOT written to the runtime cache so that offline fallback
// can never serve one user's HTML to another session on the same device.
// The offline scoring loop is Dexie-based and does not rely on cached HTML.
//
// Bump CACHE_VERSION when SW logic changes so old clients get the new SW
// and stale entries (including any authed HTML cached by the old v1 SW)
// are evicted during activate.
const CACHE_VERSION = 'v3';
const RUNTIME_CACHE = `golf-app-runtime-${CACHE_VERSION}`;

// Locale prefixes that next-intl injects (keep in sync with i18n config).
const LOCALES = ['no', 'en'];

// Allowlist of navigation paths whose HTML is safe to cache.
// Matches are exact or prefix-based — see isPublicNavigation() below.
// Everything NOT in this list falls through to network-only (no cache write).
const PUBLIC_NAV_PREFIXES = [
  // Legal / info pages — no personal data, no auth gate.
  '/legal/',
  ...LOCALES.map((l) => `/${l}/legal/`),
  // Format catalogue — publicly browsable, no auth.
  '/spillformater',
  ...LOCALES.map((l) => `/${l}/spillformater`),
  // Discover-tournaments page — publicly browsable, no auth.
  '/finn-turneringer',
  ...LOCALES.map((l) => `/${l}/finn-turneringer`),
  // Login page — no personal data, needed for offline UX shell.
  '/login',
  ...LOCALES.map((l) => `/${l}/login`),
];

// Exact paths whose HTML is safe to cache (home / app shell).
const PUBLIC_NAV_EXACT = ['/', ...LOCALES.map((l) => `/${l}`)];

self.addEventListener('install', () => {
  // Take over as soon as the new SW is installed; we have no precache to wait on.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        // Delete ALL previous golf-app caches (including v1 with authed HTML).
        names
          .filter((n) => n.startsWith('golf-app-') && n !== RUNTIME_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function shouldCache(url) {
  // Cache same-origin Next.js static assets only.
  // Navigation HTML is handled separately with a stricter allowlist.
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/auth/')) return false;
  if (url.pathname.startsWith('/api/')) return false;
  return true;
}

// Returns true only for navigation requests to the known public allowlist.
// Authenticated routes (profile, admin, games, cup, liga, innboks, …)
// return false and their HTML is never written to the cache.
function isPublicNavigation(url) {
  const { pathname } = url;
  if (PUBLIC_NAV_EXACT.includes(pathname)) return true;
  return PUBLIC_NAV_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
    const cacheAllowed = isPublicNavigation(url);
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // Only cache public shell routes — never cache authed/personal HTML.
          if (cacheAllowed) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          // Offline fallback: serve cached public shell if available.
          if (cacheAllowed) {
            const cache = await caches.open(RUNTIME_CACHE);
            const cached = await cache.match(request);
            if (cached) return cached;
          }
          // Fall back to the cached home/app-shell regardless of route —
          // showing a generic shell is safe; showing another user's authed
          // HTML is not.
          const cache = await caches.open(RUNTIME_CACHE);
          const shell = await cache.match('/');
          if (shell) return shell;
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Cache-first for hashed static assets (/_next/*).
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

// ── Web Push (#24) ───────────────────────────────────────────────────────────
// The app server (lib/notifications/push/sendPush.ts) posts an encrypted JSON
// payload {title, body, url, kind}. We show it as a native notification and, on
// click, focus an open tab (navigating it) or open a new window at the deeplink.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Tørny', {
      body: data.body || '',
      icon: '/icon',
      badge: '/icon',
      tag: data.kind,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  // Resolve the relative deeplink against the SW origin so we can compare it to
  // each open client's absolute URL.
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Prefer a tab already sitting on the target page — just focus it, no reload.
      for (const client of all) {
        if (client.url === target && 'focus' in client) {
          await client.focus();
          return;
        }
      }
      // Otherwise focus the first open tab and navigate it to the deeplink.
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(url); } catch { /* cross-origin guard */ }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// Hand-rolled service worker for the golf-app PWA.
//
// Strategy:
//   * Runtime caching only — we do NOT precache hashed Next.js chunks because
//     they change every build. The first navigation seeds the cache. The one
//     exception is the offline fallback document (#1350), which must be there
//     before the network is gone.
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
// v4 (#1350): precached offline document + `/` removed from the allowlist.
const CACHE_VERSION = 'v4';
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
  // Login page — no personal data, needed for offline UX shell.
  '/login',
  ...LOCALES.map((l) => `/${l}/login`),
  // The offline fallback documents (#1350) — plain static files, no user data.
  // Precached on install; listed here so a direct online visit refreshes them.
  '/offline.html',
  '/offline-en.html',
];

// `/` used to sit on an exact-match allowlist here. Since #1265 the root route
// renders the PERSONALIZED signed-in home page (first name, active games,
// streak) — caching it breaks the invariant at the top of this file (#819),
// and because the manifest's start_url is `/`, that cached copy was exactly
// what an offline relaunch got served. No navigation is exact-matched any
// more; the offline documents are precached explicitly in the install handler
// instead.
//
// `/spillformater` and `/finn-turneringer` came off the list for the SAME
// reason. "Publicly browsable" is not the test — "renders nothing personal" is.
// Both are auth-OPTIONAL (#1185, #1264, #1265): anonymous visitors are not
// redirected, but a signed-in visitor gets the bottom nav and, on
// /finn-turneringer, their friends' and clubs' rounds. That HTML is personal,
// so it must never reach the cache. Dropping them costs no offline UX: they
// are still handled by the fetch handler (shouldCache) and now fall through to
// the neutral offline document like every other non-allowlisted route.
//
// The rule for anyone editing this list: a route belongs here only if its HTML
// is byte-identical for an anonymous visitor and a signed-in one.

// Precached, user-data-free offline documents (#1350). Plain static files in
// public/ — deliberately NOT Next routes: the SW serves the document on the
// FAILING url (e.g. /games/<id>/holes/6), and a React/App-Router document that
// hydrates against a different route than window.location has no defined
// behavior. A framework-free page has no such coupling, and needs no cached
// /_next chunk to be readable.
// NB: bump CACHE_VERSION when the contents of these files change — they are
// only re-fetched when a new SW installs.
const OFFLINE_DOC_NO = '/offline.html';
const OFFLINE_DOC_EN = '/offline-en.html';

// Only the non-default locale carries a url prefix (i18n/routing.ts:
// localePrefix 'as-needed'), so anything that is not /en/... is Norwegian.
function offlineDocFor(pathname) {
  return pathname === '/en' || pathname.startsWith('/en/')
    ? OFFLINE_DOC_EN
    : OFFLINE_DOC_NO;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.addAll([OFFLINE_DOC_NO, OFFLINE_DOC_EN]);
      } catch {
        // Best effort: a failed precache must NEVER fail the install — that
        // would leave the old SW in place. The fetch handler copes with a
        // missing fallback.
      }
      // Take over as soon as the new SW is installed.
      await self.skipWaiting();
    })(),
  );
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
  return PUBLIC_NAV_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
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
          const cache = await caches.open(RUNTIME_CACHE);
          // Offline: the exact public shell we hit, if we have it.
          if (cacheAllowed) {
            const cached = await cache.match(request);
            if (cached) return cached;
          }
          // Otherwise the neutral offline document. It holds no user data, so
          // it is safe for ANY route — unlike the cached `/` shell this used
          // to serve, which since #1265 is a personalized home page (#819).
          // It is delivered on the ORIGINAL url, so "Prøv igjen"
          // (<a href="">) retries exactly the route the user was heading for.
          const fallback = await cache.match(offlineDocFor(url.pathname));
          if (fallback) return fallback;
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

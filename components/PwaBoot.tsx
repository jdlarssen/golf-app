'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production and wires up the Background Sync
 * bridge so a wake-up from the SW drains the IndexedDB score queue.
 *
 * In development we skip registration to keep hot-reload sane — a stale SW
 * cache would mask source changes.
 */
export function PwaBoot() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silent — PWA install is progressive enhancement.
    });

    // The SW posts {type: 'drain-sync-queue'} when a Background Sync fires
    // while a tab is open. Forward that to the existing Phase 7 worker.
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'drain-sync-queue') {
        import('@/lib/sync/syncWorker')
          .then((m) => m.drainQueue())
          .catch(() => {});
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    // Register a Background Sync tag so the browser can re-fire it when the
    // device comes back online — even if the app is closed. Not all browsers
    // support this; failure is harmless because the in-app sync still runs.
    navigator.serviceWorker.ready
      .then((reg) => {
        const sync = (
          reg as ServiceWorkerRegistration & {
            sync?: { register: (tag: string) => Promise<void> };
          }
        ).sync;
        if (sync && typeof sync.register === 'function') {
          sync.register('sync-scores').catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  return null;
}

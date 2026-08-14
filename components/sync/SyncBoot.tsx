'use client';

import { useEffect } from 'react';

/**
 * Starts the offline-sync engine (online/focus listeners + 30s interval +
 * bootstrap drain) for every game page. Mounted from the game layout so the
 * Dexie queue drains no matter which game surface the player lands on —
 * game home, leaderboard, approve — not just the hole page (#1367).
 *
 * Deliberately NOT mounted in the locale layout: /demo must never open the
 * 'golf-app' Dexie database, /embed/* runs in third-party iframes where
 * IndexedDB may be blocked, and e2e/sync/offline-sync.spec.ts assumes /login
 * is engine-free.
 *
 * Lazy import keeps Dexie + the sync worker out of the server bundle; the
 * engine itself is idempotent (`started` flag) and SSR-safe.
 */
export function SyncBoot() {
  useEffect(() => {
    import('@/lib/sync/syncWorker')
      .then((m) => m.startSyncListener())
      .catch(() => {
        // Silent — sync is progressive enhancement; the queue survives in
        // Dexie and later mounts or manual retry will drain it.
      });
  }, []);

  return null;
}

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
    // #1404: the owner guard MUST resolve before the engine starts — on a
    // shared device a user switch wipes the previous user's leftovers here,
    // so the bootstrap drain can never push them under the wrong session.
    void (async () => {
      try {
        const cleanup = await import('@/lib/sync/localDataCleanup');
        await cleanup.ensureLocalDataOwnerBrowser();
      } catch {
        // Silent — the guard is defensive; a failure must not block sync.
      }
      try {
        const m = await import('@/lib/sync/syncWorker');
        m.startSyncListener();
      } catch {
        // Silent — sync is progressive enhancement; the queue survives in
        // Dexie and later mounts or manual retry will drain it.
      }
    })();
  }, []);

  return null;
}

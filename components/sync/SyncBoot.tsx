'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * #1404: the owner guard MUST resolve before the engine starts — on a shared
 * device a user switch wipes the previous user's leftovers here, so the
 * bootstrap drain can never push them under the wrong session.
 *
 * Resolves `true` when the engine was allowed to start, `false` when the
 * switch wipe failed (#1959) and the engine stays off.
 */
async function guardThenStart(): Promise<boolean> {
  try {
    const cleanup = await import('@/lib/sync/localDataCleanup');
    try {
      await cleanup.ensureLocalDataOwnerBrowser();
    } catch (err) {
      // #1959: fail-CLOSED only when the switch wipe itself threw — the
      // previous user's queue is still on board, and draining it under this
      // session ends in quarantine. Every other guard failure stays
      // fail-open: the guard is defensive and must not block sync.
      if (err instanceof cleanup.OwnerWipeFailedError) return false;
    }
  } catch {
    // Import failed — nothing to guard with; fall through to the engine.
  }
  try {
    const m = await import('@/lib/sync/syncWorker');
    m.startSyncListener();
  } catch {
    // Silent — sync is progressive enhancement; the queue survives in
    // Dexie and later mounts or manual retry will drain it.
  }
  return true;
}

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
  const t = useTranslations('SyncBanner');
  const [wipeFailed, setWipeFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    void guardThenStart().then((started) => setWipeFailed(!started));
  }, []);

  if (!wipeFailed) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      setWipeFailed(!(await guardThenStart()));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="sticky top-0 z-40 px-3 pt-2"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
    >
      <div
        data-testid="owner-wipe-failed"
        className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-sm bg-danger/[0.08] border-danger/30 text-danger"
      >
        <p className="min-w-0 text-sm font-medium leading-tight">
          {t('ownerWipeFailed')}
        </p>
        <button
          type="button"
          onClick={() => void handleRetry()}
          disabled={retrying}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-md border border-current px-2.5 text-xs font-semibold uppercase tracking-wide transition-opacity disabled:opacity-50"
        >
          {t('retry')}
        </button>
      </div>
    </div>
  );
}

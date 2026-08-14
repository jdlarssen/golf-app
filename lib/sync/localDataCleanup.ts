import { localDb } from './db';

/**
 * #1404 — local-data hygiene on shared devices (the #819 class: one user's
 * data must never reach the next user on the same device).
 *
 * Two layers, both feeding on the same decision core:
 *
 *  1. Logout (`prepareLogout`, driven by `LogoutForm` before the POST):
 *     best-effort drain, then clear ONLY when the queue is empty — an
 *     offline logout keeps unsynced strokes on the device, protected by
 *     layer 2.
 *  2. Owner switch (`ensureLocalDataOwner`, run by `SyncBoot` BEFORE the
 *     sync engine starts): a different user logging in wipes the previous
 *     user's leftovers before the first drain can push them under the wrong
 *     session.
 *
 * The decision functions are Dexie-free with injected dependencies (unit
 * tested); the `*Browser` bindings below wire in localStorage, the Supabase
 * session and the sync worker. The Dexie DATABASE is never deleted or
 * renamed — only the tables are cleared (CLAUDE.md: renaming 'golf-app'
 * wipes every user's local data).
 */

export const LOCAL_DATA_OWNER_KEY = 'golf-app:local-data-owner';

/** How long the logout path waits for the drain before proceeding. */
const LOGOUT_DRAIN_TIMEOUT_MS = 4_000;

export async function clearAllLocalData(): Promise<void> {
  await localDb.transaction(
    'rw',
    localDb.scores,
    localDb.syncQueue,
    localDb.conflicts,
    async () => {
      await Promise.all([
        localDb.scores.clear(),
        localDb.syncQueue.clear(),
        localDb.conflicts.clear(),
      ]);
    },
  );
}

export type OwnerChange = 'first' | 'same' | 'switched';

export function detectOwnerChange(
  storedOwnerId: string | null,
  sessionUserId: string,
): OwnerChange {
  if (storedOwnerId == null) return 'first';
  return storedOwnerId === sessionUserId ? 'same' : 'switched';
}

export async function ensureLocalDataOwner(deps: {
  getSessionUserId: () => Promise<string | null>;
  getStoredOwnerId: () => string | null;
  setStoredOwnerId: (userId: string) => void;
  clear: () => Promise<void>;
}): Promise<OwnerChange | 'no_session'> {
  const userId = await deps.getSessionUserId();
  // Anonymous surface: neither stamp nor wipe — an expired session must not
  // erase strokes the owner will sync after their next login.
  if (userId == null) return 'no_session';

  const change = detectOwnerChange(deps.getStoredOwnerId(), userId);
  if (change === 'switched') {
    // Clear BEFORE stamping: if the wipe throws, the stamp still names the
    // previous owner and the next boot retries the wipe.
    await deps.clear();
  }
  if (change !== 'same') deps.setStoredOwnerId(userId);
  return change;
}

export async function prepareLogout(deps: {
  drain: () => Promise<unknown>;
  pendingCount: () => Promise<number>;
  clear: () => Promise<void>;
  clearStoredOwner: () => void;
}): Promise<'cleared' | 'kept'> {
  try {
    await deps.drain();
  } catch {
    // Best-effort — offline or flaky network. The pending count decides.
  }
  if ((await deps.pendingCount()) > 0) {
    // Unsynced (or quarantined) strokes on board: keep the data AND the
    // owner stamp, so the switch guard still fires if someone else logs in.
    return 'kept';
  }
  await deps.clear();
  deps.clearStoredOwner();
  return 'cleared';
}

// --- Browser bindings (thin, untested — system boundary) -------------------

function getStoredOwnerIdBrowser(): string | null {
  try {
    return window.localStorage.getItem(LOCAL_DATA_OWNER_KEY);
  } catch {
    return null;
  }
}

/**
 * Owner guard for `SyncBoot` — MUST resolve before `startSyncListener()` so
 * the first drain never runs against another user's queue. Reads the session
 * the same offline-safe way the drain does (`getSession`, local storage).
 */
export async function ensureLocalDataOwnerBrowser(): Promise<void> {
  if (typeof window === 'undefined') return;
  const { getBrowserClient } = await import('@/lib/supabase/client');
  await ensureLocalDataOwner({
    getSessionUserId: async () => {
      try {
        const { data } = await getBrowserClient().auth.getSession();
        return data.session?.user.id ?? null;
      } catch {
        return null;
      }
    },
    getStoredOwnerId: getStoredOwnerIdBrowser,
    setStoredOwnerId: (userId) => {
      try {
        window.localStorage.setItem(LOCAL_DATA_OWNER_KEY, userId);
      } catch {
        // Storage unavailable (private mode quota etc.) — guard degrades to
        // clearing on every boot-with-session, which is safe, just eager.
      }
    },
    clear: clearAllLocalData,
  });
}

/**
 * Logout path — called by `LogoutForm` BEFORE the POST to /logout. Raced
 * against a short timeout so a hanging network never blocks the logout
 * itself; the timeout resolves to 'kept', which is always safe (the switch
 * guard covers the next user).
 */
export async function prepareLogoutBrowser(): Promise<'cleared' | 'kept'> {
  if (typeof window === 'undefined') return 'kept';
  const run = (async () => {
    const { drainQueue } = await import('./syncWorker');
    return prepareLogout({
      drain: drainQueue,
      pendingCount: () => localDb.syncQueue.count(),
      clear: clearAllLocalData,
      clearStoredOwner: () => {
        try {
          window.localStorage.removeItem(LOCAL_DATA_OWNER_KEY);
        } catch {
          // Harmless: a stale stamp only makes the next boot re-check.
        }
      },
    });
  })();
  const timeout = new Promise<'kept'>((resolve) => {
    setTimeout(() => resolve('kept'), LOGOUT_DRAIN_TIMEOUT_MS);
  });
  return Promise.race([run, timeout]);
}

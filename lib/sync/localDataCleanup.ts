import { localDb } from './db';
import { setOwnerWipeBlocked } from './ownerWipeBlock';

/**
 * #1404 — local-data hygiene on shared devices (the #819 class: one user's
 * data must never reach the next user on the same device).
 *
 * Three exits, all feeding on the same decision core:
 *
 *  1. Logout (`prepareLogout`, driven by `LogoutForm` before the POST):
 *     best-effort drain, then clear ONLY when the queue is empty — an
 *     offline logout keeps unsynced strokes on the device, protected by
 *     layer 2.
 *  2. Owner switch (`ensureLocalDataOwner`, run by `SyncBoot` BEFORE the
 *     sync engine starts): a different user logging in wipes the previous
 *     user's leftovers before the first drain can push them under the wrong
 *     session.
 *  3. Account deletion (`finishAccountDeletion`, driven by
 *     `DeleteAccountForm` only AFTER the server delete succeeded, #1987):
 *     clears unconditionally — the account is gone, so its queue can never
 *     be delivered, and keeping it would only hand it to the next user.
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

/**
 * #1959: the owner-switch wipe threw. The previous user's queue is still on
 * board, so the caller must keep the sync engine OFF — unlike every other
 * guard failure, which stays fail-open. Only raised for `switched`; on
 * `first`/`same` nothing is ever cleared, so there is nothing to protect.
 */
export class OwnerWipeFailedError extends Error {
  constructor(cause: unknown) {
    super('Local data owner switch: wipe failed', { cause });
    this.name = 'OwnerWipeFailedError';
  }
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
    try {
      await deps.clear();
    } catch (err) {
      throw new OwnerWipeFailedError(err);
    }
  }
  if (change !== 'same') deps.setStoredOwnerId(userId);
  return change;
}

export async function prepareLogout(deps: {
  drain: () => Promise<unknown>;
  pendingCount: () => Promise<number>;
  clear: () => Promise<void>;
  clearStoredOwner: () => void;
  cleanupPush?: () => Promise<unknown>;
  /**
   * #1959: false when the stored owner stamp names someone other than the
   * session logging out — the owner-switch wipe failed and the rows on board
   * are the previous user's. Omitted → treated as a match.
   */
  ownerMatches?: () => boolean;
}): Promise<'cleared' | 'kept'> {
  // #1790: drop the device's push registration for the account logging out —
  // server row, browser subscription and the remembered native token — while
  // the session is still valid. Runs in parallel with the drain, best-effort:
  // it must never decide the drain outcome nor block the logout (the browser
  // binding's timeout race covers a hang, e.g. a dev env without a service
  // worker where `disablePush` awaits `serviceWorker.ready` forever).
  const pushCleanup = deps.cleanupPush
    ? Promise.resolve().then(deps.cleanupPush).catch(() => {})
    : undefined;

  let outcome: 'cleared' | 'kept';
  if (deps.ownerMatches && !deps.ownerMatches()) {
    // #1959: someone else's rows. Draining pushes them under this session
    // (RLS reject → quarantine); clearing loses them. Leave data AND stamp —
    // the switch guard retries the wipe on the next login.
    if (pushCleanup) await pushCleanup;
    return 'kept';
  }
  try {
    await deps.drain();
  } catch {
    // Best-effort — offline or flaky network. The pending count decides.
  }
  if ((await deps.pendingCount()) > 0) {
    // Unsynced (or quarantined) strokes on board: keep the data AND the
    // owner stamp, so the switch guard still fires if someone else logs in.
    outcome = 'kept';
  } else {
    await deps.clear();
    deps.clearStoredOwner();
    outcome = 'cleared';
  }
  // Let the push cleanup finish before the caller POSTs /logout — a navigation
  // mid-request would kill the server-row delete.
  if (pushCleanup) await pushCleanup;
  return outcome;
}

export async function finishAccountDeletion(deps: {
  clear: () => Promise<void>;
  clearStoredOwner: () => void;
}): Promise<'cleared' | 'clear_failed'> {
  let outcome: 'cleared' | 'clear_failed' = 'cleared';
  try {
    await deps.clear();
  } catch (error) {
    // Best-effort: the account IS deleted, so "try again" would ask for
    // something that can no longer happen. Log and move on to login.
    console.error('[localDataCleanup] clear after account deletion failed', error);
    outcome = 'clear_failed';
  }
  // Removed either way: with no stamp the next login is 'first', and a
  // leftover is wiped again at the following owner switch.
  deps.clearStoredOwner();
  return outcome;
}

/**
 * Best-effort delivery of offline strokes before the account is deleted
 * (#1987). Never throws and never outlasts `timeoutMs` — its outcome must not
 * decide whether the deletion runs.
 */
export async function drainBeforeDeletion(
  drain: () => Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  const run = Promise.resolve()
    .then(drain)
    .then(
      () => {},
      () => {},
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([run, timeout]);
  clearTimeout(timer);
}

// --- Browser bindings (thin, untested — system boundary) -------------------

function getStoredOwnerIdBrowser(): string | null {
  try {
    return window.localStorage.getItem(LOCAL_DATA_OWNER_KEY);
  } catch {
    return null;
  }
}

function clearStoredOwnerBrowser(): void {
  try {
    window.localStorage.removeItem(LOCAL_DATA_OWNER_KEY);
  } catch {
    // Harmless: a stale stamp only makes the next boot re-check.
  }
}

/**
 * Owner guard for `SyncBoot` — MUST resolve before `startSyncListener()` so
 * the first drain never runs against another user's queue. Reads the session
 * the same offline-safe way the drain does (`getSession`, local storage).
 */
export async function ensureLocalDataOwnerBrowser(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    // 'no_session' proves nothing about the owner (the session read may have
    // failed) — only a real check may lift the lock.
    if ((await runOwnerGuardBrowser()) !== 'no_session') setOwnerWipeBlocked(false);
  } catch (err) {
    // #1959: lock every drain caller, not just the engine start — see
    // `ownerWipeBlock.ts`. Other failures leave the lock as it was.
    if (err instanceof OwnerWipeFailedError) setOwnerWipeBlocked(true);
    throw err;
  }
}

async function getSessionUserIdBrowser(): Promise<string | null> {
  try {
    const { getBrowserClient } = await import('@/lib/supabase/client');
    const { data } = await getBrowserClient().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

async function runOwnerGuardBrowser(): Promise<OwnerChange | 'no_session'> {
  return ensureLocalDataOwner({
    getSessionUserId: getSessionUserIdBrowser,
    getStoredOwnerId: getStoredOwnerIdBrowser,
    setStoredOwnerId: (userId) => {
      try {
        window.localStorage.setItem(LOCAL_DATA_OWNER_KEY, userId);
      } catch {
        // setItem failing with a stale stamp still readable → the guard
        // clears on every boot-with-session (safe, just eager). Fully
        // blocked localStorage reads null → every boot is 'first' and the
        // guard goes inert — accepted corner: such environments also tend
        // to block IndexedDB, leaving nothing to leak.
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
 *
 * `cleanupPush` (#1790) is injected by the form, not imported here — the
 * cleanup calls server actions, and `lib/sync/` stays free of action imports.
 */
export async function prepareLogoutBrowser(
  cleanupPush?: () => Promise<unknown>,
): Promise<'cleared' | 'kept'> {
  if (typeof window === 'undefined') return 'kept';
  const run = (async () => {
    const { drainQueue } = await import('./syncWorker');
    const stored = getStoredOwnerIdBrowser();
    const sessionUserId = stored == null ? null : await getSessionUserIdBrowser();
    return prepareLogout({
      // #1959: no stamp or no readable session → nothing to compare, keep the
      // normal path (same fail-open reading as the guard itself).
      ownerMatches: () =>
        stored == null || sessionUserId == null || stored === sessionUserId,
      drain: drainQueue,
      pendingCount: () => localDb.syncQueue.count(),
      clear: clearAllLocalData,
      clearStoredOwner: clearStoredOwnerBrowser,
      cleanupPush,
    });
  })();
  const timeout = new Promise<'kept'>((resolve) => {
    setTimeout(() => resolve('kept'), LOGOUT_DRAIN_TIMEOUT_MS);
  });
  return Promise.race([run, timeout]);
}

/**
 * Account-deletion path, step 1 — called by `DeleteAccountForm` BEFORE the
 * delete action: gives offline strokes one bounded chance to reach the server
 * (same budget as logout).
 */
export async function drainBeforeDeletionBrowser(): Promise<void> {
  if (typeof window === 'undefined') return;
  await drainBeforeDeletion(async () => {
    const { drainQueue } = await import('./syncWorker');
    return drainQueue();
  }, LOGOUT_DRAIN_TIMEOUT_MS);
}

/**
 * Account-deletion path, step 2 — called by `DeleteAccountForm` only after
 * the server confirmed the delete. Never on a failed or blocked delete: the
 * account still exists, and so must its strokes.
 */
export async function finishAccountDeletionBrowser(): Promise<
  'cleared' | 'clear_failed'
> {
  if (typeof window === 'undefined') return 'cleared';
  return finishAccountDeletion({
    clear: clearAllLocalData,
    clearStoredOwner: clearStoredOwnerBrowser,
  });
}

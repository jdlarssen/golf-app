/**
 * #1959 — the drain lock for a failed owner-switch wipe.
 *
 * When `ensureLocalDataOwnerBrowser` hits `OwnerWipeFailedError`, the queue on
 * board still belongs to the previous user. Not starting the sync engine is
 * not enough on its own: `drainQueue` has other callers (the banner's «Prøv
 * igjen», the hole page after a stroke, the service worker's background-sync
 * message), and any one of them would push those rows under the new session —
 * RLS rejects, and after five tries they are quarantined for good.
 *
 * Kept in its own dependency-free module so `syncWorker` can read it without
 * importing the cleanup layer. Module state lives for the page's lifetime; a
 * reload runs the guard again before the engine starts.
 */
let blocked = false;

export function setOwnerWipeBlocked(value: boolean): void {
  blocked = value;
}

export function isOwnerWipeBlocked(): boolean {
  return blocked;
}

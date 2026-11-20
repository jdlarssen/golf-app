/**
 * Opus review of p18 (audit 20.11): is a refused write POSITIVELY the locked
 * case? Shared by the web drain (`lib/sync/syncWorker.ts`) and the app drain
 * (`native/app/src/data/syncWorker.ts`).
 *
 * A refusal (the RPC's all-NULL row, or an RLS error) looks the same whether
 * the card is locked or the write was refused for another reason: a lost
 * session, a mate the device may no longer score for. When the server has no
 * row to put back, settling a refusal means deleting the local stroke, so the
 * drain only does that once the lock is confirmed: the player's card is
 * delivered or withdrawn, or the round is not active. Anything else — the row
 * is missing, unreadable, or the player is still playing — keeps the stroke as
 * «not sent». An unsent stroke never disappears in silence.
 */

/** The `game_players` select the drain reads to confirm a lock. */
export const LOCK_STATE_COLUMNS = 'submitted_at, withdrawn_at, games(status)';

export interface LockStateRow {
  submitted_at: string | null;
  withdrawn_at: string | null;
  games: { status: string } | null;
}

export function isConfirmedLock(row: LockStateRow | null | undefined): boolean {
  if (!row) return false;
  if (row.submitted_at != null || row.withdrawn_at != null) return true;
  return row.games != null && row.games.status !== 'active';
}

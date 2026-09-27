import { resolveConflict } from './conflict';

export type UpsertReplyOutcome =
  | 'applied'
  | 'server-wins'
  | 'kept-local'
  | 'refused';

/** The two columns of the `upsert_score_if_newer` reply the verdict needs. */
export interface UpsertReplyRow {
  was_applied: boolean | null;
  client_updated_at: string | null;
}

/**
 * The one rule for what an `upsert_score_if_newer` reply means (#2211), shared
 * by the web drain (`lib/sync/syncWorker.ts`) and the app drain
 * (`native/app/src/data/syncWorker.ts`).
 *
 * - No row, or `was_applied` null → 'refused'. RLS filtered the UPDATE to 0
 *   rows (card submitted/withdrawn, round not active), and `returning … into`
 *   without STRICT left every OUT column NULL — see
 *   `lib/sync/testing/refusedReplyFixture.ts` for the shape staging returns.
 * - `was_applied` true → 'applied'.
 * - `was_applied` false: the RPC only skips a write when the server stamp is
 *   the same or newer, so compare the two INSTANTS (`resolveConflict`):
 *   - server strictly later → 'server-wins';
 *   - same instant → 'kept-local': the echo of a write that already landed
 *     but whose reply was lost, or two tabs draining the same item;
 *   - local strictly later → 'refused': the RPC never answers false for an
 *     older server row, so only a guard can have stopped it. This also covers
 *     a future RPC guard that returns the stored row, as 0102 did.
 *   - an unparseable stamp → 'kept-local', as a null stamp always was.
 */
export function interpretUpsertReply(
  row: UpsertReplyRow | null | undefined,
  localClientUpdatedAt: string,
): UpsertReplyOutcome {
  if (!row || row.was_applied == null) return 'refused';
  if (row.was_applied) return 'applied';

  const resolution = resolveConflict({
    localClientUpdatedAt,
    serverClientUpdatedAt: row.client_updated_at ?? '',
  });
  if (resolution === 'server-wins') return 'server-wins';
  if (resolution === 'local-wins') return 'refused';
  return 'kept-local';
}

import { localDb, scoreKey, type ConflictRecord, type LocalScore } from './db';
import { conflictRecordFor } from './conflict';

/** A scores row as it comes back from the server, in local field names. */
export interface ServerScoreRow {
  gameId: string;
  userId: string;
  holeNumber: number;
  strokes: number | null;
  putts: number | null;
  enteredBy: string;
  clientUpdatedAt: string;
  serverUpdatedAt: string | null;
}

export type MergeOutcome = 'kept-local' | 'applied' | 'applied-with-conflict';

/**
 * The single path by which a server value replaces a local one outside the
 * drain: realtime events, the catch-up fetch, and the hole-page seed all go
 * through here (#1611).
 *
 * Each of those used to do its own `get` + `put`, which cost two things:
 *
 * 1. **Silence.** They overwrote a number typed on this device without leaving
 *    a ConflictRecord, so the notice from #688/#1368 only ever appeared in the
 *    offline case. When both phones are online the realtime event lands first,
 *    the drain then sees matching timestamps, and its conflict branch never
 *    runs. `conflictRecordFor` is the shared rule with the drain — same test,
 *    one definition.
 * 2. **A torn read.** `get` then `put` with no transaction let a `writeScore`
 *    slip a newer local row in between, so an older server row could land on
 *    top of a fresh tap. Deciding and writing inside one rw transaction over
 *    scores + syncQueue + conflicts closes that window.
 *
 * `currentUserId` is resolved by the CALLER, never in here: awaiting anything
 * non-Dexie inside a Dexie transaction commits it early
 * (`PrematureCommitError`), which is why `drainQueue` also looks the session up
 * once, up front.
 */
export async function mergeServerScore(
  incoming: ServerScoreRow,
  currentUserId: string | null,
): Promise<MergeOutcome> {
  const [outcome] = await mergeServerScores([incoming], currentUserId);
  return outcome!;
}

/**
 * `mergeServerScore` for a batch, in ONE rw transaction (#2227). The catch-up
 * merges a whole game at once: ≈2 700 rows at 150 players, which as one
 * transaction per row meant ≈2 700 IndexedDB transactions on every focus.
 *
 * Same rule per row as the single merge (which is just a batch of one, so the
 * rule lives here only). A row id that appears twice is judged against the
 * earlier row's result, not the stale read, exactly as two sequential merges
 * would have been.
 */
export async function mergeServerScores(
  rows: readonly ServerScoreRow[],
  currentUserId: string | null,
): Promise<MergeOutcome[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => scoreKey(r.gameId, r.userId, r.holeNumber));

  return localDb.transaction(
    'rw',
    localDb.scores,
    localDb.syncQueue,
    localDb.conflicts,
    async () => {
      const stored = await localDb.scores.bulkGet(ids);
      const current = new Map<string, LocalScore | undefined>();
      ids.forEach((id, i) => {
        if (!current.has(id)) current.set(id, stored[i]);
      });

      const puts = new Map<string, LocalScore>();
      const conflicts = new Map<string, ConflictRecord>();

      const outcomes = rows.map((incoming, i): MergeOutcome => {
        const id = ids[i]!;
        const existing = current.get(id);

        // Last-write-wins by clientUpdatedAt. Older events are stale; an EQUAL
        // one is the echo of this device's own write coming back through
        // realtime, and dropping it here is what keeps the echo from ever
        // looking like a conflict.
        if (existing && existing.clientUpdatedAt >= incoming.clientUpdatedAt) {
          return 'kept-local';
        }

        const conflict = existing
          ? conflictRecordFor({
              existing,
              incomingStrokes: incoming.strokes,
              currentUserId,
            })
          : null;
        if (conflict) conflicts.set(conflict.id, conflict);

        const row: LocalScore = {
          id,
          gameId: incoming.gameId,
          userId: incoming.userId,
          holeNumber: incoming.holeNumber,
          strokes: incoming.strokes,
          putts: incoming.putts ?? null, // #939: pre-migration rows lack the field
          enteredBy: incoming.enteredBy,
          clientUpdatedAt: incoming.clientUpdatedAt,
          serverUpdatedAt: incoming.serverUpdatedAt,
        };
        current.set(id, row);
        puts.set(id, row);

        return conflict ? 'applied-with-conflict' : 'applied';
      });

      if (puts.size > 0) {
        await localDb.scores.bulkPut([...puts.values()]);
        // Any pending upload for an applied row (quarantined ones included)
        // was for a value that has now lost LWW. Leaving it queued either burns
        // an RPC that comes straight back as a no-op, or leaves a "could not be
        // saved" notice standing for a row that is in fact in sync. The drain
        // dequeues on server-wins for the same reason.
        await localDb.syncQueue.bulkDelete([...puts.keys()]);
      }
      if (conflicts.size > 0) await localDb.conflicts.bulkPut([...conflicts.values()]);

      return outcomes;
    },
  );
}

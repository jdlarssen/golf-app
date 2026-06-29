import { localDb, scoreKey, type LocalScore } from './db';

interface WriteScoreArgs {
  gameId: string;
  userId: string;
  holeNumber: number;
  /**
   * Strokes and putts (#939) both live on the same scores row. A write may
   * carry one or both: an OMITTED field (`undefined`) is preserved from the
   * existing local row, while an explicit `null` clears it. This lets the
   * stroke-entry handler and the putt-entry handler each write their own field
   * without clobbering the other — and guarantees the RPC always receives the
   * full current (strokes, putts) pair, since LWW is over the whole row.
   */
  strokes?: number | null;
  putts?: number | null;
  enteredBy: string;
}

/**
 * Compute a strictly-increasing clientUpdatedAt for this (gameId, userId,
 * holeNumber) triple. The server RPC applies writes only on strict >, so two
 * edits at the same millisecond would cause the second RPC call to be rejected
 * and the syncWorker to overwrite the local row with the older server row —
 * silently discarding the player's latest tap.
 *
 * Takes the already-read existing row (writeScore reads it once for the merge),
 * so this is pure arithmetic — no extra Dexie get.
 */
function strictlyIncreasingTimestamp(
  existing: LocalScore | undefined,
  nowIso: string,
): string {
  if (!existing) return nowIso;
  if (nowIso > existing.clientUpdatedAt) return nowIso;
  // nowIso is <= stored → bump stored by 1 ms to guarantee strict >.
  return new Date(new Date(existing.clientUpdatedAt).getTime() + 1).toISOString();
}

export async function writeScore(args: WriteScoreArgs): Promise<LocalScore> {
  const id = scoreKey(args.gameId, args.userId, args.holeNumber);
  const nowIso = new Date().toISOString();
  const existing = await localDb.scores.get(id);
  const clientUpdatedAt = strictlyIncreasingTimestamp(existing, nowIso);

  const row: LocalScore = {
    id,
    gameId: args.gameId,
    userId: args.userId,
    holeNumber: args.holeNumber,
    // Merge: an omitted field keeps the existing value; explicit null clears it.
    strokes: args.strokes !== undefined ? args.strokes : (existing?.strokes ?? null),
    putts: args.putts !== undefined ? args.putts : (existing?.putts ?? null),
    enteredBy: args.enteredBy,
    clientUpdatedAt,
    serverUpdatedAt: null,
  };

  await localDb.transaction(
    'rw',
    localDb.scores,
    localDb.syncQueue,
    async () => {
      await localDb.scores.put(row);
      await localDb.syncQueue.put({
        id,
        scoreId: id,
        attemptCount: 0,
        lastError: null,
        createdAt: clientUpdatedAt,
      });
    },
  );

  return row;
}

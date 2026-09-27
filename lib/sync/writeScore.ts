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
  /**
   * #2211: strokes to use ONLY when `strokes` is omitted AND there is no local
   * row at all. An existing local row always wins, and an explicit `strokes`
   * wins over this. The submit page's putt chips pass the server snapshot's
   * strokes here: sending them as `strokes` wrote a stale number back over a
   * newer one (a mate's correction, or the player's own still-queued edit),
   * while sending nothing would null the strokes on a cold local DB.
   */
  fallbackStrokes?: number | null;
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
  // Compare INSTANTS (#2211): the stored stamp may be in the server's format
  // (`…+00:00`, stored by server-wins and the locked-card settle), and as
  // strings `…:00.000Z` sorts after `…:00+00:00` for the same instant.
  const stored = Date.parse(existing.clientUpdatedAt);
  // An unparseable stored stamp cannot be bumped; now is the only sane value.
  if (Number.isNaN(stored) || Date.parse(nowIso) > stored) return nowIso;
  // now is <= stored → bump stored by 1 ms to guarantee strict >.
  return new Date(stored + 1).toISOString();
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
    strokes:
      args.strokes !== undefined
        ? args.strokes
        : existing
          ? (existing.strokes ?? null)
          : (args.fallbackStrokes ?? null),
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

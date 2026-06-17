import { localDb, scoreKey, type LocalScore } from './db';

interface WriteScoreArgs {
  gameId: string;
  userId: string;
  holeNumber: number;
  strokes: number | null;
  enteredBy: string;
}

/**
 * Compute a strictly-increasing clientUpdatedAt for this (gameId, userId,
 * holeNumber) triple. The server RPC applies writes only on strict >, so two
 * edits at the same millisecond would cause the second RPC call to be rejected
 * and the syncWorker to overwrite the local strokes with the older server row —
 * silently discarding the player's latest tap.
 *
 * Fix: read the current Dexie row BEFORE writing. If the wall-clock timestamp
 * is <= the stored one (collision or clock skew), bump to stored + 1 ms. This
 * is a single indexed get on the primary key, so it is cheap.
 */
async function strictlyIncreasingTimestamp(
  id: string,
  nowIso: string,
): Promise<string> {
  const existing = await localDb.scores.get(id);
  if (!existing) return nowIso;
  if (nowIso > existing.clientUpdatedAt) return nowIso;
  // nowIso is <= stored → bump stored by 1 ms to guarantee strict >.
  return new Date(new Date(existing.clientUpdatedAt).getTime() + 1).toISOString();
}

export async function writeScore(args: WriteScoreArgs): Promise<LocalScore> {
  const id = scoreKey(args.gameId, args.userId, args.holeNumber);
  const nowIso = new Date().toISOString();
  const clientUpdatedAt = await strictlyIncreasingTimestamp(id, nowIso);

  const row: LocalScore = {
    id,
    gameId: args.gameId,
    userId: args.userId,
    holeNumber: args.holeNumber,
    strokes: args.strokes,
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

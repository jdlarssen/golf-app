import { localDb, scoreKey, type LocalScore } from './db';

interface WriteScoreArgs {
  gameId: string;
  userId: string;
  holeNumber: number;
  strokes: number | null;
  enteredBy: string;
}

export async function writeScore(args: WriteScoreArgs): Promise<LocalScore> {
  const id = scoreKey(args.gameId, args.userId, args.holeNumber);
  const clientUpdatedAt = new Date().toISOString();
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

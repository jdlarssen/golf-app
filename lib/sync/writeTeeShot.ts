import { localDb, teeShotKey, type LocalTeeShot } from './db';
import { nextTeeShotStamp, serverTeeShotWins, type ServerTeeShotRow } from './teeShotRow';

// The row API lives in the Dexie-free teeShotRow.ts (the app imports it too);
// re-exported here so the web's importers stay as they were.
export { SERVER_TEE_SHOT_COLUMNS, fromTeeShotRow, type ServerTeeShotRow, type TeeShotRowFromDb } from './teeShotRow';

interface WriteTeeShotArgs {
  gameId: string;
  teamNumber: number;
  holeNumber: number;
  /** Whose tee shot the team used; null clears the choice. */
  teeShotBy: string | null;
  enteredBy: string;
}

/**
 * «Hvem sitt utslag» (#2580): local first, then the queue, as `writeScore`.
 * The drain (`syncWorker.ts`) sends it with `set_team_tee_shot_if_newer`.
 *
 * The stamp is strictly increasing per row (`nextTeeShotStamp`, #2211).
 */
export async function writeTeeShot(args: WriteTeeShotArgs): Promise<LocalTeeShot> {
  const id = teeShotKey(args.gameId, args.teamNumber, args.holeNumber);
  const existing = await localDb.teeShots.get(id);
  const clientUpdatedAt = nextTeeShotStamp(existing?.clientUpdatedAt, new Date().toISOString());

  const row: LocalTeeShot = {
    id,
    gameId: args.gameId,
    teamNumber: args.teamNumber,
    holeNumber: args.holeNumber,
    teeShotBy: args.teeShotBy,
    enteredBy: args.enteredBy,
    clientUpdatedAt,
    serverUpdatedAt: null,
  };

  await localDb.transaction('rw', localDb.teeShots, localDb.teeShotQueue, async () => {
    await localDb.teeShots.put(row);
    await localDb.teeShotQueue.put({
      id,
      teeShotId: id,
      attemptCount: 0,
      lastError: null,
      createdAt: clientUpdatedAt,
    });
  });

  return row;
}

/**
 * Merges server rows (realtime, catch-up) into Dexie in one transaction, by
 * `serverTeeShotWins`: a row still in `teeShotQueue` is never overwritten,
 * otherwise last write wins.
 */
export async function mergeServerTeeShots(rows: readonly ServerTeeShotRow[]): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((r) => teeShotKey(r.gameId, r.teamNumber, r.holeNumber));
  await localDb.transaction('rw', localDb.teeShots, localDb.teeShotQueue, async () => {
    const [stored, queued] = await Promise.all([
      localDb.teeShots.bulkGet(ids),
      localDb.teeShotQueue.bulkGet(ids),
    ]);
    const puts = new Map<string, LocalTeeShot>();
    rows.forEach((incoming, i) => {
      const id = ids[i]!;
      if (!serverTeeShotWins(puts.get(id) ?? stored[i], incoming, queued[i] != null)) return;
      puts.set(id, {
        id,
        gameId: incoming.gameId,
        teamNumber: incoming.teamNumber,
        holeNumber: incoming.holeNumber,
        teeShotBy: incoming.teeShotBy,
        enteredBy: incoming.enteredBy,
        clientUpdatedAt: incoming.clientUpdatedAt,
        serverUpdatedAt: incoming.serverUpdatedAt,
      });
    });
    if (puts.size > 0) await localDb.teeShots.bulkPut([...puts.values()]);
  });
}

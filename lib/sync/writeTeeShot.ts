import { localDb, teeShotKey, type LocalTeeShot } from './db';

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
 * The stamp is strictly increasing per row, compared as instants (#2211): the
 * RPC applies a write only on strict >, so two taps in the same millisecond
 * would otherwise lose the second.
 */
export async function writeTeeShot(args: WriteTeeShotArgs): Promise<LocalTeeShot> {
  const id = teeShotKey(args.gameId, args.teamNumber, args.holeNumber);
  const nowIso = new Date().toISOString();
  const existing = await localDb.teeShots.get(id);
  const stored = existing ? Date.parse(existing.clientUpdatedAt) : Number.NaN;
  const clientUpdatedAt =
    Number.isNaN(stored) || Date.parse(nowIso) > stored ? nowIso : new Date(stored + 1).toISOString();

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

export interface ServerTeeShotRow {
  gameId: string;
  teamNumber: number;
  holeNumber: number;
  teeShotBy: string | null;
  enteredBy: string;
  clientUpdatedAt: string;
  serverUpdatedAt: string | null;
}

/** The columns realtime, catch-up and the locked-refusal read select. */
export const SERVER_TEE_SHOT_COLUMNS =
  'game_id, team_number, hole_number, tee_shot_by, entered_by, client_updated_at, updated_at';

/**
 * Merges server rows (realtime, catch-up) into Dexie, last write wins, in one
 * transaction. A row that still waits in `teeShotQueue` is never overwritten:
 * the drain sends it, and the RPC's answer settles it.
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
      if (queued[i]) return;
      const existing = puts.get(id) ?? stored[i];
      if (existing && Date.parse(existing.clientUpdatedAt) >= Date.parse(incoming.clientUpdatedAt)) return;
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

/** A `team_tee_shots` row as PostgREST and realtime deliver it. */
export interface TeeShotRowFromDb {
  game_id: string;
  team_number: number;
  hole_number: number;
  tee_shot_by: string | null;
  entered_by: string;
  client_updated_at: string;
  updated_at: string;
}

export function fromTeeShotRow(row: TeeShotRowFromDb): ServerTeeShotRow {
  return {
    gameId: row.game_id,
    teamNumber: row.team_number,
    holeNumber: row.hole_number,
    teeShotBy: row.tee_shot_by,
    enteredBy: row.entered_by,
    clientUpdatedAt: row.client_updated_at,
    serverUpdatedAt: row.updated_at,
  };
}

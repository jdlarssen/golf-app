// #2580: speil av webbens `lib/sync/writeTeeShot.ts`. Et trykk på «Hvem sitt
// utslag ble brukt?» skriver bare til `tee_shots` og køen sin, aldri via
// `writeScore`, og drainen sender det med `set_team_tee_shot_if_newer`.
//
//  1. Strengt økende `clientUpdatedAt` per (spill, lag, hull): den delte
//     `nextTeeShotStamp` (#2211).
//  2. Rad + kø-element i ÉN transaksjon, og lesingen inne i den, som
//     `writeScore`.
import { nextTeeShotStamp } from '../../../../lib/sync/teeShotRow';
import { getTeeShot, putTeeShot, putTeeShotQueueItem, teeShotKey, withTxn, type LocalTeeShot } from './db';

interface WriteTeeShotArgs {
  gameId: string;
  teamNumber: number;
  holeNumber: number;
  /** Hvem sitt utslag laget brukte; null tømmer valget. */
  teeShotBy: string | null;
  enteredBy: string;
}

export async function writeTeeShot(args: WriteTeeShotArgs): Promise<LocalTeeShot> {
  const id = teeShotKey(args.gameId, args.teamNumber, args.holeNumber);
  const nowIso = new Date().toISOString();
  return withTxn(async (txn) => {
    const existing = await getTeeShot(txn, id);
    const clientUpdatedAt = nextTeeShotStamp(existing?.clientUpdatedAt, nowIso);
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
    await putTeeShot(txn, row);
    // Kø-id = rad-id: et nytt trykk på samme hull erstatter det ventende.
    await putTeeShotQueueItem(txn, {
      id,
      teeShotId: id,
      attemptCount: 0,
      lastError: null,
      createdAt: clientUpdatedAt,
    });
    return row;
  });
}

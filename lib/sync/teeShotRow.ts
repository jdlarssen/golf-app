/**
 * «Hvem sitt utslag» (#2580): the `team_tee_shots` row as both clients see it,
 * and the two rules both apply to it. Dexie-free on purpose: the web
 * (`writeTeeShot.ts`, Dexie) and the app (`native/app/src/data/`, SQLite)
 * import it alike, so the column list, the row mapping, the merge rule and the
 * stamp rule each have one home.
 */

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

/**
 * Does a server row (realtime, catch-up) replace the local one? Never while
 * the local row waits in the queue: the drain sends it, and the RPC's answer
 * settles it. Otherwise last write wins, compared as instants (#2211: the
 * server echoes `+00:00`, the client writes `Z`, so text compares wrongly).
 */
export function serverTeeShotWins(
  existing: { clientUpdatedAt: string } | null | undefined,
  incoming: { clientUpdatedAt: string },
  queued: boolean,
): boolean {
  if (queued) return false;
  if (!existing) return true;
  // Skipped only when the stored stamp is at or after the incoming one, so an
  // unreadable stamp (NaN) lets the server row in, as the web's merge did.
  return !(Date.parse(existing.clientUpdatedAt) >= Date.parse(incoming.clientUpdatedAt));
}

/**
 * The stamp for a new local write: the clock, or 1 ms past the stored stamp
 * when that is not behind it. The RPC applies a write only on strict >, so two
 * taps in the same millisecond would otherwise lose the second (#2211:
 * compared as instants).
 */
export function nextTeeShotStamp(storedStamp: string | null | undefined, nowIso: string): string {
  const stored = storedStamp ? Date.parse(storedStamp) : Number.NaN;
  return Number.isNaN(stored) || Date.parse(nowIso) > stored ? nowIso : new Date(stored + 1).toISOString();
}

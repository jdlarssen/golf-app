import 'server-only';
import type { getAdminClient } from '@/lib/supabase/admin';

/**
 * The guard after a flight or team move (#2289): count again once the row is
 * written, and put our own rows back when the group came out overfull or the
 * count failed. The capacity check before the write alone lets two moves at
 * the same time both pass it, and no rule in the database limits the size.
 *
 * Used by the player's own move in the waiting room (`joinFlight`), the
 * organiser's moves (`setPlayerFlight`, `setPlayerTeam`) and the compensation
 * of the multi-row splits (`suggestFlightAssignment`, `suggestTeamAssignment`).
 * Its own module because a `'use server'` file may only export actions.
 */

type AdminClient = ReturnType<typeof getAdminClient>;

/** The grouping column a move writes. */
export type GroupColumn = 'flight_number' | 'team_number';

/**
 * Active players in `column = value` after our write. `null` when the read
 * failed (logged under `logPrefix`): the caller cannot confirm the group has
 * room, and treats it as a lost race.
 */
export async function recountGroup(
  admin: AdminClient,
  gameId: string,
  column: GroupColumn,
  value: number,
  logPrefix: string,
): Promise<number | null> {
  const { count, error } = await admin
    .from('game_players')
    .select('user_id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq(column, value)
    .is('withdrawn_at', null);
  if (error) {
    console.error(`[${logPrefix}] after-count read failed`, error);
    return null;
  }
  return count ?? 0;
}

/** A row to put back, with the values it had before our write. */
export type RevertRow = {
  userId: string;
  previous: { flight_number: number | null; team_number?: number | null };
};

/**
 * Writes each row back to its previous values. Best-effort: we just wrote
 * these rows, so an error or 0 rows leaves the group possibly overfull or the
 * split half done. That is logged under `logPrefix` (#2223), and the caller's
 * answer stands either way.
 */
export async function revertRows(
  admin: AdminClient,
  gameId: string,
  rows: readonly RevertRow[],
  logPrefix: string,
  /** Extra fields for the log line, e.g. the group the move went to. */
  detail: Record<string, unknown> = {},
): Promise<void> {
  for (const { userId, previous } of rows) {
    const { data: reverted, error: revertError } = await admin
      .from('game_players')
      .update(previous)
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .select('user_id');
    if (revertError || (reverted ?? []).length === 0) {
      console.error(`[${logPrefix}] revert failed`, {
        gameId,
        userId,
        previous,
        ...detail,
        error: revertError,
      });
    }
  }
}

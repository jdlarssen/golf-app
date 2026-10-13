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

/**
 * A row to put back: what our write set (`written`) and what the row held
 * before it (`previous`).
 */
export type RevertRow = {
  userId: string;
  written: { flight_number: number | null; team_number?: number | null };
  previous: { flight_number: number | null; team_number?: number | null };
};

/**
 * Writes each row back to its previous values, but only while it still holds
 * the values we wrote: a newer move (another organiser, or the player in the
 * waiting room) must not be overwritten by our undo. Best-effort: we just
 * wrote these rows, so an error leaves the group possibly overfull or the
 * split half done. That is logged under `logPrefix` (#2223); a row that no
 * longer holds our values was already moved and is logged as such. The
 * caller's answer stands either way.
 */
export async function revertRows(
  admin: AdminClient,
  gameId: string,
  rows: readonly RevertRow[],
  logPrefix: string,
  /** Extra fields for the log line, e.g. the group the move went to. */
  detail: Record<string, unknown> = {},
): Promise<void> {
  for (const { userId, written, previous } of rows) {
    let query = admin
      .from('game_players')
      .update(previous)
      .eq('game_id', gameId)
      .eq('user_id', userId);
    for (const [column, value] of Object.entries(written) as [GroupColumn, number | null][]) {
      query = value === null ? query.is(column, null) : query.eq(column, value);
    }
    const { data: reverted, error: revertError } = await query.select('user_id');
    if (revertError) {
      console.error(`[${logPrefix}] revert failed`, {
        gameId,
        userId,
        previous,
        ...detail,
        error: revertError,
      });
    } else if ((reverted ?? []).length === 0) {
      console.warn(`[${logPrefix}] revert skipped: the row was already moved`, {
        gameId,
        userId,
        written,
        ...detail,
      });
    }
  }
}

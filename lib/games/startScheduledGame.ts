import type { SupabaseClient } from '@supabase/supabase-js';
import {
  calculateCourseHandicap,
  applyAllowance,
} from '@/lib/scoring/courseHandicap';

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

export type StartScheduledGameResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'not_scheduled'
        | 'tee_missing'
        | 'no_players'
        | 'db_players'
        | 'db_game';
    };

/**
 * Idempotent, retry-safe start: freezes course_handicap per player, then
 * flips status to 'active' with an optimistic-lock guard. If status is
 * already 'active' or 'finished' (e.g. a concurrent admin clicked
 * "Start runden nå", or another auto-start guard fired first), the
 * `.eq('status', 'scheduled')` clause makes the UPDATE a no-op and we
 * return `{ ok: true }` because the desired end state was reached.
 *
 * Crash semantics: if we fail mid-loop, some players have `course_handicap`
 * set and some don't, but the game stays `scheduled`, so a retry
 * recomputes and overwrites everyone (idempotent).
 *
 * Used by:
 * - D5: admin "Start runden nå" server action (interactive)
 * - E1: server-side fallback on /games/[id] when tee-off has passed
 *
 * The caller decides redirects / revalidation based on the structured result.
 */
export async function startScheduledGame(
  supabase: SupabaseClient,
  gameId: string,
): Promise<StartScheduledGameResult> {
  // 1. Verify status is still 'scheduled' and load tee-box + allowance.
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, status, hcp_allowance_pct, tee_boxes(slope, course_rating, par_total)',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      status: GameStatus;
      hcp_allowance_pct: number;
      tee_boxes:
        | { slope: number; course_rating: number; par_total: number }
        | null;
    }>();
  if (gameError || !game) return { ok: false, reason: 'not_found' };
  if (game.status !== 'scheduled') {
    // Already started (or finished) by someone else — desired end state
    // reached for the auto-start caller; admin button caller can still
    // surface the reason if it wants to.
    if (game.status === 'active' || game.status === 'finished') {
      return { ok: true };
    }
    return { ok: false, reason: 'not_scheduled' };
  }
  const tee = game.tee_boxes;
  if (!tee) return { ok: false, reason: 'tee_missing' };

  // 2. Load all players + their hcp_index.
  const { data: roster, error: rosterError } = await supabase
    .from('game_players')
    .select('user_id, users!game_players_user_id_fkey(hcp_index)')
    .eq('game_id', gameId)
    .returns<
      { user_id: string; users: { hcp_index: number | string } | null }[]
    >();
  if (rosterError) return { ok: false, reason: 'db_players' };
  if (!roster || roster.length === 0) {
    return { ok: false, reason: 'no_players' };
  }

  // 3. Compute course_handicap per player, then write it back. Supabase
  //    returns numerics as strings in some configs, hence the Number()
  //    coercions on hcp_index and course_rating.
  for (const row of roster) {
    if (!row.users) continue; // defensive — FK constraint should prevent this
    const raw = calculateCourseHandicap({
      hcpIndex: Number(row.users.hcp_index),
      slope: tee.slope,
      courseRating: Number(tee.course_rating),
      par: tee.par_total,
    });
    const allowed = applyAllowance(raw, game.hcp_allowance_pct);
    const { error: updateError } = await supabase
      .from('game_players')
      .update({ course_handicap: allowed })
      .eq('game_id', gameId)
      .eq('user_id', row.user_id);
    if (updateError) return { ok: false, reason: 'db_players' };
  }

  // 4. Flip status to 'active' with optimistic-lock guard. If another
  //    caller beat us to the flip, the `.eq('status', 'scheduled')` clause
  //    makes this a no-op — that's fine, the end state is what we want.
  const { error: flipError } = await supabase
    .from('games')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', gameId)
    .eq('status', 'scheduled');
  if (flipError) return { ok: false, reason: 'db_game' };

  return { ok: true };
}

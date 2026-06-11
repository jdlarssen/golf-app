import type { SupabaseClient } from '@supabase/supabase-js';
import {
  calculateCourseHandicap,
  applyAllowance,
} from '@/lib/scoring/courseHandicap';
import { findPendingPlayers } from './pendingPlayers';
import type { GameStatus } from './status';
import {
  getRatingForGender,
  type TeeBoxRatings,
  type TeeGender,
} from './teeRating';
import { isMatchplayMode, isSideRosterComplete } from './matchplaySides';
import { needsFlightAssignment } from './flightScope';

export type StartScheduledGameResult =
  // `started` = denne calleren vant status-flippen (scheduled → active).
  // Konkurrerende callere (cron-sweep, E1-fallback, admin-knapp) får
  // ok:true/started:false når en annen var først — varsel-fan-out skal
  // kun skje hos vinneren, ellers dobles game_started-varslene (#502).
  | { ok: true; started: boolean }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'not_scheduled'
        | 'tee_missing'
        | 'tee_missing_rating'
        | 'no_players'
        | 'pending_players'
        | 'incomplete_sides'
        | 'unassigned_flights'
        | 'db_players'
        | 'db_game';
      pendingEmails?: string[];
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
  //    The game's tee carries up to three independent rating-sets
  //    (mens/ladies/juniors); each player picks one via tee_gender.
  //    game_mode + mode_config are loaded for the incomplete_sides guard.
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, status, hcp_allowance_pct, tee_box_id, game_mode, mode_config, tee_boxes(slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      status: GameStatus;
      hcp_allowance_pct: number;
      tee_box_id: string | null;
      game_mode: string;
      mode_config: { team_size?: number } | null;
      tee_boxes: TeeBoxRatings | null;
    }>();
  if (gameError || !game) return { ok: false, reason: 'not_found' };
  if (game.status !== 'scheduled') {
    // Already started (or finished) by someone else — desired end state
    // reached for the auto-start caller; admin button caller can still
    // surface the reason if it wants to.
    if (game.status === 'active' || game.status === 'finished') {
      return { ok: true, started: false };
    }
    return { ok: false, reason: 'not_scheduled' };
  }
  const tee = game.tee_boxes;
  if (!tee || !game.tee_box_id) return { ok: false, reason: 'tee_missing' };

  // 2. Load all players + their hcp_index + tee_gender.
  //    team_number + withdrawn_at are also fetched for the incomplete_sides guard.
  const { data: roster, error: rosterError } = await supabase
    .from('game_players')
    .select(
      'user_id, tee_gender, team_number, flight_number, withdrawn_at, users!game_players_user_id_fkey(hcp_index)',
    )
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        tee_gender: TeeGender;
        team_number: number | null;
        flight_number: number | null;
        withdrawn_at: string | null;
        users: { hcp_index: number | string } | null;
      }[]
    >();
  if (rosterError) return { ok: false, reason: 'db_players' };
  if (!roster || roster.length === 0) {
    return { ok: false, reason: 'no_players' };
  }

  // Guard: matchplay-familien krever eksakt team_size aktive spillere per side
  // (team_number ∈ {1, 2}). Spillere med null team_number eller trukkede
  // spillere blokkerer start. Alle seks matchplay-modi dekkes i ett.
  if (isMatchplayMode(game.game_mode as Parameters<typeof isMatchplayMode>[0])) {
    const teamSize = game.mode_config?.team_size ?? 1;
    const activeRoster = roster.filter((r) => r.withdrawn_at == null);
    if (!isSideRosterComplete(activeRoster, teamSize)) {
      return { ok: false, reason: 'incomplete_sides' };
    }
  }

  // Guard: store solo-formater (>4 aktive, ikke wolf) må ha alle spillere
  // fordelt i flighter før start. Matchplay og lag-formater er aldri rammet
  // (≤4 aktive, eller flight = side/lag satt av validatorene).
  // roster er allerede lastet over — vi mappar ned til FlightPlayer-formen.
  if (
    needsFlightAssignment(
      game.game_mode as Parameters<typeof needsFlightAssignment>[0],
      roster.map((r) => ({
        user_id: r.user_id,
        flight_number: r.flight_number,
        withdrawn_at: r.withdrawn_at,
      })),
    )
  ) {
    return { ok: false, reason: 'unassigned_flights' };
  }

  // Defence-in-depth: refuse to start if any roster player is still pending
  // profile completion. Task 6's publish-gate blocks this normally, but this
  // catches direct DB edits or future code paths that bypass that gate.
  const rosterIds = roster.map((r) => r.user_id);
  const { data: rosterUsers, error: rosterUsersError } = await supabase
    .from('users')
    .select('id, email, profile_completed_at')
    .in('id', rosterIds);
  if (rosterUsersError || !rosterUsers) {
    return { ok: false, reason: 'db_players' };
  }
  const pending = findPendingPlayers(rosterUsers);
  if (pending.length > 0) {
    return {
      ok: false,
      reason: 'pending_players',
      pendingEmails: pending.map((p) => p.email),
    };
  }

  // 3. Compute course_handicap per player using their gender-specific
  //    rating-set on the game's tee. Supabase returns numerics as strings
  //    in some configs, hence the Number() coercion on hcp_index.
  for (const row of roster) {
    if (!row.users) continue; // defensive — FK constraint should prevent this
    const rating = getRatingForGender(tee, row.tee_gender);
    if (!rating) return { ok: false, reason: 'tee_missing_rating' };
    const raw = calculateCourseHandicap({
      hcpIndex: Number(row.users.hcp_index),
      slope: rating.slope,
      courseRating: rating.courseRating,
      par: rating.par,
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
  //    `.select('id')` reveals who won: the winner gets the updated row
  //    back, no-op losers get an empty array (drives `started`).
  const { data: flipped, error: flipError } = await supabase
    .from('games')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', gameId)
    .eq('status', 'scheduled')
    .select('id');
  if (flipError) return { ok: false, reason: 'db_game' };

  return { ok: true, started: (flipped?.length ?? 0) > 0 };
}

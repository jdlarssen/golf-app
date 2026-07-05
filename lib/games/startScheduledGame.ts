import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import {
  calculateCourseHandicap,
  applyAllowance,
} from '@/lib/scoring/courseHandicap';
import { findPendingPlayers } from './pendingPlayers';
import { notify } from '@/lib/notifications/notify';
import type { GameStatus } from './status';
import {
  getRatingForGender,
  type TeeBoxRatings,
  type TeeGender,
} from './teeRating';
import { isMatchplayMode, isSideRosterComplete } from './matchplaySides';
import { needsFlightAssignment } from './flightScope';
import {
  assignRotationSlots,
  rotationSlotRange,
  type RotationMode,
} from './assignRotationSlots';

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
        | 'rotation_player_count'
        | 'db_players'
        | 'db_game';
      pendingEmails?: string[];
      // #969: set only for reason 'rotation_player_count' so the caller can
      // build a format-aware message («Wolf trenger 3–5 spillere — N påmeldt»).
      rotationMode?: RotationMode;
      rotationActiveCount?: number;
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
  supabase: SupabaseClient<Database>,
  gameId: string,
): Promise<StartScheduledGameResult> {
  // Starting is "begin now" — a planned tee-off that has since passed is irrelevant
  // once the game goes active. No guard against past scheduled_tee_off_at (#928 decision).
  // 1. Verify status is still 'scheduled' and load tee-box + allowance.
  //    The game's tee carries up to three independent rating-sets
  //    (mens/ladies/juniors); each player picks one via tee_gender.
  //    game_mode + mode_config are loaded for the incomplete_sides guard.
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, hcp_allowance_pct, tee_box_id, game_mode, mode_config, tee_boxes(slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
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

  // #969: Wolf / Round Robin draw their rotation slot at start, not at publish,
  // so an open-signup game can be published before anyone joins. Guard the
  // active (non-withdrawn) roster size first (fail fast, before the profile
  // check): Wolf 3–5, Round Robin exactly 4. The signup cap already prevents
  // "too many", so this really catches "too few". The actual slot draw happens
  // after all guards pass (below). For non-rotation modes `rotationRange` is
  // null and both blocks are skipped.
  const rotationRange = rotationSlotRange(game.game_mode);
  const activeRotationIds = rotationRange
    ? roster.filter((r) => r.withdrawn_at == null).map((r) => r.user_id)
    : [];
  if (rotationRange) {
    const n = activeRotationIds.length;
    if (n < rotationRange.min || n > rotationRange.max) {
      return {
        ok: false,
        reason: 'rotation_player_count',
        rotationMode: game.game_mode as RotationMode,
        rotationActiveCount: n,
      };
    }
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

  // #969: all guards passed — draw the Wolf/Round Robin rotation slot now,
  // over the final active roster. Reassign all active players a fresh
  // contiguous 1..n (idempotent on retry after a mid-loop crash). All start
  // callers run as service-role (E1 fallback, cron) or the admin/creator (D5),
  // so the 0107 immutability trigger lets these slot writes through (it only
  // blocks a non-admin player editing rows).
  if (rotationRange) {
    for (const slot of assignRotationSlots(activeRotationIds)) {
      const { error: slotError } = await supabase
        .from('game_players')
        .update({
          team_number: slot.team_number,
          flight_number: slot.flight_number,
        })
        .eq('game_id', gameId)
        .eq('user_id', slot.user_id);
      if (slotError) return { ok: false, reason: 'db_players' };
    }
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

  const started = (flipped?.length ?? 0) > 0;

  // 5. #1055: only the flip winner owns this — auto-reject any signup requests
  // still 'pending' for this game. Manual approval never caught up before
  // tee-off, so the roster is final now: leaving them pending would freeze
  // them invisibly (no game_locked redirect explains why, per the admin
  // signups actions). Reuses the existing 'rejected' status (the enum has no
  // dedicated "expired" value and the applicant-facing distinction lives in
  // the notification kind, not the DB status) so every other reader of
  // game_registration_requests.status keeps working unchanged.
  if (started) {
    await autoRejectPendingSignups(supabase, gameId, game.name);
  }

  return { ok: true, started };
}

/**
 * Best-effort: flip every still-`pending` game_registration_requests row for
 * `gameId` to `rejected` and fire one `registration_expired` notification per
 * affected applicant (#1055). Called once, only by the caller that won the
 * scheduled→active flip (mirrors the `game_started` fan-out contract).
 *
 * The status UPDATE itself is not best-effort — a DB error is logged loudly
 * so it surfaces in Vercel logs — but it never throws: the round has already
 * started at this point, and rolling back the start over a notification
 * side-effect would be worse than leaving a few requests pending for a retry.
 * Same reasoning as `notifyAchievementUnlocks` (best-effort, wrapped, never
 * throws) and the Resend mail helpers.
 */
async function autoRejectPendingSignups(
  supabase: SupabaseClient<Database>,
  gameId: string,
  gameName: string,
): Promise<void> {
  try {
    const { data: pending, error: pendingError } = await supabase
      .from('game_registration_requests')
      .select('id, user_id')
      .eq('game_id', gameId)
      .eq('status', 'pending')
      .returns<{ id: string; user_id: string }[]>();
    if (pendingError) {
      console.error(
        '[startScheduledGame] pending signup-requests fetch failed',
        { gameId, error: pendingError },
      );
      return;
    }
    if (!pending || pending.length === 0) return;

    const decidedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('game_registration_requests')
      .update({ status: 'rejected', decided_at: decidedAt })
      .in(
        'id',
        pending.map((r) => r.id),
      )
      .eq('status', 'pending');
    if (updateError) {
      console.error(
        '[startScheduledGame] auto-reject signup-requests update failed',
        { gameId, error: updateError },
      );
      return;
    }

    const results = await Promise.allSettled(
      pending.map((r) =>
        notify({
          userId: r.user_id,
          kind: 'registration_expired',
          payload: { game_id: gameId, game_name: gameName },
        }),
      ),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error(
          '[startScheduledGame] registration_expired notify failed',
          { gameId, error: r.reason },
        );
      }
    }
  } catch (err) {
    console.error('[startScheduledGame] autoRejectPendingSignups failed', {
      gameId,
      err,
    });
  }
}

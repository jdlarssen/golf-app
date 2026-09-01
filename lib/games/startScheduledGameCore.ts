import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import {
  calculateCourseHandicap,
  applyAllowance,
} from '@/lib/scoring/courseHandicap';
import { expectAffected, expectOne } from '@/lib/supabase/affectedRows';
import { findPendingPlayers } from './pendingPlayers';
import type { GameStatus } from './status';
import {
  getRatingForGender,
  type TeeBoxRatings,
  type TeeGender,
} from './teeRating';
import { isMatchplayMode, isSideRosterComplete } from './matchplaySides';
import {
  planGreensomeStartOverride,
  type GreensomeStartPlayer,
} from './greensomeOverridePlan';
import { needsFlightAssignment } from './flightScope';
import { expectedTeamSize, needsTeamAssignment } from './teamScope';
import {
  assignRotationSlots,
  rotationSlotRange,
  type RotationMode,
} from './assignRotationSlots';

/**
 * Import-pure core of the scheduled→active start (#1855). Every guard, every
 * write and the optimistic-lock flip live here; the file deliberately imports
 * nothing that only exists on a Next.js server, so the React Native app can run
 * the exact same orchestration against its own RLS-scoped Supabase client
 * instead of forking a second, drifting copy of the rules (the #1832 precedent:
 * `lib/wolf/` moved out, web imports the same file).
 *
 * The one thing that does NOT fit in here is the notification fan-out: `notify`
 * opens with `import 'server-only'` and writes via the service-role client. So
 * the auto-reject step (#1055) does its DB write here and RETURNS the affected
 * applicants; the caller owns the varsling. `lib/games/startScheduledGame.ts` is
 * that caller on web — a thin wrapper that fires `registration_expired` per
 * returned applicant and hands back the narrow result the web callsites already
 * consume.
 */

/**
 * One signup request that the start auto-rejected (#1055). Returned instead of
 * notified, so a caller without server-side notification access (the RN app)
 * still gets a correct start, and a caller that has it can fan out.
 */
export type ExpiredSignup = { requestId: string; userId: string };

/**
 * The refusal shape, shared by the core and the web wrapper so the reason-union
 * has exactly one home.
 */
export type StartScheduledGameFailure = {
  ok: false;
  reason:
    | 'not_found'
    | 'not_scheduled'
    | 'tee_missing'
    | 'tee_missing_rating'
    | 'no_players'
    | 'pending_players'
    | 'incomplete_sides'
    | 'unassigned_teams'
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

export type StartScheduledGameCoreResult =
  // `started` = denne calleren vant status-flippen (scheduled → active).
  // Konkurrerende callere (cron-sweep, E1-fallback, admin-knapp) får
  // ok:true/started:false når en annen var først — varsel-fan-out skal
  // kun skje hos vinneren, ellers dobles game_started-varslene (#502).
  //
  // `gameName` + `expiredSignups` er råstoff for den fan-outen: navnet går inn
  // i varsel-payloaden, og lista er søkerne steg 5 nettopp avslo (tom når
  // ingenting ble avslått, og alltid tom når `started` er false).
  | {
      ok: true;
      started: boolean;
      gameName: string;
      expiredSignups: ExpiredSignup[];
    }
  | StartScheduledGameFailure;

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
 * #1628: a cup greensome also gets its stored team-strokes suggestion
 * re-derived here, from the same freshly computed handicaps — see
 * `planGreensomeStartOverride`. Runs before the status flip so a retry after a
 * crash redoes it from identical inputs.
 *
 * Used by:
 * - D5: admin "Start runden nå" server action (interactive)
 * - E1: server-side fallback on /games/[id] when tee-off has passed
 * - the React Native app, with its own RLS-scoped client (#1855)
 *
 * — all of them through `startScheduledGame` on web, which adds the
 * notification fan-out on top.
 *
 * The caller decides redirects / revalidation based on the structured result.
 */
export async function startScheduledGameCore(
  supabase: SupabaseClient<Database>,
  gameId: string,
): Promise<StartScheduledGameCoreResult> {
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
    .maybeSingle<{
      id: string;
      name: string;
      status: GameStatus;
      hcp_allowance_pct: number;
      tee_box_id: string | null;
      game_mode: string;
      // #1628: greensomens lag-slag-felter leses også herfra (rå JSON, lest
      // defensivt av `planGreensomeStartOverride`), og hele objektet skrives
      // tilbake ved en re-derivering — derfor en åpen form, ikke bare team_size.
      mode_config: ({ team_size?: number } & Record<string, unknown>) | null;
      tee_boxes: TeeBoxRatings | null;
    }>();
  // Error ≠ absence (#1445): a transient query failure must report as a
  // transient DB reason, not 'not_found'. The distinction is load-bearing for
  // the cron sweep — 'db_game' is not a structural block reason, so the game is
  // retried next minute instead of firing an «auto-start blokkert»-varsel to the
  // organiser about a game that is perfectly fine. Only a genuine 0-row result
  // (maybeSingle: data null, error null) means the game is gone.
  if (gameError) {
    console.error('[startScheduledGame] game fetch failed', {
      gameId,
      error: gameError,
    });
    return { ok: false, reason: 'db_game' };
  }
  if (!game) return { ok: false, reason: 'not_found' };
  if (game.status !== 'scheduled') {
    // Already started (or finished) by someone else — desired end state
    // reached for the auto-start caller; admin button caller can still
    // surface the reason if it wants to.
    if (game.status === 'active' || game.status === 'finished') {
      return {
        ok: true,
        started: false,
        gameName: game.name,
        expiredSignups: [],
      };
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

  // Lagstørrelsen begge lag-vaktene under klassifiserer på — samme helper og
  // samme fallback (1 = solo) som Lag-seksjonen og team-actionene, så «trenger
  // dette spillet lag?» har ett hjem (#1669).
  const teamSize = expectedTeamSize(game.mode_config);

  // Guard: matchplay-familien krever eksakt team_size aktive spillere per side
  // (team_number ∈ {1, 2}). Spillere med null team_number eller trukkede
  // spillere blokkerer start. Alle seks matchplay-modi dekkes i ett.
  if (isMatchplayMode(game.game_mode as Parameters<typeof isMatchplayMode>[0])) {
    const activeRoster = roster.filter((r) => r.withdrawn_at == null);
    if (!isSideRosterComplete(activeRoster, teamSize)) {
      return { ok: false, reason: 'incomplete_sides' };
    }
  }

  // Guard: lag-formater (best ball, scramble-familien, shamble, patsome,
  // par-stableford) må ha alle aktive spillere fordelt på lag før start.
  // Solo-selvpåmelding setter team_number = null, og scoring-computene hopper
  // stille over slike rader — uten denne vakta starter spillet og tavla er tom
  // (#1669). Matchplay dekkes av incomplete_sides over, solo-formater har
  // ingen lag: `needsTeamAssignment` returnerer false for begge.
  if (
    needsTeamAssignment(
      game.game_mode as Parameters<typeof needsTeamAssignment>[0],
      teamSize,
      roster.map((r) => ({
        user_id: r.user_id,
        team_number: r.team_number,
        flight_number: r.flight_number,
        withdrawn_at: r.withdrawn_at,
      })),
    )
  ) {
    return { ok: false, reason: 'unassigned_teams' };
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
  // Best-effort by design (#1445): 'db_players' er riktig for begge ben her.
  // Dette er en listequery — `!rosterUsers` uten feil forekommer ikke i praksis
  // (PostgREST gir [] ved 0 treff), og rosterIds er ikke-tom på dette punktet,
  // så et tomt svar ville uansett vært en DB-anomali, ikke ekte fravær.
  if (rosterUsersError || !rosterUsers) {
    if (rosterUsersError) {
      console.error('[startScheduledGame] roster users lookup failed', {
        gameId,
        error: rosterUsersError,
      });
    }
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
  // contiguous 1..n (idempotent on retry after a mid-loop crash).
  //
  // ⚠️ #1855: the caller set is no longer "service-role or admin". This file
  // became shared code so the native app could run it, and the app calls it as
  // a plain authenticated CREATOR. That is exactly what surfaced the missing
  // own-row escape in `guard_game_players_self_update` (migration 0168): the
  // organiser's own slot write raised 42501 while everyone else's went through.
  //
  // #1871: a trigger raise surfaces as an error and was always caught. What was
  // NOT caught was a POLICY filtering the row away: 0 rows, `error === null`,
  // and the round started with unfrozen course handicaps or without rotation
  // slots — silently. All three writes from here down (the slots, the
  // course_handicap freeze, the greensome mode_config override) therefore chain
  // `.select()` and go through `expectOne`, so a filtered row becomes the typed
  // refusal this function already returns instead of a quiet no-op. That is a
  // behaviour change on web too, and the intended one: a path that used to
  // no-op now answers `db_players` / `db_game`.
  if (rotationRange) {
    for (const slot of assignRotationSlots(activeRotationIds)) {
      try {
        expectOne(
          await supabase
            .from('game_players')
            .update({
              team_number: slot.team_number,
              flight_number: slot.flight_number,
            })
            .eq('game_id', gameId)
            .eq('user_id', slot.user_id)
            .select('user_id'),
          'startScheduledGameCore/rotationSlot',
        );
      } catch (err) {
        console.error('[startScheduledGame] rotation slot write failed', {
          gameId,
          userId: slot.user_id,
          err,
        });
        return { ok: false, reason: 'db_players' };
      }
    }
  }

  // 3. Compute course_handicap per player using their gender-specific
  //    rating-set on the game's tee. Supabase returns numerics as strings
  //    in some configs, hence the Number() coercion on hcp_index.
  const frozenPlayers: GreensomeStartPlayer[] = [];
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
    frozenPlayers.push({
      teamNumber: row.team_number,
      withdrawnAt: row.withdrawn_at,
      rawCourseHandicap: raw,
    });
    const allowed = applyAllowance(raw, game.hcp_allowance_pct);
    try {
      expectOne(
        await supabase
          .from('game_players')
          .update({ course_handicap: allowed })
          .eq('game_id', gameId)
          .eq('user_id', row.user_id)
          .select('user_id'),
        'startScheduledGameCore/freezeCourseHandicap',
      );
    } catch (err) {
      console.error('[startScheduledGame] course_handicap freeze failed', {
        gameId,
        userId: row.user_id,
        err,
      });
      return { ok: false, reason: 'db_players' };
    }
  }

  // 3b. #1628: greensomens lagrede lag-slag ble foreslått da cupen ble
  //     generert — typisk dagen før. Er forslaget fortsatt urørt, skal det
  //     følge et handicap som er rettet i mellomtiden, og `raw`-tallene over
  //     er nøyaktig samme basis genereringen brukte. Hånd-redigerte tall og
  //     kamper generert før #1628 (uten auto-spor) står urørt.
  //     Kjører FØR status-flippen, så en retry etter en krasj re-deriverer
  //     fra de samme inputene (idempotent).
  const overridePlan = planGreensomeStartOverride({
    gameMode: game.game_mode,
    modeConfig: game.mode_config,
    players: frozenPlayers,
  });
  if (overridePlan) {
    const base =
      game.mode_config && typeof game.mode_config === 'object'
        ? (game.mode_config as Record<string, Json>)
        : {};
    // Merge, aldri erstatt: kind/team_size/allowance_pct må overleve.
    const nextConfig: Json = {
      ...base,
      team_strokes_override: overridePlan.teamStrokesOverride,
      team_strokes_override_auto: overridePlan.teamStrokesOverrideAuto,
    };
    try {
      expectOne(
        await supabase
          .from('games')
          .update({ mode_config: nextConfig })
          .eq('id', gameId)
          .select('id'),
        'startScheduledGameCore/greensomeOverride',
      );
    } catch (err) {
      console.error('[startScheduledGame] greensome override write failed', {
        gameId,
        err,
      });
      return { ok: false, reason: 'db_game' };
    }
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
  const expiredSignups = started
    ? await autoRejectPendingSignups(supabase, gameId)
    : [];

  return { ok: true, started, gameName: game.name, expiredSignups };
}

/**
 * Best-effort: flip every still-`pending` game_registration_requests row for
 * `gameId` to `rejected` and return the affected applicants so the caller can
 * fire one `registration_expired` notification each (#1055). Called once, only
 * by the caller that won the scheduled→active flip (mirrors the `game_started`
 * fan-out contract).
 *
 * The status UPDATE itself is not best-effort — a DB error is logged loudly
 * so it surfaces in Vercel logs — but it never throws: the round has already
 * started at this point, and rolling back the start over a notification
 * side-effect would be worse than leaving a few requests pending for a retry.
 * Same reasoning as `notifyAchievementUnlocks` (best-effort, wrapped, never
 * throws) and the Resend mail helpers. Every failure path therefore returns an
 * empty list — nothing to notify, start unharmed.
 *
 * «Affected» is literal since #1867: the UPDATE chains `.select('id')` and the
 * returned rows are the ones that actually flipped, so an applicant whose row a
 * policy filtered away is never told their request expired.
 *
 * RLS: the write is legal for the organiser too, not just service-role — the
 * `game_reg_requests admin update` policy (0092) allows
 * `is_game_creator_or_admin(game_id)` — so the RN app's user-scoped client can
 * run this same step (#1855).
 */
async function autoRejectPendingSignups(
  supabase: SupabaseClient<Database>,
  gameId: string,
): Promise<ExpiredSignup[]> {
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
      return [];
    }
    if (!pending || pending.length === 0) return [];

    const decidedAt = new Date().toISOString();
    // #1867: trap 2 (`docs/bug-prevention.md`) in its plain form — PostgREST
    // answers `error == null` for an UPDATE that RLS filtered down to zero
    // rows. Without `.select()` this step reported every applicant as expired
    // and the wrapper fired `registration_expired` for requests still sitting
    // `pending` in the database. `.select('id')` names the rows that actually
    // flipped: only those are notified, and a 0-row result throws into the
    // catch below (logged, empty list, start unharmed).
    //
    // Not a live bug today — every current caller is service-role or the
    // organiser, and `game_reg_requests admin update` (0092) lets the organiser
    // through on both `using` and `with check`. It is hardening, because the
    // core stopped having exactly three callers with guaranteed write access
    // when it became shared code (#1855).
    const rejected = expectAffected(
      await supabase
        .from('game_registration_requests')
        .update({ status: 'rejected', decided_at: decidedAt })
        .in(
          'id',
          pending.map((r) => r.id),
        )
        .eq('status', 'pending')
        .select('id'),
      'autoRejectPendingSignups',
    );
    const rejectedIds = new Set(rejected.map((r) => r.id));

    return pending
      .filter((r) => rejectedIds.has(r.id))
      .map((r) => ({ requestId: r.id, userId: r.user_id }));
  } catch (err) {
    console.error('[startScheduledGame] autoRejectPendingSignups failed', {
      gameId,
      err,
    });
    return [];
  }
}

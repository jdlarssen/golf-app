import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import type { StartScheduledGameFailure } from '@/lib/games/startScheduledGameCore';
import { acceptedAtForActor } from '@/lib/games/participantAcceptance';
import { teeGenderOf } from '@/lib/games/teeGender';
import { leagueFlightGameConfig } from './flightFormat';
import { roundPlayerLocks } from './roundLocks';
import { meetsFlightMinimum } from './flightRules';
import { frozenDefaultFor } from './simSettings';
import type { LeagueFormat } from './types';

const GAME_NAME_MAX = 120;

/**
 * Why a player could not start a flight. One union for the web action, the
 * app route (`POST /api/liga/rounds/[roundId]/start`) and the app's copy; the
 * route maps every member to an HTTP status in a `Record` without a default,
 * so a new code fails tsc there.
 */
export type LeagueStartRefusal =
  | 'round_not_found'
  | 'league_not_found'
  | 'league_not_active'
  | 'outside_window'
  | 'round_not_ready'
  | 'need_marker'
  | 'members_failed'
  | 'not_member'
  | 'already_played'
  | 'flight_in_progress'
  | 'co_player_locked'
  | 'round_check_failed'
  | 'settings_freeze_failed'
  | 'insert_failed'
  | `start_${StartScheduledGameFailure['reason']}`;

export type LeagueStartResult =
  | { ok: true; gameId: string }
  | { ok: false; error: LeagueStartRefusal };

type UserClient = SupabaseClient<Database>;

/**
 * #2223: compensating delete for the flight game the start just wrote. An
 * error or 0 rows leaves the orphan behind, so it is logged with the id.
 */
async function rollbackFlightGame(supabase: UserClient, gameId: string): Promise<void> {
  const { data, error } = await supabase.from('games').delete().eq('id', gameId).select('id');
  if (error || (data ?? []).length === 0) {
    console.error('[league] startLeagueRoundFlight rollback failed', { gameId, error });
  }
}

/**
 * #2214: one counted flight per player per round. Nobody in the new flight may
 * already have delivered the round or be playing it in another flight
 * (roundPlayerLocks). Returns the refusal code, or null when everyone is free.
 *
 * The read runs on the admin client: under the games SELECT policy the starter
 * cannot see a co-player's flight, so a request-client read comes back empty
 * and lets everyone through. The caller has checked that the user is signed in
 * and that everyone in flightIds is a member; the read is bounded to one round
 * and these few players, so it needs no paging. A failed read refuses, never a
 * silent pass.
 */
async function roundLockRefusal(
  roundId: string,
  starterId: string,
  flightIds: string[],
): Promise<LeagueStartRefusal | null> {
  const { data: roundFlights, error } = await getAdminClient()
    .from('games')
    .select('id, status, game_players!inner(user_id, withdrawn_at)')
    .eq('league_round_id', roundId)
    .in('status', ['scheduled', 'active', 'finished'])
    .in('game_players.user_id', flightIds);
  if (error || !roundFlights) {
    console.error('[league] startLeagueRoundFlight round check failed', { roundId, error });
    return 'round_check_failed';
  }
  const locks = roundPlayerLocks(
    roundFlights.map((g) => ({
      status: g.status,
      players: (g.game_players as Array<{ user_id: string; withdrawn_at: string | null }>).map(
        (p) => ({ userId: p.user_id, withdrawnAt: p.withdrawn_at }),
      ),
    })),
  );
  if (locks.delivered.has(starterId)) return 'already_played';
  if (locks.inProgress.has(starterId)) return 'flight_in_progress';
  if (flightIds.some((id) => locks.delivered.has(id) || locks.inProgress.has(id))) {
    return 'co_player_locked';
  }
  return null;
}

/**
 * #2638: the first start of a round in a simulator league freezes the league
 * default into `league_rounds.sim_frozen_default` (0214), so a later change of
 * the default never moves a round that is in play or done; the round shows its
 * override over that (`roundSimSettings`). The organiser's override itself is
 * locked by the database from the first game on (0212).
 * Only while no game exists for the round: after that the round is already
 * frozen. Two simultaneous first starts write the same value.
 *
 * `wrote` tells the caller to undo the freeze (`unfreezeRoundSettings`) if the
 * start fails further on. A failed read or write gives `ok: false`; the start
 * then stops before anything is inserted.
 */
async function freezeRoundSettings(
  roundId: string,
  leagueSettings: unknown,
): Promise<{ ok: false } | { ok: true; wrote: boolean }> {
  const admin = getAdminClient();
  const { count, error } = await admin
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('league_round_id', roundId);
  if (error || count === null) {
    console.error('[league] startLeagueRoundFlight freeze check failed', { roundId, error });
    return { ok: false };
  }
  if (count > 0) return { ok: true, wrote: false };

  try {
    expectAffected(
      await admin
        .from('league_rounds')
        .update({ sim_frozen_default: frozenDefaultFor(leagueSettings) })
        .eq('id', roundId)
        .select('id'),
      'freezeRoundSettings',
    );
    return { ok: true, wrote: true };
  } catch (err) {
    console.error('[league] startLeagueRoundFlight settings freeze failed', { roundId, err });
    return { ok: false };
  }
}

/**
 * Compensation for a freeze whose start then failed (trap 5): the round's
 * frozen default goes back to what it was, so a round nobody has started is
 * not stuck with a copy of an old default. Only while the round still has no
 * game; a player who started it in the meantime owns the frozen default. Best
 * effort: a failure is logged and the player's refusal stands.
 */
async function unfreezeRoundSettings(roundId: string, previous: Json | null): Promise<void> {
  const admin = getAdminClient();
  const { count, error } = await admin
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('league_round_id', roundId);
  if (error || count !== 0) {
    if (error) console.error('[league] startLeagueRoundFlight unfreeze check failed', { roundId, error });
    return;
  }
  try {
    expectAffected(
      await admin
        .from('league_rounds')
        .update({ sim_frozen_default: previous })
        .eq('id', roundId)
        .select('id'),
      'unfreezeRoundSettings',
    );
  } catch (err) {
    console.error('[league] startLeagueRoundFlight unfreeze failed', { roundId, err });
  }
}

/**
 * A participant starts a flight for a round (#2638: moved here from the web
 * action so the app route runs the same code). Server-enforces the play
 * window, membership, the marker rule (`meetsFlightMinimum`: two players, one
 * in a simulator league) and one counted flight per player. Creates a flight
 * game in the league's format (`leagueFlightGameConfig`; course/tee from the
 * round, falling back to the league), freezes handicaps and flips it to
 * active via startScheduledGame, and flags the flight if it was created past
 * the round's original window (only possible after an admin override).
 *
 * `supabase` reads and writes as the player: the web's cookie client or the
 * app's caller-scoped client. `userId` is the signed-in player, from the
 * session or the validated token, never from a body. No redirects here.
 */
export async function startLeagueRoundFlightCore(
  supabase: UserClient,
  userId: string,
  roundId: string,
  coPlayerUserIds: string[],
): Promise<LeagueStartResult> {
  const refuse = (error: LeagueStartRefusal): LeagueStartResult => ({ ok: false, error });

  const { data: round, error: rErr } = await supabase
    .from('league_rounds')
    .select('id, league_id, course_id, tee_box_id, opens_at, closes_at, original_closes_at, sim_frozen_default')
    .eq('id', roundId)
    .maybeSingle();
  if (rErr || !round) return refuse('round_not_found');

  const { data: league, error: lErr } = await supabase
    .from('leagues')
    .select('id, name, course_id, tee_box_id, status, format, is_simulator, sim_settings')
    .eq('id', round.league_id)
    .maybeSingle();
  if (lErr || !league) return refuse('league_not_found');
  if (league.status !== 'active') return refuse('league_not_active');

  // Flight-spillformatet følger ligaen (slagspill / stableford / modifisert).
  // En stableford-flight rendrer det vanlige stableford-scorekortet uendret.
  const { gameMode, modeConfig } = leagueFlightGameConfig(league.format as LeagueFormat);

  // Window gate (server-enforced).
  const now = Date.now();
  if (now < new Date(round.opens_at).getTime() || now > new Date(round.closes_at).getTime()) {
    return refuse('outside_window');
  }

  // Resolve course/tee from round → league.
  const courseId = round.course_id ?? league.course_id;
  const teeBoxId = round.tee_box_id ?? league.tee_box_id;
  if (!courseId || !teeBoxId) return refuse('round_not_ready');

  // Membership + marker rule: caller + distinct co-players, all members; two,
  // or one in a simulator league (flightRules, #2638).
  const flightIds = Array.from(new Set([userId, ...coPlayerUserIds.filter((id) => id !== userId)]));
  if (!meetsFlightMinimum(flightIds.length, league.is_simulator)) return refuse('need_marker');

  const { data: members, error: mErr } = await supabase
    .from('league_players')
    .select('user_id')
    .eq('league_id', league.id);
  if (mErr) return refuse('members_failed');
  const memberSet = new Set((members ?? []).map((m) => m.user_id));
  if (!flightIds.every((id) => memberSet.has(id))) return refuse('not_member');

  // #2214: one counted flight per player per round (roundLockRefusal).
  const lockRefusal = await roundLockRefusal(roundId, userId, flightIds);
  if (lockRefusal) return refuse(lockRefusal);

  // #2638: every gate has passed; freeze the round's settings before the
  // insert, while no game exists for the round yet. A later failure undoes it.
  let froze = false;
  if (league.is_simulator) {
    const freeze = await freezeRoundSettings(roundId, league.sim_settings);
    if (!freeze.ok) return refuse('settings_freeze_failed');
    froze = freeze.wrote;
  }
  const fail = async (error: LeagueStartRefusal): Promise<LeagueStartResult> => {
    if (froze) await unfreezeRoundSettings(roundId, round.sim_frozen_default);
    return refuse(error);
  };

  // tee_gender per player from profile.
  const { data: roster } = await supabase.from('users').select('id, gender').in('id', flightIds);
  const genderById = new Map<string, string | null>(
    (roster ?? []).map((u) => [u.id, (u.gender as string | null) ?? null]),
  );

  const deliveredOutsideWindow = now > new Date(round.original_closes_at).getTime();
  const name = `${league.name} – Runde`.slice(0, GAME_NAME_MAX);

  // #2207: league_round_id is server-owned. The league table counts finished
  // games per round with the service role, so the database lets only the
  // service role and admins set the link (guard_games_league_round_id). Every
  // rule above (window, membership, marker, one counted flight) ran here on
  // the server; the insert itself goes through the admin client. created_by
  // stays the player, so the game_players insert, the compensation and
  // startScheduledGame below still run on their own client under the creator
  // policies.
  const { data: game, error: gErr } = await getAdminClient()
    .from('games')
    .insert({
      name,
      course_id: courseId,
      tee_box_id: teeBoxId,
      status: 'scheduled',
      game_mode: gameMode,
      mode_config: modeConfig,
      created_by: userId,
      league_round_id: roundId,
      delivered_outside_window: deliveredOutsideWindow,
    })
    .select('id')
    .single();
  if (gErr || !game) {
    console.error('[league] startLeagueRoundFlight game insert failed', { roundId, error: gErr });
    return fail('insert_failed');
  }
  const gameId = (game as { id: string }).id;

  const flightNow = new Date().toISOString();
  // #2567: this insert goes through the player's own client on purpose, so RLS
  // and the triggers check every row. The trigger's league branch (0208) lets
  // the league's own members into a flight. Do not switch it to the admin client.
  const { error: gpErr } = await supabase.from('game_players').insert(
    flightIds.map((uid) => ({
      game_id: gameId,
      user_id: uid,
      // Liga er solo → team_number null. team_number 1 uten flight_number brøt
      // CHECK-constrainten game_players_team_flight_consistency (#647). Og
      // game_players har INGEN status-kolonne — den lå her før og fikk hele
      // flight-inserten avvist, så ingen kunne spille en eneste runde.
      team_number: null,
      tee_gender: teeGenderOf(genderById.get(uid) ?? null),
      // #463: den som starter flighten bekreftes nå; medspillere i flighten
      // er «Ikke bekreftet» til de selv bekrefter / blir aktive.
      accepted_at: acceptedAtForActor(userId, uid, flightNow),
    })),
  );
  if (gpErr) {
    console.error('[league] startLeagueRoundFlight game_players insert failed', {
      roundId,
      gameId,
      error: gpErr,
    });
    await rollbackFlightGame(supabase, gameId);
    return fail('insert_failed');
  }

  // Freeze handicaps + flip to active. On failure, roll back the half-made flight.
  // ORDER MATTERS: game_players were inserted above, before this call. That is
  // what lets startScheduledGame (on the user client) read co-players'
  // users.hcp_index — the "users select own or shared games" RLS policy only
  // grants that once the caller shares a game with them. Keep insert-before-start.
  const started = await startScheduledGame(supabase, gameId);
  if (!started.ok) {
    // #2223: check the compensation. The game_players delete only logs an error
    // (the games delete cascades them anyway).
    const { error: playersRollbackErr } = await supabase
      .from('game_players')
      .delete()
      .eq('game_id', gameId);
    if (playersRollbackErr) {
      console.error('[league] startLeagueRoundFlight players rollback failed', {
        gameId,
        error: playersRollbackErr,
      });
    }
    await rollbackFlightGame(supabase, gameId);
    return fail(`start_${started.reason}`);
  }

  return { ok: true, gameId };
}

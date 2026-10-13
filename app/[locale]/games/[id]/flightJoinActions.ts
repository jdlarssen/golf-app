'use server';

import { expireGameCache } from '@/lib/games/expireGameCache';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { MAX_FLIGHT_SIZE, flightIsFreeGrouping } from '@/lib/games/flightScope';
import { expectedTeamSize } from '@/lib/games/teamScope';
import { expectAffected, NoRowsAffectedError } from '@/lib/supabase/affectedRows';
import { recountGroup, revertRows } from '@/lib/games/flightMoveGuard';
import type { GameMode } from '@/lib/scoring/modes/types';

export type FlightJoinResult =
  | { ok: true }
  | { ok: false; error: FlightJoinError };

export type FlightJoinError =
  | 'not_authed'
  | 'not_member'
  | 'flight_bound_to_team'
  | 'game_not_scheduled'
  | 'flight_full'
  | 'db_error';

/**
 * Spiller velger eller bytter flight selv i venterommet (#543).
 *
 * Authz: kun aktive (ikke-trukkede) spillere i det schedulede spillet.
 * Race-guard: re-tell etter skriv; hvis flighten er overfull, angrer vi
 * vår egen rad og returnerer `flight_full`-feil.
 *
 * Arrangøren flytter spillere på Startlista (`setPlayerFlight`, #2289), med
 * den samme etter-tellingen (`lib/games/flightMoveGuard.ts`).
 */
export async function joinFlight(
  gameId: string,
  targetFlight: number,
): Promise<FlightJoinResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false, error: 'not_authed' };

  if (!Number.isInteger(targetFlight) || targetFlight < 1) {
    return { ok: false, error: 'db_error' };
  }

  const admin = getAdminClient();

  // Verifiser at spilleren er aktiv deltaker i dette scheduled-spillet.
  const { data: membership, error: membershipError } = await admin
    .from('game_players')
    .select('user_id, withdrawn_at, flight_number, team_number')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle<{
      user_id: string;
      withdrawn_at: string | null;
      flight_number: number | null;
      team_number: number | null;
    }>();

  // Error ≠ absence (#1441, #2293): a failed read is db_error, never «du er
  // ikke deltaker».
  if (membershipError) {
    console.error('[joinFlight] membership read failed', membershipError);
    return { ok: false, error: 'db_error' };
  }
  if (!membership || membership.withdrawn_at != null) {
    return { ok: false, error: 'not_member' };
  }

  // Lag-formater (scramble-familien, par-stableford, best ball, lag-matchplay)
  // setter flight = lag i validatoren, og hull-siden, RLS-hjelperen
  // `can_score_for` og lag-kortene leser flighten. Får en spiller flytte seg,
  // står hen igjen i et annet lags flight med sitt eget lags scoring — kan
  // taste for feil lag og ser feil kort. Velgeren (#543) er for solo-formater
  // der flight er en fri gruppering; den skjules på hjemmesiden for spillere
  // med lag, og dette er server-siden av samme regel (#2009: første spill med
  // fire lag gjorde knappene synlige i praksis).
  if (typeof membership.team_number === 'number') {
    return { ok: false, error: 'flight_bound_to_team' };
  }

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('status, game_mode, mode_config')
    .eq('id', gameId)
    .maybeSingle<{
      status: string;
      game_mode: GameMode;
      mode_config: { team_size?: number } | null;
    }>();

  if (gameError) {
    console.error('[joinFlight] game read failed', gameError);
    return { ok: false, error: 'db_error' };
  }
  if (!game || game.status !== 'scheduled') {
    return { ok: false, error: 'game_not_scheduled' };
  }

  // #2290: the format decides, not just whether the player has a team yet.
  // With solo signup into a team format the player has no team until the
  // organiser assigns one, and a flight picked here would split them from it.
  if (!flightIsFreeGrouping(game.game_mode, expectedTeamSize(game.mode_config))) {
    return { ok: false, error: 'flight_bound_to_team' };
  }

  const previousFlight = membership.flight_number;

  // Kapasitetssjekk FØR skriv: tell aktive i target-flight unntatt oss selv.
  const { count: beforeCount, error: countError } = await admin
    .from('game_players')
    .select('user_id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('flight_number', targetFlight)
    .neq('user_id', userId)
    .is('withdrawn_at', null);

  if (countError) return { ok: false, error: 'db_error' };
  if ((beforeCount ?? 0) >= MAX_FLIGHT_SIZE) {
    return { ok: false, error: 'flight_full' };
  }

  // Skriv vår nye flight. 0 rows means the row is gone (the player was
  // removed since the membership read): not_member, never ok (#2293).
  try {
    expectAffected(
      await admin
        .from('game_players')
        .update({ flight_number: targetFlight })
        .eq('game_id', gameId)
        .eq('user_id', userId)
        .select('user_id'),
      'joinFlight',
    );
  } catch (updateError) {
    if (updateError instanceof NoRowsAffectedError) {
      return { ok: false, error: 'not_member' };
    }
    console.error('[joinFlight] update failed', {
      gameId,
      userId,
      targetFlight,
      error: updateError,
    });
    return { ok: false, error: 'db_error' };
  }

  // Race-guard: re-tell etter skriv. Hvis flighten nå har > MAX_FLIGHT_SIZE
  // aktive spillere, er vi taperen — angre vår egen rad, til forrige flight
  // (eller null hvis vi ikke hadde flight). A failed re-count cannot confirm
  // the flight has room: undo our row the same way as a lost race (#2293).
  const afterCount = await recountGroup(admin, gameId, 'flight_number', targetFlight, 'joinFlight');
  if (afterCount === null || afterCount > MAX_FLIGHT_SIZE) {
    await revertRows(
      admin,
      gameId,
      [{ userId, previous: { flight_number: previousFlight } }],
      'joinFlight',
      { targetFlight },
    );
    return { ok: false, error: afterCount === null ? 'db_error' : 'flight_full' };
  }

  expireGameCache(gameId);
  return { ok: true };
}

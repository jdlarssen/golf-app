'use server';

import { revalidateTag } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { MAX_FLIGHT_SIZE } from '@/lib/games/flightScope';

export type FlightJoinResult =
  | { ok: true }
  | { ok: false; error: FlightJoinError };

export type FlightJoinError =
  | 'not_authed'
  | 'not_member'
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
 * Admin/oppretter-override: skjer via admin-sidekanalens per-spiller-velger
 * og vinner alltid siden det er siste skriv.
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
  const { data: membership } = await admin
    .from('game_players')
    .select('user_id, withdrawn_at, flight_number')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle<{
      user_id: string;
      withdrawn_at: string | null;
      flight_number: number | null;
    }>();

  if (!membership || membership.withdrawn_at != null) {
    return { ok: false, error: 'not_member' };
  }

  const { data: game } = await admin
    .from('games')
    .select('status')
    .eq('id', gameId)
    .maybeSingle<{ status: string }>();

  if (!game || game.status !== 'scheduled') {
    return { ok: false, error: 'game_not_scheduled' };
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

  // Skriv vår nye flight.
  const { error: updateError } = await admin
    .from('game_players')
    .update({ flight_number: targetFlight })
    .eq('game_id', gameId)
    .eq('user_id', userId);

  if (updateError) return { ok: false, error: 'db_error' };

  // Race-guard: re-tell etter skriv. Hvis flighten nå har > MAX_FLIGHT_SIZE
  // aktive spillere, er vi taperen — angre vår egen rad.
  const { count: afterCount } = await admin
    .from('game_players')
    .select('user_id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('flight_number', targetFlight)
    .is('withdrawn_at', null);

  if ((afterCount ?? 0) > MAX_FLIGHT_SIZE) {
    // Revert til forrige flight (eller null hvis vi ikke hadde flight).
    await admin
      .from('game_players')
      .update({ flight_number: previousFlight })
      .eq('game_id', gameId)
      .eq('user_id', userId);
    return { ok: false, error: 'flight_full' };
  }

  revalidateTag(`game-${gameId}`, 'max');
  return { ok: true };
}

// Re-eksport for konveniense (client-komponenten trenger bare denne filen).
export { getProxyVerifiedUserId };

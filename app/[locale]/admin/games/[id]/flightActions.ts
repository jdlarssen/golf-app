'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import {
  suggestFlightSplit,
  eligibleForFlightAssignment,
  MAX_FLIGHT_SIZE,
  type FlightPlayer,
} from '@/lib/games/flightScope';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Admin/creator: action-kontekst med authz og admin-client for flight-actions.
 */
async function loadFlightContext(gameId: string) {
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const admin = getAdminClient();
  return {
    supabase,
    admin,
    userId: ctx.userId,
    detailPath: `/admin/games/${gameId}`,
  };
}

/**
 * Henter aktive spillere for flight-inndeling, sortert på created_at ASC
 * (påmeldingsrekkefølge). Returnerer null ved DB-feil.
 */
async function fetchFlightPlayers(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
): Promise<(FlightPlayer & { created_at: string | null })[] | null> {
  const { data, error } = await admin
    .from('game_players')
    .select('user_id, flight_number, withdrawn_at, created_at')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true })
    .order('user_id', { ascending: true })
    .returns<
      {
        user_id: string;
        flight_number: number | null;
        withdrawn_at: string | null;
        created_at: string | null;
      }[]
    >();
  if (error) return null;
  return data ?? [];
}

/**
 * Admin/creator: foreslår og skriver flight-inndeling for alle aktive
 * spillere i grupper av MAX_FLIGHT_SIZE (påmeldingsrekkefølge).
 *
 * Redirecter tilbake til admin-siden med ?status=flight_suggested ved suksess,
 * eller ?error=... ved feil.
 */
export async function suggestFlightAssignment(gameId: string): Promise<void> {
  const { admin, detailPath } = await loadFlightContext(gameId);

  // Verifiser at spillet er scheduled/active og trenger inndeling.
  const { data: game } = await admin
    .from('games')
    .select('id, status, game_mode')
    .eq('id', gameId)
    .single<{ id: string; status: string; game_mode: GameMode }>();
  if (!game) redirect(`${detailPath}?error=not_found`);
  if (game.status !== 'scheduled' && game.status !== 'active') {
    redirect(`${detailPath}?error=not_active`);
  }

  const players = await fetchFlightPlayers(admin, gameId);
  if (!players) redirect(`${detailPath}?error=db_roster`);

  if (!eligibleForFlightAssignment(game.game_mode, players)) {
    // Spillet er ≤4 aktive eller wolf — ingen inndeling nødvendig.
    redirect(detailPath);
  }

  const assignments = suggestFlightSplit(players);

  for (const { user_id, flight_number } of assignments) {
    const { error } = await admin
      .from('game_players')
      .update({ flight_number })
      .eq('game_id', gameId)
      .eq('user_id', user_id);
    if (error) redirect(`${detailPath}?error=db_players`);
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  redirect(`${detailPath}?status=flight_suggested`);
}

/**
 * Admin/creator: setter flight_number for én spiller (per-spiller-justering).
 *
 * Validerer at target-flight ikke overstiger MAX_FLIGHT_SIZE aktive spillere
 * (kapasitetsgrense).
 */
export async function setPlayerFlight(
  gameId: string,
  targetUserId: string,
  targetFlight: number,
): Promise<void> {
  const { admin, detailPath } = await loadFlightContext(gameId);

  // Grunnleggende validering
  if (!Number.isInteger(targetFlight) || targetFlight < 1) {
    redirect(`${detailPath}?error=bad_flight`);
  }

  const { data: game } = await admin
    .from('games')
    .select('id, status, game_mode')
    .eq('id', gameId)
    .single<{ id: string; status: string; game_mode: GameMode }>();
  if (!game) redirect(`${detailPath}?error=not_found`);
  if (game.status !== 'scheduled' && game.status !== 'active') {
    redirect(`${detailPath}?error=not_active`);
  }

  // Kapasitetssjekk: tell aktive spillere i target-flight eksklusive denne spilleren
  const { count: existingCount, error: countError } = await admin
    .from('game_players')
    .select('user_id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('flight_number', targetFlight)
    .neq('user_id', targetUserId)
    .is('withdrawn_at', null);
  if (countError) redirect(`${detailPath}?error=db_roster`);
  if ((existingCount ?? 0) >= MAX_FLIGHT_SIZE) {
    redirect(`${detailPath}?error=flight_full`);
  }

  const { error } = await admin
    .from('game_players')
    .update({ flight_number: targetFlight })
    .eq('game_id', gameId)
    .eq('user_id', targetUserId);
  if (error) redirect(`${detailPath}?error=db_players`);

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  redirect(`${detailPath}?status=flight_updated`);
}

/**
 * Admin/creator: stenger eller gjenåpner påmeldingen til et scheduled-spill
 * (toggle på games.signups_closed_at).
 *
 * Bare relevant for spill med registration_mode open eller manual_approval.
 */
export async function toggleSignupsClosed(
  gameId: string,
  closedNow: boolean,
): Promise<void> {
  const { admin, detailPath } = await loadFlightContext(gameId);

  const { data: game } = await admin
    .from('games')
    .select('id, status, registration_mode')
    .eq('id', gameId)
    .single<{
      id: string;
      status: string;
      registration_mode: 'invite_only' | 'manual_approval' | 'open';
    }>();
  if (!game) redirect(`${detailPath}?error=not_found`);
  if (game.status !== 'scheduled') redirect(`${detailPath}?error=signups_not_scheduled`);
  if (
    game.registration_mode !== 'open' &&
    game.registration_mode !== 'manual_approval'
  ) {
    // invite_only har ingen registreringsliste å stenge
    redirect(detailPath);
  }

  const signups_closed_at = closedNow ? new Date().toISOString() : null;
  const { error } = await admin
    .from('games')
    .update({ signups_closed_at })
    .eq('id', gameId);
  if (error) redirect(`${detailPath}?error=db_game`);

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/signup`);
  redirect(
    `${detailPath}?status=${closedNow ? 'signups_closed' : 'signups_reopened'}`,
  );
}

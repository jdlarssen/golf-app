'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
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
  if (error) {
    console.error('[fetchFlightPlayers] game_players read failed', error);
    return null;
  }
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
  const locale = await getLocale();
  const { admin, detailPath } = await loadFlightContext(gameId);

  // Verifiser at spillet er scheduled/active og trenger inndeling.
  const { data: game } = await admin
    .from('games')
    .select('id, status, game_mode')
    .eq('id', gameId)
    .single<{ id: string; status: string; game_mode: GameMode }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  // TypeScript cannot narrow past next-intl redirect (not declared `never`),
  // so the post-guard non-null assertions are the established 2b pattern.
  if (game!.status !== 'scheduled' && game!.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }

  // Error (if any) is logged at source in fetchFlightPlayers — the call site
  // only sees null, so logging here would add nothing but a `null`.
  const players = await fetchFlightPlayers(admin, gameId);
  if (!players) redirect({ href: `${detailPath}?error=db_roster`, locale });

  if (!eligibleForFlightAssignment(game!.game_mode, players!)) {
    // Spillet er ≤4 aktive eller wolf — ingen inndeling nødvendig.
    redirect({ href: detailPath, locale });
  }

  const assignments = suggestFlightSplit(players!);

  for (const { user_id, flight_number } of assignments) {
    const { error } = await admin
      .from('game_players')
      .update({ flight_number })
      .eq('game_id', gameId)
      .eq('user_id', user_id);
    if (error) {
      console.error('[suggestFlightAssignment] flight update failed', error);
      redirect({ href: `${detailPath}?error=db_players`, locale });
    }
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  redirect({ href: `${detailPath}?status=flight_suggested`, locale });
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
  const locale = await getLocale();
  const { admin, detailPath } = await loadFlightContext(gameId);

  // Grunnleggende validering
  if (!Number.isInteger(targetFlight) || targetFlight < 1) {
    redirect({ href: `${detailPath}?error=bad_flight`, locale });
  }

  const { data: game } = await admin
    .from('games')
    .select('id, status, game_mode')
    .eq('id', gameId)
    .single<{ id: string; status: string; game_mode: GameMode }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  if (game!.status !== 'scheduled' && game!.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }

  // Kapasitetssjekk: tell aktive spillere i target-flight eksklusive denne spilleren
  const { count: existingCount, error: countError } = await admin
    .from('game_players')
    .select('user_id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('flight_number', targetFlight)
    .neq('user_id', targetUserId)
    .is('withdrawn_at', null);
  if (countError) {
    console.error('[setPlayerFlight] flight count read failed', countError);
    redirect({ href: `${detailPath}?error=db_roster`, locale });
  }
  if ((existingCount ?? 0) >= MAX_FLIGHT_SIZE) {
    redirect({ href: `${detailPath}?error=flight_full`, locale });
  }

  const { error } = await admin
    .from('game_players')
    .update({ flight_number: targetFlight })
    .eq('game_id', gameId)
    .eq('user_id', targetUserId);
  if (error) {
    console.error('[setPlayerFlight] flight update failed', error);
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  redirect({ href: `${detailPath}?status=flight_updated`, locale });
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
  const locale = await getLocale();
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
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  if (game!.status !== 'scheduled') redirect({ href: `${detailPath}?error=signups_not_scheduled`, locale });
  if (
    game!.registration_mode !== 'open' &&
    game!.registration_mode !== 'manual_approval'
  ) {
    // invite_only har ingen registreringsliste å stenge
    redirect({ href: detailPath, locale });
  }

  const signups_closed_at = closedNow ? new Date().toISOString() : null;
  const { error } = await admin
    .from('games')
    .update({ signups_closed_at })
    .eq('id', gameId);
  if (error) {
    console.error('[toggleSignupsClosed] signups-closed update failed', error);
    redirect({ href: `${detailPath}?error=db_game`, locale });
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/signup`);
  redirect({
    href: `${detailPath}?status=${closedNow ? 'signups_closed' : 'signups_reopened'}`,
    locale,
  });
}

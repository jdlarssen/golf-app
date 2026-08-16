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
import {
  suggestTeamSplit,
  modeRequiresTeamNumber,
  expectedTeamSize,
  type TeamPlayer,
} from '@/lib/games/teamScope';
import { expectAffected } from '@/lib/supabase/affectedRows';
import {
  FLIGHT_PLAYER_SELECT,
  FLIGHT_TEAM_SELECT,
  FLIGHT_PLAYER_ORDER,
} from './flightPlayerColumns';
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
 * Henter aktive spillere for flight-inndeling, sortert på accepted_at ASC
 * (påmeldingsrekkefølge). `game_players` har ingen created_at-kolonne — #1669
 * fant at forgjengeren sorterte på en kolonne som ikke finnes, så «Foreslå
 * inndeling» alltid feilet med 42703. Uaksepterte (null) sist, deretter
 * user_id for determinisme. Returnerer null ved DB-feil.
 *
 * #1685: kolonnenavnene kommer fra `flightPlayerColumns.ts` og er typesjekket
 * mot `game_players`-raden, så et navn som ikke finnes stopper bygget i stedet
 * for kjøringen.
 */
async function fetchFlightPlayers(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
): Promise<(FlightPlayer & { accepted_at: string | null })[] | null> {
  const { data, error } = await admin
    .from('game_players')
    .select(FLIGHT_PLAYER_SELECT.join(', '))
    .eq('game_id', gameId)
    .order(FLIGHT_PLAYER_ORDER[0], { ascending: true, nullsFirst: false })
    .order(FLIGHT_PLAYER_ORDER[1], { ascending: true })
    .returns<
      {
        user_id: string;
        flight_number: number | null;
        withdrawn_at: string | null;
        accepted_at: string | null;
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
 * Henter aktive og trukkede spillere for lag-inndeling, sortert på accepted_at
 * ASC (påmeldingsrekkefølge; ingen created_at-kolonne på game_players — se
 * fetchFlightPlayers). Kolonnene er typesjekket, se `flightPlayerColumns.ts`
 * (#1685). Returnerer null ved DB-feil.
 */
async function fetchTeamPlayers(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
): Promise<TeamPlayer[] | null> {
  const { data, error } = await admin
    .from('game_players')
    .select(FLIGHT_TEAM_SELECT.join(', '))
    .eq('game_id', gameId)
    .order(FLIGHT_PLAYER_ORDER[0], { ascending: true, nullsFirst: false })
    .order(FLIGHT_PLAYER_ORDER[1], { ascending: true })
    .returns<TeamPlayer[]>();
  if (error) {
    console.error('[fetchTeamPlayers] game_players read failed', error);
    return null;
  }
  return data ?? [];
}

/**
 * Leser spillet og verifiserer at det er et lag-format i scheduled/active.
 * Redirecter ved avvik; returnerer lagstørrelsen når alt er i orden.
 *
 * Delt av begge lag-actionene så UI-gaten (`modeRequiresTeamNumber` i
 * page.tsx) og skrive-gaten ikke kan divergere. Wolf og Round Robin bruker
 * `team_number` som rotasjons-slot — de må aldri skrives av disse actionene.
 */
async function loadTeamGame(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
  detailPath: string,
  locale: Awaited<ReturnType<typeof getLocale>>,
): Promise<number> {
  const { data: game } = await admin
    .from('games')
    .select('id, status, game_mode, mode_config')
    .eq('id', gameId)
    .single<{
      id: string;
      status: string;
      game_mode: GameMode;
      mode_config: { team_size?: number } | null;
    }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  // TypeScript cannot narrow past next-intl redirect (not declared `never`),
  // so the post-guard non-null assertions are the established 2b pattern.
  if (game!.status !== 'scheduled' && game!.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }
  const teamSize = expectedTeamSize(game!.mode_config);
  if (!modeRequiresTeamNumber(game!.game_mode, teamSize)) {
    // Solo-format eller matchplay — ingen lag å tildele her.
    redirect({ href: detailPath, locale });
  }
  return teamSize;
}

/**
 * Admin/creator: foreslår og skriver lag for de aktive spillerne som mangler
 * lag. Spillere som allerede har lag røres ikke — se `suggestTeamSplit`.
 *
 * Redirecter tilbake til admin-siden med ?status=team_suggested ved suksess,
 * eller ?error=... ved feil.
 */
export async function suggestTeamAssignment(gameId: string): Promise<void> {
  const locale = await getLocale();
  const { admin, detailPath } = await loadFlightContext(gameId);

  const teamSize = await loadTeamGame(admin, gameId, detailPath, locale);

  // Error (if any) is logged at source in fetchTeamPlayers — the call site
  // only sees null, so logging here would add nothing but a `null`.
  const players = await fetchTeamPlayers(admin, gameId);
  if (!players) redirect({ href: `${detailPath}?error=db_roster`, locale });

  const assignments = suggestTeamSplit(players!, teamSize);
  if (assignments.length === 0) {
    // Alle har allerede lag — ingenting å gjøre.
    redirect({ href: detailPath, locale });
  }

  for (const { user_id, team_number, flight_number } of assignments) {
    let failure: unknown = null;
    try {
      // `.select()` + expectAffected: PostgREST melder ikke fra om en UPDATE
      // som traff 0 rader (bug-prevention §2) — uten dette ville en tapt rad
      // se ut som suksess og laget stått tomt på tavla.
      expectAffected(
        await admin
          .from('game_players')
          .update({ team_number, flight_number })
          .eq('game_id', gameId)
          .eq('user_id', user_id)
          .select('user_id'),
        'suggestTeamAssignment',
      );
    } catch (e) {
      failure = e;
    }
    if (failure) {
      console.error('[suggestTeamAssignment] team update failed', failure);
      redirect({ href: `${detailPath}?error=db_players`, locale });
    }
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  redirect({ href: `${detailPath}?status=team_suggested`, locale });
}

/**
 * Admin/creator: setter team_number for én spiller (per-spiller-justering).
 *
 * Validerer at target-laget ikke overstiger lagstørrelsen fra mode_config, og
 * setter flight = lag når spilleren ikke har flight fra før (CHECK
 * `game_players_team_flight_consistency`: lag krever flight).
 */
export async function setPlayerTeam(
  gameId: string,
  targetUserId: string,
  targetTeam: number,
): Promise<void> {
  const locale = await getLocale();
  const { admin, detailPath } = await loadFlightContext(gameId);

  if (!Number.isInteger(targetTeam) || targetTeam < 1) {
    redirect({ href: `${detailPath}?error=bad_team`, locale });
  }

  const teamSize = await loadTeamGame(admin, gameId, detailPath, locale);

  // Kapasitetssjekk: tell aktive spillere i target-laget eksklusive denne.
  const { count: existingCount, error: countError } = await admin
    .from('game_players')
    .select('user_id', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('team_number', targetTeam)
    .neq('user_id', targetUserId)
    .is('withdrawn_at', null);
  if (countError) {
    console.error('[setPlayerTeam] team count read failed', countError);
    redirect({ href: `${detailPath}?error=db_roster`, locale });
  }
  if ((existingCount ?? 0) >= teamSize) {
    redirect({ href: `${detailPath}?error=team_full`, locale });
  }

  // Flight må være satt så snart laget er det (CHECK 0030/0095). Behold den
  // spilleren har; ellers speil lagnummeret, som lag-påmeldingen gjør.
  const { data: row, error: rowError } = await admin
    .from('game_players')
    .select('flight_number')
    .eq('game_id', gameId)
    .eq('user_id', targetUserId)
    .maybeSingle<{ flight_number: number | null }>();
  if (rowError) {
    console.error('[setPlayerTeam] player row read failed', rowError);
    redirect({ href: `${detailPath}?error=db_roster`, locale });
  }
  if (!row) redirect({ href: `${detailPath}?error=not_found`, locale });

  let failure: unknown = null;
  try {
    expectAffected(
      await admin
        .from('game_players')
        .update({
          team_number: targetTeam,
          flight_number: row!.flight_number ?? targetTeam,
        })
        .eq('game_id', gameId)
        .eq('user_id', targetUserId)
        .select('user_id'),
      'setPlayerTeam',
    );
  } catch (e) {
    failure = e;
  }
  if (failure) {
    console.error('[setPlayerTeam] team update failed', failure);
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  redirect({ href: `${detailPath}?status=team_updated`, locale });
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

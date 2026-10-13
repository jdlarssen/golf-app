'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { expireGameCache } from '@/lib/games/expireGameCache';
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
  flightForTeam,
  modeRequiresTeamNumber,
  expectedTeamSize,
  type TeamPlayer,
} from '@/lib/games/teamScope';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { recountGroup, revertRows, type RevertRow } from '@/lib/games/flightMoveGuard';
import { offeredFlightNumbers } from '@/lib/games/startlist';
import { canToggleSignups } from '@/lib/games/signupInbox';
import {
  FLIGHT_PLAYER_SELECT,
  FLIGHT_TEAM_SELECT,
  FLIGHT_PLAYER_ORDER,
} from './flightPlayerColumns';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Admin/creator: action-kontekst med authz og admin-client for flight-actions.
 *
 * `detailPath` is the game page, where the team actions answer.
 * `startlistaPath` is where the flight actions answer (#2289): the organiser
 * moved the player there, and an organiser without the admin role cannot open
 * the game page.
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
    startlistaPath: `/admin/games/${gameId}/startlista`,
  };
}

/**
 * Expires the game cache and the pages that show flights and teams after a
 * saved flight/team write: the game page, the Startlista and «Styr spillere».
 */
function expireFlightCaches(gameId: string): void {
  expireGameCache(gameId);
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/admin/games/${gameId}/startlista`);
  revalidatePath(`/games/${gameId}/spillere`);
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

/** The game fields the flight actions read (the guard needs `mode_config`, #2290). */
type FlightGameRow = {
  id: string;
  status: string;
  game_mode: GameMode;
  mode_config: { team_size?: number } | null;
};

/**
 * Reads the game for a flight/team/signup action. Error ≠ absence (#1441,
 * #2293): a failed read is `db_game`, and only a read that found no row is
 * `not_found`. `.maybeSingle()` because `.single()` turns 0 rows into a
 * PGRST116 error, and then the two could not be told apart.
 */
async function readActionGame<T>(
  admin: ReturnType<typeof getAdminClient>,
  gameId: string,
  columns: string,
  context: string,
  detailPath: string,
  locale: Awaited<ReturnType<typeof getLocale>>,
): Promise<T> {
  const { data: game, error } = await admin
    .from('games')
    .select(columns)
    .eq('id', gameId)
    .maybeSingle<T>();
  if (error) {
    console.error(`[${context}] game read failed`, error);
    redirect({ href: `${detailPath}?error=db_game`, locale });
  }
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  return game;
}

/**
 * Admin/creator: foreslår og skriver flight-inndeling for alle aktive
 * spillere i grupper av MAX_FLIGHT_SIZE (påmeldingsrekkefølge).
 *
 * Redirecter tilbake til Startlista med ?status=flight_suggested ved suksess,
 * eller ?error=... ved feil. A write that fails midway puts the rows already
 * written back to the flights they had (#2289), so the split never stands
 * half done.
 */
export async function suggestFlightAssignment(gameId: string): Promise<void> {
  const locale = await getLocale();
  const { admin, startlistaPath: detailPath } = await loadFlightContext(gameId);

  // Verifiser at spillet er scheduled/active og trenger inndeling.
  const game = await readActionGame<FlightGameRow>(
    admin,
    gameId,
    'id, status, game_mode, mode_config',
    'suggestFlightAssignment',
    detailPath,
    locale,
  );
  if (game.status !== 'scheduled' && game.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }

  // Error (if any) is logged at source in fetchFlightPlayers — the call site
  // only sees null, so logging here would add nothing but a `null`.
  const players = await fetchFlightPlayers(admin, gameId);
  if (!players) redirect({ href: `${detailPath}?error=db_roster`, locale });

  if (
    !eligibleForFlightAssignment(
      game.game_mode,
      expectedTeamSize(game.mode_config),
      players,
    )
  ) {
    // ≤4 active, wolf, or a format where the flight is the team/side (#2290):
    // a split in signup order would break the teams up.
    redirect({ href: detailPath, locale });
  }

  const assignments = suggestFlightSplit(players);
  const previousFlight = new Map(players.map((p) => [p.user_id, p.flight_number]));

  const written: RevertRow[] = [];
  for (const { user_id, flight_number } of assignments) {
    let failure: unknown = null;
    try {
      // 0 rows (the player was removed in another tab) is a failure, never
      // «flight_suggested» (bug-prevention §2, #2293). redirect() stays
      // outside the try: it throws NEXT_REDIRECT.
      expectAffected(
        await admin
          .from('game_players')
          .update({ flight_number })
          .eq('game_id', gameId)
          .eq('user_id', user_id)
          .select('user_id'),
        'suggestFlightAssignment',
      );
      written.push({
        userId: user_id,
        written: { flight_number },
        previous: { flight_number: previousFlight.get(user_id) ?? null },
      });
    } catch (e) {
      failure = e;
    }
    if (failure) {
      console.error('[suggestFlightAssignment] flight update failed', failure);
      // Put the rows before this one back (AGENTS trap 5). Best-effort: a
      // failed write-back is logged, and the answer stands.
      await revertRows(admin, gameId, written, 'suggestFlightAssignment');
      // Expire the cache whenever a row was written, written back or not: a
      // page view between the partial write and the write-back may have
      // filled `unstable_cache` with the half-done split, and if the
      // write-back failed the pages must show the rows that stand.
      if (written.length > 0) expireFlightCaches(gameId);
      redirect({ href: `${detailPath}?error=db_players`, locale });
    }
  }

  expireFlightCaches(gameId);
  redirect({ href: `${detailPath}?status=flight_suggested`, locale });
}

/**
 * Admin/creator: flytter én spiller til en flight (Startlista, #2289).
 *
 * Samme vakt som Startlista-siden (`eligibleForFlightAssignment`): i et
 * lag-format er flighten laget, og én lagspiller flyttes aldri alene (#2290).
 * Plassen sjekkes før skrivingen (MAX_FLIGHT_SIZE aktive spillere) og telles
 * på nytt etter den, som `joinFlight`: no rule in the database limits the
 * size, so two organisers moving into a flight of three at the same time
 * would both pass the first check. The loser's row goes back.
 */
export async function setPlayerFlight(
  gameId: string,
  targetUserId: string,
  targetFlight: number,
): Promise<void> {
  const locale = await getLocale();
  const { admin, startlistaPath: detailPath } = await loadFlightContext(gameId);

  // Grunnleggende validering
  if (!Number.isInteger(targetFlight) || targetFlight < 1) {
    redirect({ href: `${detailPath}?error=bad_flight`, locale });
  }

  const game = await readActionGame<FlightGameRow>(
    admin,
    gameId,
    'id, status, game_mode, mode_config',
    'setPlayerFlight',
    detailPath,
    locale,
  );
  if (game.status !== 'scheduled' && game.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }

  const players = await fetchFlightPlayers(admin, gameId);
  if (!players) redirect({ href: `${detailPath}?error=db_roster`, locale });
  if (
    !eligibleForFlightAssignment(
      game.game_mode,
      expectedTeamSize(game.mode_config),
      players,
    )
  ) {
    // No Startlista for this game: the page sends the organiser on.
    redirect({ href: detailPath, locale });
  }

  // The player left, or was withdrawn, since the page was rendered.
  const player = players.find((p) => p.user_id === targetUserId && p.withdrawn_at == null);
  if (!player) redirect({ href: `${detailPath}?error=player_missing`, locale });

  // Only a flight the Startlista offers (`offeredFlightNumbers`, the rule's
  // one home): a crafted request cannot open flight 40 in a game of twelve.
  const active = players.filter((p) => p.withdrawn_at == null);
  const offered = offeredFlightNumbers(
    active.length,
    active.flatMap((p) => (p.flight_number == null ? [] : [p.flight_number])),
  );
  if (!offered.includes(targetFlight)) {
    redirect({ href: `${detailPath}?error=bad_flight`, locale });
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

  let failure: unknown = null;
  try {
    // Same rule as suggestFlightAssignment: 0 rows is a failure (#2293).
    expectAffected(
      await admin
        .from('game_players')
        .update({ flight_number: targetFlight })
        .eq('game_id', gameId)
        .eq('user_id', targetUserId)
        .select('user_id'),
      'setPlayerFlight',
    );
  } catch (e) {
    failure = e;
  }
  if (failure) {
    console.error('[setPlayerFlight] flight update failed', failure);
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

  // Count again: over MAX_FLIGHT_SIZE we lost a race, and a failed count
  // cannot confirm the flight has room. Either way our row goes back.
  const afterCount = await recountGroup(admin, gameId, 'flight_number', targetFlight, 'setPlayerFlight');
  if (afterCount === null || afterCount > MAX_FLIGHT_SIZE) {
    await revertRows(
      admin,
      gameId,
      [
        {
          userId: targetUserId,
          written: { flight_number: targetFlight },
          previous: { flight_number: player.flight_number },
        },
      ],
      'setPlayerFlight',
      { targetFlight },
    );
    // The write landed: a page view in between may have cached it.
    expireFlightCaches(gameId);
    redirect({
      href: `${detailPath}?error=${afterCount === null ? 'db_roster' : 'flight_full'}`,
      locale,
    });
  }

  expireFlightCaches(gameId);
  // `flight` lets the page put focus on the flight the player went to.
  redirect({ href: `${detailPath}?status=flight_updated&flight=${targetFlight}`, locale });
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
 * Redirecter ved avvik; returnerer formatet og lagstørrelsen når alt er i
 * orden.
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
): Promise<{ mode: GameMode; teamSize: number }> {
  const game = await readActionGame<FlightGameRow>(
    admin,
    gameId,
    'id, status, game_mode, mode_config',
    'loadTeamGame',
    detailPath,
    locale,
  );
  if (game.status !== 'scheduled' && game.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }
  const teamSize = expectedTeamSize(game.mode_config);
  if (!modeRequiresTeamNumber(game.game_mode, teamSize)) {
    // Solo-format eller matchplay — ingen lag å tildele her.
    redirect({ href: detailPath, locale });
  }
  return { mode: game.game_mode, teamSize };
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

  const { mode, teamSize } = await loadTeamGame(admin, gameId, detailPath, locale);

  // Error (if any) is logged at source in fetchTeamPlayers — the call site
  // only sees null, so logging here would add nothing but a `null`.
  const players = await fetchTeamPlayers(admin, gameId);
  if (!players) redirect({ href: `${detailPath}?error=db_roster`, locale });

  const assignments = suggestTeamSplit(mode, players, teamSize);
  if (assignments.length === 0) {
    // Alle har allerede lag — ingenting å gjøre.
    redirect({ href: detailPath, locale });
  }

  const previousRow = new Map(
    players.map((p) => [p.user_id, { team_number: p.team_number, flight_number: p.flight_number }]),
  );

  const written: RevertRow[] = [];
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
      written.push({
        userId: user_id,
        written: { team_number, flight_number },
        previous: previousRow.get(user_id) ?? { team_number: null, flight_number: null },
      });
    } catch (e) {
      failure = e;
    }
    if (failure) {
      console.error('[suggestTeamAssignment] team update failed', failure);
      // Same as suggestFlightAssignment (#2289): earlier rows go back to
      // their team and flight, both so the CHECK holds, and the cache is
      // expired whenever a row was written.
      await revertRows(admin, gameId, written, 'suggestTeamAssignment');
      if (written.length > 0) expireFlightCaches(gameId);
      redirect({ href: `${detailPath}?error=db_players`, locale });
    }
  }

  expireFlightCaches(gameId);
  redirect({ href: `${detailPath}?status=team_suggested`, locale });
}

/**
 * Admin/creator: setter team_number for én spiller (per-spiller-justering).
 *
 * Validerer at target-laget ikke overstiger lagstørrelsen fra mode_config, og
 * setter flighten etter laget med `flightForTeam` (#2290): i lag-formatene er
 * flighten laget, og en spiller som bytter lag tar aldri med seg den gamle
 * flighten. CHECK `game_players_team_flight_consistency` krever at den er satt.
 * Like `setPlayerFlight`, the team is counted again after the write (#2289):
 * no rule in the database limits the team size either.
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

  const { mode, teamSize } = await loadTeamGame(admin, gameId, detailPath, locale);

  // The whole roster: the flight depends on who is already in the target team.
  const players = await fetchTeamPlayers(admin, gameId);
  if (!players) redirect({ href: `${detailPath}?error=db_roster`, locale });
  // Same rule as setPlayerFlight: a player who left or was withdrawn is gone.
  // (`not_found` would say «Spillet ble ikke funnet».)
  const player = players.find((p) => p.user_id === targetUserId && p.withdrawn_at == null);
  if (!player) redirect({ href: `${detailPath}?error=player_missing`, locale });

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

  // The CHECK (0030/0095) needs a flight once there is a team, and the
  // flight follows the team (#2290).
  const targetFlight = flightForTeam(mode, players, targetUserId, targetTeam);
  let failure: unknown = null;
  try {
    expectAffected(
      await admin
        .from('game_players')
        .update({ team_number: targetTeam, flight_number: targetFlight })
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

  // Same guard as setPlayerFlight: the loser of a race, or a failed count,
  // gets the team and the flight they had back.
  const afterCount = await recountGroup(admin, gameId, 'team_number', targetTeam, 'setPlayerTeam');
  if (afterCount === null || afterCount > teamSize) {
    await revertRows(
      admin,
      gameId,
      [
        {
          userId: targetUserId,
          written: { team_number: targetTeam, flight_number: targetFlight },
          previous: { team_number: player.team_number, flight_number: player.flight_number },
        },
      ],
      'setPlayerTeam',
      { targetTeam },
    );
    expireFlightCaches(gameId);
    redirect({
      href: `${detailPath}?error=${afterCount === null ? 'db_roster' : 'team_full'}`,
      locale,
    });
  }

  expireFlightCaches(gameId);
  redirect({ href: `${detailPath}?status=team_updated`, locale });
}

/**
 * Admin/creator: stenger eller gjenåpner påmeldingen til et scheduled-spill
 * (toggle på games.signups_closed_at).
 *
 * #2288: the button lives on the signups page only, so every redirect lands
 * there — an organiser without the admin role would meet `requireAdmin` on
 * the game page. `canToggleSignups` is the one rule for which games qualify.
 */
export async function toggleSignupsClosed(
  gameId: string,
  closedNow: boolean,
): Promise<void> {
  const locale = await getLocale();
  const { admin } = await loadFlightContext(gameId);
  const signupsPath = `/admin/games/${gameId}/signups`;

  const game = await readActionGame<{
    id: string;
    status: string;
    registration_mode: 'invite_only' | 'manual_approval' | 'open';
    group_id: string | null;
  }>(admin, gameId, 'id, status, registration_mode, group_id', 'toggleSignupsClosed', signupsPath, locale);
  if (game.status !== 'scheduled') redirect({ href: `${signupsPath}?error=signups_not_scheduled`, locale });
  if (!canToggleSignups(game.status, game.registration_mode, game.group_id)) {
    // Only open, manual approval and club rounds can be closed. An invite-only
    // round outside a club takes requests from anyone with the link (#368),
    // one at a time, and has no signup window to close.
    redirect({ href: signupsPath, locale });
  }

  const signups_closed_at = closedNow ? new Date().toISOString() : null;
  let failure: unknown = null;
  try {
    // 0 rows would otherwise answer «påmeldingen er stengt» for a game the
    // write never touched (#2293).
    expectAffected(
      await admin
        .from('games')
        .update({ signups_closed_at })
        .eq('id', gameId)
        .select('id'),
      'toggleSignupsClosed',
    );
  } catch (e) {
    failure = e;
  }
  if (failure) {
    console.error('[toggleSignupsClosed] signups-closed update failed', failure);
    redirect({ href: `${signupsPath}?error=db_game`, locale });
  }

  expireFlightCaches(gameId);
  revalidatePath(`/signup`);
  redirect({
    href: `${signupsPath}?status=${closedNow ? 'signups_closed' : 'signups_reopened'}`,
    locale,
  });
}

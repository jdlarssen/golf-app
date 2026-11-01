// native/app/src/data/league.ts
// #2638 Del 2: ligaen i appen, via de tre rutene fra Del 1.
//
// Fila er med vilje tynn. Tabellen, rundeinnstillingene og «hvem har spilt»
// regnes på serveren (`getLigaSnapshot` → `buildAppLeagueView`), og starten
// av en flight kjøres av `startLeagueRoundFlightCore`, den samme kjernen som
// nettsidens «Start runden». Appen regner aldri tabellen eller slår sammen
// standard og overstyring selv: den viser det ruta sender.
//
// **Ingen lokal lagring i v1** (kontrakten). Ligaen krever nett. Skjermen
// holder det den sist fikk i minnet, og uten nett viser den det med en
// merknad (tegning 6). Selve runden er offline-først som alle spill når den
// er startet.
//
// **Wire-kontrakten** (rutene og denne fila endres i samme PR):
//   GET  /api/liga                         200 { leagues: AppLeagueSummary[] } · 401 · 500
//   GET  /api/liga/{id}                    200 AppLeagueView · 401 · 404 · 500
//   POST /api/liga/rounds/{roundId}/start  { coPlayerIds: string[] }
//        200 { gameId } · 400 · 401 · 404 · 409 { error: LeagueStartRefusal } · 500
//   GET  /api/liga/bli-med/{code}          200 AppLeagueJoinView · 401 · 404 · 500  (#2748)
//   POST /api/liga/bli-med/{code}          200 { leagueId } · 401 · 404
//        409 { error: 'closed' | 'profile_incomplete' } · 500 { error: 'read_failed' | 'save_failed' }
//
// Utfallene er TYPEDE koder, aldri bruker-tekst (samme linje som
// `startGame.ts`). HTTP-status oversettes én gang, her. Teksten bor i
// `lib/leagueCopy.ts`.
import type {
  AppLeagueJoinView,
  AppLeagueListResponse,
  AppLeagueSummary,
  AppLeagueView,
} from '../../../../lib/league/appLeagueView';
import type { LeagueStartRefusal } from '../../../../lib/league/leagueStartRefusal';
import { callWebRoute, type WebApiFailure } from './webApi';

/** Hvorfor ligaen ikke kunne hentes. `not_found` = finnes ikke, eller ikke for deg. */
export type LeagueLoadFailure = WebApiFailure | 'not_found' | 'load_failed';

export type MyLeaguesResult =
  | { ok: true; leagues: AppLeagueSummary[] }
  | { ok: false; reason: LeagueLoadFailure };

export type LeagueResult =
  | { ok: true; view: AppLeagueView }
  | { ok: false; reason: LeagueLoadFailure };

/**
 * Hvorfor starten ikke gikk gjennom: kjernens egne koder (409), appens egen
 * tilstand før kallet ({@link WebApiFailure}), `not_found` (runden eller
 * ligaen finnes ikke) og `start_failed` (serverfeil, en kropp ruta ikke
 * godtok, eller en 409 med en kode vi ikke kjenner). Starten går ALDRI i
 * sync-køen: uten nett stopper den før kallet.
 */
export type LeagueStartFailure = LeagueStartRefusal | WebApiFailure | 'not_found' | 'start_failed';

export type LeagueStartResult =
  | { ok: true; gameId: string }
  | { ok: false; reason: LeagueStartFailure };

/**
 * Kjernens koder. `Record<…, true>` er porten: får kjernen en ny avslagskode
 * og ingen legger den til her, faller `tsc` på den manglende nøkkelen. En kode
 * vi ikke kjenner på wiren blir `start_failed`: en gjettet forklaring er verre.
 */
const REFUSALS: Record<LeagueStartRefusal, true> = {
  round_not_found: true,
  round_read_failed: true,
  league_not_found: true,
  league_read_failed: true,
  league_not_active: true,
  outside_window: true,
  round_not_ready: true,
  need_marker: true,
  flight_too_large: true,
  members_failed: true,
  not_member: true,
  already_played: true,
  flight_in_progress: true,
  co_player_locked: true,
  round_check_failed: true,
  settings_freeze_failed: true,
  insert_failed: true,
  start_not_found: true,
  start_not_scheduled: true,
  start_tee_missing: true,
  start_tee_missing_rating: true,
  start_no_players: true,
  start_pending_players: true,
  start_incomplete_sides: true,
  start_decided_by_withdrawal: true,
  start_cup_finished: true,
  start_unassigned_teams: true,
  start_uneven_teams: true,
  start_unassigned_flights: true,
  start_rotation_player_count: true,
  start_db_players: true,
  start_db_game: true,
};

function readRefusal(value: unknown): LeagueStartRefusal | undefined {
  return typeof value === 'string' && Object.hasOwn(REFUSALS, value)
    ? (value as LeagueStartRefusal)
    : undefined;
}

/** Status → kode for lesingene, oversatt ÉN gang. */
function loadFailureFor(status: number): LeagueLoadFailure {
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  return 'load_failed';
}

/**
 * «Ligaene dine» på Hjem: ligaene du er med i som er `draft` eller `active`,
 * med den åpne runden. Hjem skjuler seksjonen ved enhver feil.
 */
export async function fetchMyLeagues(): Promise<MyLeaguesResult> {
  const call = await callWebRoute('/api/liga', 'GET');
  if (!call.ok) return call;
  if (call.status !== 200) return { ok: false, reason: loadFailureFor(call.status) };
  const leagues = (call.body as Partial<AppLeagueListResponse>).leagues;
  return Array.isArray(leagues) ? { ok: true, leagues } : { ok: false, reason: 'load_failed' };
}

/** Ligasiden: tabellen, rundene og innstillingene, regnet på serveren. */
export async function fetchLeague(leagueId: string): Promise<LeagueResult> {
  const call = await callWebRoute(`/api/liga/${encodeURIComponent(leagueId)}`, 'GET');
  if (!call.ok) return call;
  if (call.status !== 200) return { ok: false, reason: loadFailureFor(call.status) };
  const view = call.body as Partial<AppLeagueView>;
  // En 200 uten liga eller runder er ikke en liga å tegne.
  return view.league && Array.isArray(view.rounds)
    ? { ok: true, view: view as AppLeagueView }
    : { ok: false, reason: 'load_failed' };
}

/**
 * «Start runden»: en flight i ligarunden, med medspillerne du valgte. Tom
 * liste = alene (bare i en simulatorliga; kjernen sier `need_marker` ellers).
 *
 * @returns spillet som ble startet, eller et typet avslag.
 */
export async function startLeagueRound(
  roundId: string,
  coPlayerIds: readonly string[],
): Promise<LeagueStartResult> {
  const call = await callWebRoute(`/api/liga/rounds/${encodeURIComponent(roundId)}/start`, 'POST', {
    coPlayerIds: [...coPlayerIds],
  });
  if (!call.ok) return call;
  if (call.status === 200) {
    const { gameId } = call.body;
    return typeof gameId === 'string' && gameId !== ''
      ? { ok: true, gameId }
      : { ok: false, reason: 'start_failed' };
  }
  if (call.status === 409) return { ok: false, reason: readRefusal(call.body.error) ?? 'start_failed' };
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 404) return { ok: false, reason: 'not_found' };
  return { ok: false, reason: 'start_failed' };
}

/** Hva ligalenka viser (#2748). */
export type LeagueJoinLoadResult =
  | { ok: true; view: AppLeagueJoinView }
  | { ok: false; reason: LeagueLoadFailure };

/**
 * Hvorfor «Bli med» ikke gikk gjennom (#2748): rutas egne koder og appens egen
 * tilstand før kallet. En kode vi ikke kjenner på wiren blir `save_failed`.
 */
export type LeagueJoinFailure =
  | WebApiFailure
  | 'not_found'
  | 'closed'
  | 'profile_incomplete'
  | 'read_failed'
  | 'save_failed';

export type LeagueJoinResult = { ok: true; leagueId: string } | { ok: false; reason: LeagueJoinFailure };

/** Utfallene ruta sender. En 200 med noe annet er ikke en liga å tegne. */
const JOIN_DECISIONS: readonly unknown[] = [
  'can_join',
  'already_joined',
  'closed',
  'profile_incomplete',
] satisfies AppLeagueJoinView['decision'][];

const leagueJoinRoute = (code: string) => `/api/liga/bli-med/${encodeURIComponent(code)}`;

/** Ligaen bak lenka: navn, runder, antall påmeldte og om du kan bli med. */
export async function fetchLeagueJoin(code: string): Promise<LeagueJoinLoadResult> {
  const call = await callWebRoute(leagueJoinRoute(code), 'GET');
  if (!call.ok) return call;
  if (call.status !== 200) return { ok: false, reason: loadFailureFor(call.status) };
  const view = call.body as Partial<AppLeagueJoinView>;
  return view.league && Array.isArray(view.rounds) && JOIN_DECISIONS.includes(view.decision)
    ? { ok: true, view: view as AppLeagueJoinView }
    : { ok: false, reason: 'load_failed' };
}

/**
 * «Bli med»: du står på lista med en gang, og bekreftet. Et kall til gir samme
 * svar og ingen ny rad. Går ALDRI i sync-køen: uten nett stopper den før kallet.
 */
export async function joinLeague(code: string): Promise<LeagueJoinResult> {
  const call = await callWebRoute(leagueJoinRoute(code), 'POST');
  if (!call.ok) return call;
  if (call.status === 200) {
    const { leagueId } = call.body;
    return typeof leagueId === 'string' && leagueId !== ''
      ? { ok: true, leagueId }
      : { ok: false, reason: 'save_failed' };
  }
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 404) return { ok: false, reason: 'not_found' };
  const { error } = call.body;
  if (call.status === 409 && (error === 'closed' || error === 'profile_incomplete')) {
    return { ok: false, reason: error };
  }
  return { ok: false, reason: error === 'read_failed' ? 'read_failed' : 'save_failed' };
}

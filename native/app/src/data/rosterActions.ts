// native/app/src/data/rosterActions.ts
// Native N6b (#1855): arrangørens roster-drift, pluss spillerens stille
// bekreftelse.
//
// Seks av de åtte handlingene er rene `game_players`-mutasjoner under RLS, og
// autorisasjonen ligger i Postgres:
//
//   • `game_players self mark accepted` (0082) — spillerens egen bekreftelse.
//   • `game_players creator delete` (0071, uten cupkamper fra 0178) — fjerning
//     før start.
//   • `game_players creator update` (0071) + `guard_game_players_self_update`
//     (0147), som slipper spillets oppretter forbi på ANDRES rader.
//
// Appen har ingen service-role og skal ikke få en. Gatene under står foran for
// UX-ens skyld — gaten er RLS.
//
// **To går via ruter (#2215),** fordi webben gjør mer enn å skrive raden:
//   • «Legg til» (`POST /api/games/{id}/players/{userId}`) sender `invite` til
//     spilleren, og kjernen eier venne-/klubbporten, tee-settet (#2209) og
//     duplikat-regelen.
//   • «Åpne kortet igjen» (#2220, `POST /api/games/{id}/scorecards/{userId}`
//     med `reopen`) sender `scorecard_reopened` og åpner et felles lagkort
//     (#2213) for hele laget, med service-role.
// Begge rutene tømmer web-cachen selv.
//
// **Trap 2 er ufravikelig.** PostgREST svarer `error == null` på en UPDATE eller
// DELETE som traff NULL rader; det er #667/#704 i ren form. Hver skriving kjeder
// derfor `.select(...)` og går gjennom den delte `expectAffected`, og 0 rader
// splittes i to med ett oppfølgings-SELECT:
//   • raden er alt i måltilstanden → idempotent, `{ ok: true, alreadyDone: true }`
//   • raden er det ikke → RLS/rad-tilgang nektet → `{ ok: false }`
// Stille suksess finnes ikke her.
//
// **Reglene er delt kode.** `expectedTeamSize` og `modeRequiresTeamNumber`
// (`lib/games/teamScope`), `MAX_FLIGHT_SIZE` (`lib/games/flightScope`) og
// `supportsWithdrawal` (`lib/scoring/modes/types`) importeres — aldri kopieres.
// Et tall som står to steder driver fra hverandre (AGENTS.md felle 4).
//
// **Web-cachen (#2215).** Webben leser status og roster fra spillets cache
// (`game-${id}`). Fem av de direkte skrivingene (fjern, lag, flight, trekk og
// angre) varsler ingen, som på webben, men tømmer cachen via
// `refreshWebCache` etter et vellykket utfall, så nettsiden viser det med én
// gang. `confirmParticipation` gjør det ikke: «Ikke bekreftet»-merkene på
// webben leser `game_players` direkte, ikke cachen.
//
// Admin-hendelsesloggen (`logAdminEvent`, også `scorecard.reopened`) er
// server-eid og skrives IKKE for arrangørhandlinger herfra. Bokført gap.
import { MAX_FLIGHT_SIZE } from '../../../../lib/games/flightScope';
import {
  expectedTeamSize,
  modeRequiresTeamNumber,
} from '../../../../lib/games/teamScope';
import {
  supportsWithdrawal,
  type GameMode,
} from '../../../../lib/scoring/modes/types';
import {
  expectAffected,
  NoRowsAffectedError,
} from '../../../../lib/supabase/affectedRows';
import { isAppSupportedMode } from '../lib/appFormats';
import { maxPlayersForMode } from '../lib/rosterLimits';
import { currentDeviceUserId, supabase } from '../supabase';
import { callScorecardRoute } from './playerActions';
import { refreshWebCache } from './refreshWebCache';
import { isDeviceOnline } from './syncTriggers';
import { callWebRoute, type WebApiCall } from './webApi';

/**
 * Hvorfor en handling ikke gikk gjennom. Skjermen oversetter til norsk copy —
 * datalaget har ingen bruker-tekst, som i `playerActions.ts`.
 */
export type RosterActionFailure =
  | 'no-session'
  /** Skrivingene går aldri i sync-køen; uten nett finnes det ingenting å gjøre. */
  | 'offline'
  /** Bygget mangler web-adressen rutene (legg til, gjenåpning) trenger. */
  | 'no-web-base-url'
  /** Spillet finnes ikke, eller er ikke synlig for oss. */
  | 'not-found'
  /** Legge til / fjerne krever `draft` eller `scheduled`. */
  | 'roster-locked'
  /** Cupkamper byttes på cupsiden, aldri ved å fjerne en rad (#1937). */
  | 'cup-roster-locked'
  /** Formatet tar ikke flere spillere (`maxPlayersForMode`, eller rutas `game_full`). */
  | 'roster-full'
  /** Lag/flight krever `scheduled`/`active`; WD krever `active`. */
  | 'not-active'
  /** Formatet har ingen lag å tildele (solo, matchplay, wolf-rotasjon). */
  | 'no-team-mode'
  /** Formatet støtter ikke WD — et frafall har en annen betydning der. */
  | 'withdrawal-unsupported'
  | 'bad-team'
  | 'bad-flight'
  | 'team-full'
  | 'flight-full'
  /**
   * Nektet: SQLSTATE 42501 fra Postgres (policy eller vakt-trigger), eller
   * rutas port (403, og `invite_not_allowed` når du legger til).
   */
  | 'rls-denied'
  /** Kun med `onlyIfUnsubmitted`: kortet kom inn før skrivet — ingenting er endret. */
  | 'already-submitted'
  /** Ingen feil, men heller ingen rad. Trap 2s eget utfall. */
  | 'no-rows'
  | 'db';

export type RosterActionResult =
  | { ok: true; alreadyDone: boolean }
  | { ok: false; reason: RosterActionFailure; message?: string };

/** PostgRESTs kode for «insufficient_privilege» — RLS eller en vakt avviste raden. */
const RLS_DENIED_CODE = '42501';

const done = (alreadyDone: boolean): RosterActionResult => ({
  ok: true,
  alreadyDone,
});

const failed = (
  reason: RosterActionFailure,
  message?: string,
): RosterActionResult => ({
  ok: false,
  reason,
  ...(message === undefined ? {} : { message }),
});

// -----------------------------------------------------------------------------
// Felles porter
// -----------------------------------------------------------------------------

/** Rå spill-felter gatene leser. `status` og `game_mode` smalnes ved bruk. */
interface GameGateRow {
  status: string;
  tournament_id: string | null;
  game_mode: string;
  mode_config: { team_size?: number } | null;
}

/**
 * Innlogget og på nett? Begge er forutsetninger, ikke feilsituasjoner å
 * oppdage midt i en skriving.
 *
 * Nett-gaten er ikke pynt: roster-skrivingene går ALDRI i sync-køen (samme
 * v1-valg som opprettelsen i #1854). Uten den ville et trykk i flymodus endt i
 * en rå «Network request failed» i stedet for «du er uten nett».
 */
function refuseUnlessReady(userId: string | null): RosterActionResult | null {
  if (!userId) return failed('no-session');
  if (!isDeviceOnline()) return failed('offline');
  return null;
}

/** Leser spillets gate-felter. Returnerer en feil, eller raden. */
async function loadGame(
  gameId: string,
): Promise<{ row: GameGateRow } | { error: RosterActionResult }> {
  const { data, error } = await supabase
    .from('games')
    .select('status, tournament_id, game_mode, mode_config')
    .eq('id', gameId)
    .maybeSingle<GameGateRow>();
  if (error) return { error: failed('db', error.message) };
  if (!data) return { error: failed('not-found') };
  return { row: data };
}

/**
 * Les svaret på en skriving og gi den ene sannheten tilbake: traff den rader?
 *
 * Samme deling som `createGame.ts` gjør — nektet (42501), noe gikk galt, og den
 * lumske «ingen feil, men heller ingen rad». `expectAffected` er husets vakt
 * mot den siste, og den kalles her slik at hver skriving i fila passerer den.
 */
function readWriteResult<T>(
  result: { data: T[] | null; error: { message: string; code?: string } | null },
  context: string,
):
  | { ok: true; rows: T[] }
  | { ok: false; error: 'rls-denied' | 'no-rows' | 'db'; message?: string } {
  if (result.error) {
    return {
      ok: false,
      error: result.error.code === RLS_DENIED_CODE ? 'rls-denied' : 'db',
      message: result.error.message,
    };
  }
  try {
    // Feilgrenen er alt tatt over, så bare 0-rads-kastet kan fyre her.
    return {
      ok: true,
      rows: expectAffected({ data: result.data, error: null }, context),
    };
  } catch (err: unknown) {
    if (err instanceof NoRowsAffectedError) return { ok: false, error: 'no-rows' };
    return {
      ok: false,
      error: 'db',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Oppfølgings-SELECT-et som skiller de to lovlige grunnene til 0 rader.
 *
 * Er raden allerede i måltilstanden, var skrivingen et idempotent no-op og
 * handlingen har lykkes. Er den det ikke — eller er raden usynlig for oss — ble
 * skrivingen nektet, og det MÅ vises som en feil.
 *
 * `classify` får `null` når raden ikke finnes i det hele tatt. Det er meningen:
 * en sletting er nettopp da i mål, mens en oppdatering ikke er det.
 *
 * Den svarer med hele utfallet, ikke bare «i mål eller ikke» (#1896): med
 * `onlyIfUnsubmitted` finnes det en TREDJE grunn til 0 rader — spilleren rakk å
 * levere — og den fortjener sin egen kode i stedet for å bli slått sammen med
 * «nektet». `columns` er kolonnelista oppfølgingen trenger for å skille dem.
 */
async function resolveZeroRows(
  gameId: string,
  playerUserId: string,
  columns: string,
  classify: (row: Record<string, unknown> | null) => RosterActionResult,
): Promise<RosterActionResult> {
  const { data, error } = await supabase
    .from('game_players')
    .select(columns)
    .eq('game_id', gameId)
    .eq('user_id', playerUserId)
    .maybeSingle<Record<string, unknown>>();

  if (error) return failed('db', error.message);
  return classify(data ?? null);
}

/**
 * Tøm web-cachen etter en vellykket skriving, og gi utfallet uendret tilbake
 * (#2215).
 *
 * Står på hver retur ETTER skrivingen i de fem direkte arrangør-skrivingene,
 * også når 0 rader ble løst som «alt i mål» (`alreadyDone`): raden er i
 * måltilstanden, men cachen kan fortsatt vise den gamle. Et avslag får aldri
 * kallet, for da er ingenting endret. Svaret fra ruta endrer aldri utfallet;
 * skrivingen har alt skjedd.
 */
async function afterWrite(
  gameId: string,
  result: RosterActionResult,
): Promise<RosterActionResult> {
  if (result.ok) await refreshWebCache(gameId);
  return result;
}

/**
 * Det som stoppet et rute-kall før ruta svarte, som roster-kode. `network` er
 * `db`: et kall som aldri kom fram er «prøv igjen», ikke en egen forklaring.
 */
function webApiFailure(
  call: Extract<WebApiCall, { ok: false }>,
): RosterActionResult {
  switch (call.reason) {
    case 'offline':
      return failed('offline');
    case 'no-web-base-url':
      return failed('no-web-base-url');
    case 'unauthorized':
      return failed('no-session');
    case 'network':
      return failed('db');
  }
}

/**
 * Alle aktive/trukne roster-rader med grupperings-kolonnene.
 *
 * Ett SELECT dekker BEGGE spørsmålene lag-tildelingen har: hvor mange står i
 * mål-laget alt, og hvilken flight har spilleren fra før (CHECK 0030/0095
 * krever at flight er satt så snart laget er det). Webben bruker to spørringer
 * fordi den har en `head: true`-telling å spare bytes på; her er rosteret
 * uansett høyst et titalls rader.
 */
interface GroupingRow {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  withdrawn_at: string | null;
}

async function loadGrouping(
  gameId: string,
): Promise<{ rows: GroupingRow[] } | { error: RosterActionResult }> {
  const { data, error } = await supabase
    .from('game_players')
    .select('user_id, team_number, flight_number, withdrawn_at')
    .eq('game_id', gameId)
    .returns<GroupingRow[]>();
  if (error) return { error: failed('db', error.message) };
  return { rows: data ?? [] };
}

/** Aktive spillere i en gruppe, uten spilleren vi holder på å flytte. */
function occupancy(
  rows: GroupingRow[],
  pick: (row: GroupingRow) => number | null,
  target: number,
  exceptUserId: string,
): number {
  return rows.filter(
    (row) =>
      row.withdrawn_at === null &&
      row.user_id !== exceptUserId &&
      pick(row) === target,
  ).length;
}

// -----------------------------------------------------------------------------
// 1. Spillerens egen bekreftelse
// -----------------------------------------------------------------------------

/**
 * #463 — bekreft deltakelse ved å åpne spillet.
 *
 * Speiler `lib/games/confirmParticipation.ts`: «vinn raden»-UPDATE-en som setter
 * `accepted_at` KUN når den fortsatt er null, gjennom policyen
 * `game_players self mark accepted` (0082). 0147-vakta rører ikke `accepted_at`
 * på egen rad, så spilleren skriver den selv — webben trenger admin-klienten
 * bare fordi den kjører inne i `after()`, uten cookies.
 *
 * **Denne ene er best-effort og idempotent, og returnerer derfor `void.`** 0
 * rader betyr «alt bekreftet», ikke en feil; modellen er «merkelapp + dytt», og
 * badgen rydder seg selv. En returverdi som aldri skal vises inviterer til å
 * vise den — så det finnes ingen. Alle feil svelges med en logg, som webben.
 */
export async function confirmParticipation(gameId: string): Promise<void> {
  const userId = await currentDeviceUserId();
  if (!userId || !isDeviceOnline()) return;

  try {
    const { error } = await supabase
      .from('game_players')
      .update({ accepted_at: new Date().toISOString() })
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .is('accepted_at', null);
    if (error) console.error('[confirmParticipation] update failed', error);
  } catch (err: unknown) {
    console.error('[confirmParticipation] failed', err);
  }
}

// -----------------------------------------------------------------------------
// 2–3. Legg til og fjern
// -----------------------------------------------------------------------------

/**
 * Legg en registrert spiller til rosteret (#2215: via ruta).
 *
 * Skrivingen er rutas: `POST /api/games/{id}/players/{userId}` kaller samme
 * kjerne som webbens «Legg til» (`addExistingPlayerToGameCore` i
 * `lib/games/inviteToGame.ts`). Kjernen eier venne-/klubbporten
 * (`invite_not_allowed`), plass-sjekken, tee-settet fra profilen (#2209),
 * duplikat-regelen, `invite`-varselet til spilleren og cache-tømmingen. Ingen
 * av dem speiles her.
 *
 * Portene under står foran for UX-ens skyld: uten nett eller økt, i en runde som
 * er i gang, eller forbi veiviserens tak skal svaret komme uten en rundtur.
 *
 * **Idempotent:** står spilleren alt på rosteret, svarer ruta
 * `alreadyOnRoster: true` uten nytt varsel, og det er suksess (`alreadyDone`),
 * slik at to trykk eller to enheter ikke gir en feilmelding.
 *
 * Kandidatraden tas imot som før (#2209), men bare id-en brukes: tee-settet
 * leser kjernen selv fra profilen.
 */
export async function addPlayerToGame(
  gameId: string,
  player: { id: string },
): Promise<RosterActionResult> {
  const userId = await currentDeviceUserId();
  const notReady = refuseUnlessReady(userId);
  if (notReady) return notReady;

  const game = await loadGame(gameId);
  if ('error' in game) return game.error;
  // Aktiv/ferdig runde: rosteret er låst. Webben redirecter `game_locked`.
  if (game.row.status !== 'draft' && game.row.status !== 'scheduled') {
    return failed('roster-locked');
  }

  // Taket er det samme som veiviserens (`maxPlayersForMode`, N6a) — ikke et
  // nytt tall. Uten det kunne rosteret vokse forbi slot-budsjettet den delte
  // byggeren leser, og en niende spiller ville forsvunnet stille ved start.
  // Kjernens egen plass-sjekk (`game_full`) er webbens best-ball-tak, som
  // teller ALLE rader — trukne inkludert. Formater appen ikke kjenner (en
  // web-opprettet runde) har intet kjent tak her, og slipper forbi til ruta.
  if (isAppSupportedMode(game.row.game_mode)) {
    const roster = await loadGrouping(gameId);
    if ('error' in roster) return roster.error;
    if (roster.rows.length >= maxPlayersForMode(game.row.game_mode)) {
      return failed('roster-full');
    }
  }

  const call = await callWebRoute(
    `/api/games/${encodeURIComponent(gameId)}/players/${encodeURIComponent(player.id)}`,
    'POST',
  );
  if (!call.ok) return webApiFailure(call);
  if (call.status === 200) return done(call.body.alreadyOnRoster === true);
  return failed(addFailureFor(call.status, call.body));
}

/**
 * Svaret fra «legg til»-ruta som roster-kode. Der én status bærer flere koder,
 * leses kroppens `error` (som `inviteToGame.ts`). En 409 med en kode vi ikke
 * kjenner blir `db`: en gjettet forklaring er verre enn «noe gikk galt».
 */
function addFailureFor(
  status: number,
  body: Record<string, unknown>,
): RosterActionFailure {
  if (status === 401) return 'no-session';
  if (status === 403) return 'rls-denied';
  if (status === 404) return 'not-found';
  if (status === 409) {
    if (body.error === 'game_locked') return 'roster-locked';
    if (body.error === 'game_full') return 'roster-full';
    // Venne-/klubbporten. Samme setning som når RLS nekter: du har ikke lov.
    if (body.error === 'invite_not_allowed') return 'rls-denied';
  }
  return 'db';
}

/**
 * Fjern en spiller fra rosteret før runden starter.
 *
 * Speiler `app/[locale]/games/[id]/spillere/actions.ts:31-68`: kun
 * `draft`/`scheduled`. Er runden i gang, trekkes spilleren
 * ({@link withdrawPlayer}) i stedet — en sletting ville tatt scorene med seg
 * uten å si fra (#386).
 *
 * Cupkamper (`tournament_id` satt) nektes (#1937): en slettet rad gjør siden
 * ufullstendig, og kampen starter aldri (#1814). Arrangøren bytter spilleren
 * på cupsiden. RLS sier det samme (0178), så vakta her gir bare en forutsigbar
 * melding. Webben slipper global admin forbi; appen har ingen admin-flate og
 * nekter alle.
 *
 * Ingen vakt mot å fjerne sin EGEN rad. Det er webbens oppførsel: hverken
 * actionen eller `spillere/page.tsx` skiller på arrangørens rad, og både
 * `game_players creator delete` og `game_players self withdraw pre active`
 * tillater den i vanlige spill. Skal regelen endres, hører den hjemme i
 * begge flatene på én gang.
 */
export async function removePlayerFromGame(
  gameId: string,
  playerUserId: string,
): Promise<RosterActionResult> {
  const userId = await currentDeviceUserId();
  const notReady = refuseUnlessReady(userId);
  if (notReady) return notReady;

  const game = await loadGame(gameId);
  if ('error' in game) return game.error;
  if (game.row.tournament_id !== null) return failed('cup-roster-locked');
  if (game.row.status !== 'draft' && game.row.status !== 'scheduled') {
    return failed('roster-locked');
  }

  const deleted = readWriteResult(
    await supabase
      .from('game_players')
      .delete()
      .eq('game_id', gameId)
      .eq('user_id', playerUserId)
      .select('user_id'),
    'removePlayerFromGame',
  );
  if (deleted.ok) return afterWrite(gameId, done(false));
  if (deleted.error !== 'no-rows') return failed(deleted.error, deleted.message);

  // Borte = i mål. Fortsatt der = RLS nektet slettingen.
  return afterWrite(
    gameId,
    await resolveZeroRows(gameId, playerUserId, 'user_id', (row) =>
      row === null ? done(true) : failed('no-rows'),
    ),
  );
}

// -----------------------------------------------------------------------------
// 4–5. Lag og flight
// -----------------------------------------------------------------------------

/**
 * Sett lag for én spiller.
 *
 * To detaljer bærer skrivingen, begge speilet fra webbens `setPlayerTeam`
 * (`flightActions.ts`):
 *
 *  1. **`flight_number` skrives SAMMEN med `team_number`.** CHECK
 *     `game_players_team_flight_consistency` (0030/0095) sier at et lag
 *     impliserer en flight. Spillerens eksisterende flight beholdes; mangler
 *     den, speiles lagnummeret — nøyaktig `row.flight_number ?? targetTeam`.
 *  2. **Kapasiteten kommer fra `expectedTeamSize(mode_config)`,** ikke fra et
 *     tall skrevet inn her. Trukne spillere teller ikke, og spilleren vi
 *     flytter teller ikke mot sin egen nye plass.
 *
 * `modeRequiresTeamNumber` holder wolf og round robin unna: de bruker
 * `team_number` som rotasjons-slot, og en manuell lag-tildeling ville
 * overskrevet trekningen.
 */
export async function setPlayerTeam(
  gameId: string,
  playerUserId: string,
  teamNumber: number,
): Promise<RosterActionResult> {
  const userId = await currentDeviceUserId();
  const notReady = refuseUnlessReady(userId);
  if (notReady) return notReady;

  if (!Number.isInteger(teamNumber) || teamNumber < 1) return failed('bad-team');

  const game = await loadGame(gameId);
  if ('error' in game) return game.error;
  if (game.row.status !== 'scheduled' && game.row.status !== 'active') {
    return failed('not-active');
  }
  const teamSize = expectedTeamSize(game.row.mode_config);
  if (!modeRequiresTeamNumber(game.row.game_mode as GameMode, teamSize)) {
    return failed('no-team-mode');
  }

  const grouping = await loadGrouping(gameId);
  if ('error' in grouping) return grouping.error;
  const me = grouping.rows.find((row) => row.user_id === playerUserId);
  if (!me) return failed('not-found');
  if (
    occupancy(grouping.rows, (row) => row.team_number, teamNumber, playerUserId) >=
    teamSize
  ) {
    return failed('team-full');
  }

  const updated = readWriteResult(
    await supabase
      .from('game_players')
      .update({
        team_number: teamNumber,
        flight_number: me.flight_number ?? teamNumber,
      })
      .eq('game_id', gameId)
      .eq('user_id', playerUserId)
      .select('user_id'),
    'setPlayerTeam',
  );
  if (updated.ok) return afterWrite(gameId, done(false));
  if (updated.error !== 'no-rows') return failed(updated.error, updated.message);

  return afterWrite(
    gameId,
    await resolveZeroRows(gameId, playerUserId, 'team_number', (row) =>
      row?.team_number === teamNumber ? done(true) : failed('no-rows'),
    ),
  );
}

/**
 * Sett flight for én spiller. Speiler webbens `setPlayerFlight`.
 *
 * Kapasiteten er `MAX_FLIGHT_SIZE` fra den delte modulen — fire baller på ett
 * hull er en fysisk grense, ikke en preferanse. Trukne spillere teller ikke.
 *
 * Ingen lag-gate her: flight er meningsfull i alle formater, også de som ikke
 * har lag i det hele tatt.
 */
export async function setPlayerFlight(
  gameId: string,
  playerUserId: string,
  flightNumber: number,
): Promise<RosterActionResult> {
  const userId = await currentDeviceUserId();
  const notReady = refuseUnlessReady(userId);
  if (notReady) return notReady;

  if (!Number.isInteger(flightNumber) || flightNumber < 1) {
    return failed('bad-flight');
  }

  const game = await loadGame(gameId);
  if ('error' in game) return game.error;
  if (game.row.status !== 'scheduled' && game.row.status !== 'active') {
    return failed('not-active');
  }

  const grouping = await loadGrouping(gameId);
  if ('error' in grouping) return grouping.error;
  if (!grouping.rows.some((row) => row.user_id === playerUserId)) {
    return failed('not-found');
  }
  if (
    occupancy(
      grouping.rows,
      (row) => row.flight_number,
      flightNumber,
      playerUserId,
    ) >= MAX_FLIGHT_SIZE
  ) {
    return failed('flight-full');
  }

  const updated = readWriteResult(
    await supabase
      .from('game_players')
      .update({ flight_number: flightNumber })
      .eq('game_id', gameId)
      .eq('user_id', playerUserId)
      .select('user_id'),
    'setPlayerFlight',
  );
  if (updated.ok) return afterWrite(gameId, done(false));
  if (updated.error !== 'no-rows') return failed(updated.error, updated.message);

  return afterWrite(
    gameId,
    await resolveZeroRows(gameId, playerUserId, 'flight_number', (row) =>
      row?.flight_number === flightNumber ? done(true) : failed('no-rows'),
    ),
  );
}

// -----------------------------------------------------------------------------
// 6–7. Trekk og angre
// -----------------------------------------------------------------------------

/**
 * Gatene WD og angre-WD deler, speilet fra `adminWithdrawPlayer`
 * (`admin/games/[id]/actions.ts`): kun en AKTIV runde, og kun formater der
 * eksklusjon faktisk endrer resultatet (`supportsWithdrawal`). I scramble- og
 * matchplay-familien betyr et frafall noe annet, og der finnes knappen ikke.
 */
async function refuseUnlessWithdrawable(
  gameId: string,
): Promise<RosterActionResult | null> {
  const game = await loadGame(gameId);
  if ('error' in game) return game.error;
  if (game.row.status !== 'active') return failed('not-active');
  if (!supportsWithdrawal(game.row.game_mode as GameMode)) {
    return failed('withdrawal-unsupported');
  }
  return null;
}

/**
 * Trekk en spiller (WD, #386). Scorene blir liggende i DB, men holdes utenfor
 * tavla — derfor er dette handlingen for en runde som ER i gang, mens
 * {@link removePlayerFromGame} eier tiden før start.
 *
 * `.is('withdrawn_at', null)`-filteret gjør skrivingen idempotent: et
 * dobbelttrykk skriver ikke et nytt tidspunkt oppå det gamle, det treffer 0
 * rader og leses som «alt trukket».
 *
 * ⚠️ På arrangørens EGEN rad nekter `guard_game_players_self_update` (0147)
 * denne skrivingen for en ikke-admin oppretter — vakta har ingen creator-vei
 * ut av egen-rad-grenen. Da svarer Postgres 42501 og resultatet blir
 * `rls-denied`. Webben treffer det aldri, fordi den skriver med service-role.
 *
 * @param opts `onlyIfUnsubmitted` legger `submitted_at IS NULL` på selve
 * UPDATE-en (#1896), slik at et kort som lander mens skrivet er underveis
 * vinner i stedet for å bli overkjørt. Kun avslutt-flyten ber om den: fra
 * roster-flaten er det helt lovlig å trekke en spiller som HAR levert, og en
 * ubetinget regel her ville gjort den handlingen umulig (AGENTS.md felle 4).
 */
export async function withdrawPlayer(
  gameId: string,
  playerUserId: string,
  opts: { onlyIfUnsubmitted?: boolean } = {},
): Promise<RosterActionResult> {
  const userId = await currentDeviceUserId();
  const notReady = refuseUnlessReady(userId);
  if (notReady) return notReady;

  const blocked = await refuseUnlessWithdrawable(gameId);
  if (blocked) return blocked;

  const onlyIfUnsubmitted = opts.onlyIfUnsubmitted === true;
  const write = supabase
    .from('game_players')
    .update({
      withdrawn_at: new Date().toISOString(),
      withdrawn_by_user_id: userId,
    })
    .eq('game_id', gameId)
    .eq('user_id', playerUserId)
    .is('withdrawn_at', null);

  const updated = readWriteResult(
    await (onlyIfUnsubmitted ? write.is('submitted_at', null) : write).select(
      'user_id',
    ),
    'withdrawPlayer',
  );
  if (updated.ok) return afterWrite(gameId, done(false));
  if (updated.error !== 'no-rows') return failed(updated.error, updated.message);

  // Uten opt-in leses bare `withdrawn_at`, som før: der er «rakk å levere»
  // ingen egen grunn, og et treff på leverte rader er selve poenget.
  return afterWrite(
    gameId,
    await resolveZeroRows(
      gameId,
      playerUserId,
      onlyIfUnsubmitted ? 'withdrawn_at, submitted_at' : 'withdrawn_at',
      (row) => {
        if (row === null) return failed('no-rows');
        if (row.withdrawn_at != null) return done(true);
        if (onlyIfUnsubmitted && row.submitted_at != null) {
          return failed('already-submitted');
        }
        return failed('no-rows');
      },
    ),
  );
}

/**
 * Angre et frafall: nuller begge feltene så spilleren teller med igjen — i
 * beredskaps-tellingen og på tavla. Samme gater som {@link withdrawPlayer}.
 *
 * `.not('withdrawn_at', 'is', null)`-filteret er speilbildet av WD-filteret:
 * bare en trukket spiller kan gjeninnsettes.
 */
export async function undoWithdrawPlayer(
  gameId: string,
  playerUserId: string,
): Promise<RosterActionResult> {
  const userId = await currentDeviceUserId();
  const notReady = refuseUnlessReady(userId);
  if (notReady) return notReady;

  const blocked = await refuseUnlessWithdrawable(gameId);
  if (blocked) return blocked;

  const updated = readWriteResult(
    await supabase
      .from('game_players')
      .update({ withdrawn_at: null, withdrawn_by_user_id: null })
      .eq('game_id', gameId)
      .eq('user_id', playerUserId)
      .not('withdrawn_at', 'is', null)
      .select('user_id'),
    'undoWithdrawPlayer',
  );
  if (updated.ok) return afterWrite(gameId, done(false));
  if (updated.error !== 'no-rows') return failed(updated.error, updated.message);

  return afterWrite(
    gameId,
    await resolveZeroRows(gameId, playerUserId, 'withdrawn_at', (row) =>
      row !== null && row.withdrawn_at == null ? done(true) : failed('no-rows'),
    ),
  );
}

// -----------------------------------------------------------------------------
// 8. Åpne et levert kort igjen
// -----------------------------------------------------------------------------

/**
 * Åpne et levert scorekort igjen (#2220), arrangørens angrevei etter levering.
 *
 * **Via ruta (#2215).** `POST /api/games/{id}/scorecards/{userId}` med
 * `decision: 'reopen'` kaller samme kjerne som webbens «Åpne for redigering».
 * Fram til #2215 var dette en direkte UPDATE under RLS: kortet ble åpnet, men
 * spilleren fikk aldri `scorecard_reopened`, og nettsiden viste kortet som
 * levert til cachen gikk ut. Nå eier ruta alt: at spillet er aktivt, at kalleren
 * er arrangør, at kortet faktisk er levert, og at alle fire kolonnene nulles i
 * samme skriving (avslutningen leser både `submitted_at` og `approved_at`,
 * `needsPeerApproval`).
 *
 * **Felles lagkort (#2213)** åpnes for hele laget av kjernen, med service-role.
 * Appen trenger ikke lenger å lese rosteret for å finne lagkameratene.
 *
 * Ruta tømmer web-cachen selv, så her kalles ikke `refreshWebCache`.
 */
export async function reopenScorecard(
  gameId: string,
  playerUserId: string,
): Promise<RosterActionResult> {
  const userId = await currentDeviceUserId();
  const notReady = refuseUnlessReady(userId);
  if (notReady) return notReady;

  const call = await callScorecardRoute(gameId, playerUserId, { decision: 'reopen' });
  if (!call.ok) return webApiFailure(call);
  if (call.status === 200) return done(call.body.alreadyDone === true);
  return failed(reopenFailureFor(call.status));
}

/**
 * Svaret fra scorekort-ruta som roster-kode. 400, 422 og 500 er alle «prøv
 * igjen» (`db`): med knappen der den står, er ingen av dem noe arrangøren kan
 * rette på selv.
 */
function reopenFailureFor(status: number): RosterActionFailure {
  if (status === 401) return 'no-session';
  if (status === 403) return 'rls-denied';
  if (status === 404) return 'not-found';
  if (status === 409) return 'not-active';
  return 'db';
}

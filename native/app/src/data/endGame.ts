// native/app/src/data/endGame.ts
// Native N6c (#1856): avslutte runden fra appen.
//
// **Gatene er delt, skrivingene er egne.** `lib/games/endGameCore.ts` åpner med
// `import 'server-only'` — appens `node_modules/server-only` er en bar `throw`,
// så modulen kaster ved import under Metro/Hermes. Den drar dessuten inn
// `next/cache`, Resend-mail og fire service-role-hjelpere. Motsatt konklusjon av
// N6b, altså: starten kunne kalle en delt, import-ren kjerne
// (`startScheduledGameCore`; siden #2215 går den via en rute i stedet),
// avslutningen kan ikke. Selve regelen — hvem som sperrer avslutningen — bor
// derimot i den import-frie `lib/games/finishGate.ts` (#2222), som kjernen og
// denne fila leser begge. Status-sjekken og skrivingene under er appens egne.
//
// **Hva som IKKE skjer her.** Alt etter status-flippen i webben — avledede
// spill, resultatsammendrag (#572), WHS-differensialer (#941), bragder (#947),
// runde-referat (#1008), «Resultatet er klart»-mail og admin-hendelsesloggen —
// er server-eid. Seks av stegene kaller `getAdminClient()` selv, og en telefon
// kan aldri holde service-role-nøkkelen. Halen tas av finish-fullføreren på
// serversiden; appen flipper status og stopper der. Bokført gap, ikke en glipp.
// Det eneste appen ber serveren om etter flippen, er å tømme web-cachen
// (`refreshWebCache`, #2215), så nettsiden viser runden som avsluttet med én
// gang i stedet for når fullføreren kommer innom.
//
// **Skriverekkefølgen er en regel, ikke en preferanse.** (a) frafall, (b)
// LD/CTP-vinnerne, (c) status-flippen — samme rekkefølge som `endGameCore`.
// Feiler vinner-upserten står spillet igjen som `active`, og arrangøren kan
// prøve igjen: upserten er idempotent på PK-en `(game_id, category, position)`.
// Snus rekkefølgen, kan et spill bli `finished` uten kåring, og #1850-seksjonen
// viser en tom sideturnering som ser ferdig ut.
//
// **Peer-gaten relakseres ALDRI av `allowMissing`.** `finishGate` spør
// `needsPeerApproval`, som aldri leser `allowMissing`, og som også stopper en
// rad der bare den ene av `submitted_at`/`approved_at` er nullet.
//
// **Trap 2.** PostgREST svarer `error == null` på skriv som traff 0 rader.
// Begge skrivene kjeder derfor `.select(...)` og går gjennom den delte
// `expectAffected`. Formen er verifisert mot torny-staging med ekte JWT for en
// ikke-admin oppretter (2026-09-01): vinner-upserten svarer 201 + rader mens
// spillet fortsatt er `active`, flippen med `status=eq.active`-låsen svarer
// 200 + rad, og en re-flipp av et alt avsluttet spill svarer 200 + tom liste.
// Tom liste er derfor et rent idempotens-signal — men den er ikke ENTYDIG (en
// nektet UPDATE filtreres også bort til 0 rader), så den løses med ett
// oppfølgings-SELECT, som resten av datalaget gjør.
import {
  supportsWithdrawal,
  type GameMode,
} from '../../../../lib/scoring/modes/types';
import {
  expectAffected,
  NoRowsAffectedError,
} from '../../../../lib/supabase/affectedRows';
import { isSideWinnerNotActive } from '../../../../lib/games/sideWinnerGuard';
import { finishGate, stampsFromRow } from '../../../../lib/games/finishGate';
import { currentDeviceUserId, supabase } from '../supabase';
import { withdrawPlayer } from './rosterActions';
import { refreshWebCache } from './refreshWebCache';
import type { SideWinnerRow } from './sideWinners';
import { isDeviceOnline } from './syncTriggers';

/**
 * Én kåret slot, slik den skrives.
 *
 * Samme form som lese-siden ({@link SideWinnerRow}) med vilje: skrives det noe
 * annet enn det som leses, viser appen andre vinnere enn den lagret.
 * `position` er hvilken SLOT raden gjelder (LD-hull 1 eller 2), aldri en
 * plassering, og `winner_user_id: null` er «Ingen kvalifiserte» — et eksplisitt
 * valg arrangøren tar, ikke en manglende verdi.
 */
export type EndRoundSideWinner = SideWinnerRow;

/**
 * Hvorfor avslutningen ikke gikk gjennom. Skjermen oversetter til norsk copy —
 * datalaget har ingen bruker-tekst, som i `rosterActions.ts`.
 */
export type EndRoundFailure =
  | 'no-session'
  /** Skrivingene går aldri i sync-køen; uten nett finnes det ingenting å gjøre. */
  | 'offline'
  /** Spillet finnes ikke, eller er ikke synlig for oss. */
  | 'not-found'
  /** Cup-kamp: avslutningen eies av cup-flyten på nettsiden. */
  | 'cup-game'
  /** Samme sjekk som `endGameCore` — kun en `active` runde kan avsluttes. */
  | 'not-active'
  /** `finishGate`: spillet har ingen spillere. */
  | 'no-players'
  /** `finishGate`: noen har ikke levert. Relakseres av `allowMissing`. */
  | 'not-all-submitted'
  /** `finishGate`: noen mangler godkjenning. Relakseres ALDRI. */
  | 'not-all-approved'
  /** Formatet støtter ikke frafall — et WD betyr noe annet der. */
  | 'withdrawal-unsupported'
  /**
   * En avkrysset spiller rakk å levere mens arrangøren sto på skjermen.
   * Fail-closed: da trekkes INGEN — heller ikke de andre avkryssede.
   */
  | 'withdraw-after-submit'
  /**
   * Samme kappløp, men fanget av selve skrivet (#1896) ETTER at de første i
   * bunken alt var trukket. Delvis utfall: de før er trukket, denne er ikke.
   * Egen kode fordi copyen for `withdraw-after-submit` lover at ingen ble
   * trukket — og her stemmer ikke det.
   */
  | 'withdraw-after-submit-partial'
  /** Et frafalls-skriv feilet; spillet står fortsatt `active`. */
  | 'db-withdraw'
  /** Kåringen ble ikke lagret; spillet står fortsatt `active`, retry er trygt. */
  | 'db-winners'
  /**
   * #2284: databasen nektet en vinner som har trukket seg (eller ikke er med i
   * spillet), vakta fra migrasjon 0193. Kappløp mot en utdatert liste: ingenting
   * ble lagret, spillet står `active`, og skjermen henter lista på nytt.
   */
  | 'winner-withdrawn'
  /** SQLSTATE 42501 — Postgres nektet skrivingen (policy eller vakt-trigger). */
  | 'rls-denied'
  /** Ingen feil, men heller ingen rad, og raden er ikke i måltilstanden. */
  | 'no-rows'
  | 'db';

export type EndRoundResult =
  | {
      ok: true;
      /**
       * `true` når spillet alt var avsluttet da flippen kom fram — en annen
       * enhet, et dobbelttrykk, eller nettsiden rakk det først. Fortsatt
       * suksess: runden ER avsluttet, og skjermen skal si det, aldri vise en
       * feil. Samme vinner-semantikk som `alreadyRunning` i `startGame.ts`.
       */
      alreadyFinished: boolean;
    }
  | {
      ok: false;
      reason: EndRoundFailure;
      /**
       * Hvem det står på, ved `not-all-submitted`, `not-all-approved`,
       * `withdrawal-unsupported`, `withdraw-after-submit(-partial)` og
       * `db-withdraw`. Råstoff for copyen — uten
       * navnene må arrangøren gjette hvem hen skal purre på.
       */
      blockedUserIds?: string[];
      message?: string;
    };

export interface EndRoundOptions {
  /**
   * «Avslutt likevel» (#375): spillere uten levert kort blokkerer ikke lenger.
   * Slakker KUN levert-gaten. Peer-gaten står uansett.
   */
  allowMissing?: boolean;
  /**
   * Spillerne arrangøren har krysset av som trukket. Skrives FØR gatene leses,
   * slik at et frafall faktisk fjerner blokkeringen det skulle fjerne.
   */
  withdrawUserIds?: string[];
  /** Kåringen, én rad per LD-/CTP-slot. Tom for en runde uten sideturnering. */
  sideWinners?: EndRoundSideWinner[];
}

/** PostgRESTs kode for «insufficient_privilege» — RLS eller en vakt avviste raden. */
const RLS_DENIED_CODE = '42501';

const done = (alreadyFinished: boolean): EndRoundResult => ({
  ok: true,
  alreadyFinished,
});

const failed = (
  reason: EndRoundFailure,
  message?: string,
  blockedUserIds?: string[],
): EndRoundResult => ({
  ok: false,
  reason,
  ...(blockedUserIds === undefined ? {} : { blockedUserIds }),
  ...(message === undefined ? {} : { message }),
});

// -----------------------------------------------------------------------------
// Lesing
// -----------------------------------------------------------------------------

/** Spill-feltene gatene leser. `status`/`game_mode` smalnes ved bruk. */
interface FinishGateRow {
  status: string;
  game_mode: string;
  require_peer_approval: boolean;
  tournament_id: string | null;
}

/** Roster-radene gatene leser. Trukne rader er MED — de filtreres i loopen. */
interface FinishPlayerRow {
  user_id: string;
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
}

/**
 * Innlogget og på nett? Begge er forutsetninger, ikke feil å oppdage midt i en
 * skriving. Nett-gaten er ikke pynt: avslutningen går ALDRI i sync-køen, og
 * uten den ville et trykk i flymodus endt i en rå «Network request failed».
 */
function refuseUnlessReady(userId: string | null): EndRoundResult | null {
  if (!userId) return failed('no-session');
  if (!isDeviceOnline()) return failed('offline');
  return null;
}

async function loadFinishGate(
  gameId: string,
): Promise<{ row: FinishGateRow } | { error: EndRoundResult }> {
  const { data, error } = await supabase
    .from('games')
    .select('status, game_mode, require_peer_approval, tournament_id')
    .eq('id', gameId)
    .maybeSingle<FinishGateRow>();
  if (error) return { error: failed('db', error.message) };
  if (!data) return { error: failed('not-found') };
  return { row: data };
}

/**
 * Samme kolonner som roster-lesingen i `endGameCore`: de tre stemplene
 * `finishGate` leser, og `user_id` for å navngi hvem som sperrer.
 */
async function loadFinishPlayers(
  gameId: string,
): Promise<{ rows: FinishPlayerRow[] } | { error: EndRoundResult }> {
  const { data, error } = await supabase
    .from('game_players')
    .select('user_id, submitted_at, approved_at, withdrawn_at')
    .eq('game_id', gameId)
    .returns<FinishPlayerRow[]>();
  if (error) return { error: failed('db', error.message) };
  return { rows: data ?? [] };
}

/**
 * Les svaret på en skriving og gi den ene sannheten tilbake: traff den rader?
 * Ordrett samme deling som `rosterActions.ts` og `createGame.ts` gjør.
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

// -----------------------------------------------------------------------------
// Gatene — delt med webben (`lib/games/finishGate.ts`)
// -----------------------------------------------------------------------------

/**
 * Første blokkerende grunn, med alle spillerne den gjelder — eller `null` når
 * rosteret er klart.
 *
 * Regelen er `finishGate`, den samme som `endGameCore` bruker (#2222): grunnen
 * velges i roster-rekkefølge, hele klassen samles opp slik at skjermen kan
 * navngi alle på én gang, trukne spillere sperrer aldri, og `allowMissing`
 * slakker aldri peer-gaten. Denne funksjonen oversetter bare svaret til appens
 * feilkoder.
 *
 * ⚠️ Minst-én-spiller-porten teller RÅ rader, også trukne. Et spill der alle er
 * trukket kan altså avsluttes, akkurat som på nettsiden. WD-unntaket er
 * lastbærende for cup-flyten.
 */
function findBlockingPlayers(
  rows: FinishPlayerRow[],
  gate: { allowMissing: boolean; requirePeerApproval: boolean },
): EndRoundResult | null {
  const result = finishGate(rows, stampsFromRow, gate);
  if (result.ok) return null;
  if (result.reason === 'no_players') return failed('no-players');
  return failed(
    result.reason === 'not_all_submitted' ? 'not-all-submitted' : 'not-all-approved',
    undefined,
    result.blocked.map((player) => player.user_id),
  );
}

// -----------------------------------------------------------------------------
// Skrivingene, i rekkefølge
// -----------------------------------------------------------------------------

/**
 * Hvem av de avkryssede som alt har levert.
 *
 * Arrangøren ser «ikke levert» og huker av; spilleren leverer på sin egen
 * telefon i mellomtiden; arrangøren trykker avslutt. Uten denne vakten ville
 * frafallet blitt skrevet uansett, og en spiller som gjorde alt riktig mistet
 * runden sin — stille, for `withdrawPlayer` treffer raden sin og svarer OK.
 *
 * Roster-rekkefølge, som {@link findBlockingPlayers}: navnene skal komme i
 * samme orden på alle flatene arrangøren ser dem.
 */
function lateSubmitters(
  rows: FinishPlayerRow[],
  userIds: readonly string[],
): string[] {
  return rows
    .filter((row) => userIds.includes(row.user_id) && row.submitted_at !== null)
    .map((row) => row.user_id);
}

/**
 * (a) Merk de avkryssede spillerne som trukket.
 *
 * Skrivingen er `withdrawPlayer` i `rosterActions.ts` — samme rad, samme
 * kolonner, samme RLS-vei, alt testet der. En lokal kopi ville vært det samme
 * tallet på to steder (AGENTS.md felle 4).
 *
 * `supportsWithdrawal`-porten er webbens (`avslutt-likevel/actions.ts:43`).
 * Webben DROPPER stille frafallene i et format uten WD-støtte; her sier vi det
 * i stedet. Et stille dropp ville latt arrangøren tro at en spiller var trukket
 * mens hen fortsatt sto som «ikke levert».
 *
 * ⚠️ Arrangøren kan ikke trekke SEG SELV: `guard_game_players_self_update`
 * (0147) har ingen creator-vei ut av egen-rad-grenen, og Postgres svarer 42501.
 * Nøyaktig samme grense som på nettsiden for en ikke-admin oppretter.
 *
 * **Leverings-kappløpet.** Avkryssingen ble gjort mot listen slik den så ut da
 * skjermen ble tegnet, og et kort kan komme inn mellom det trykket og dette
 * skrivet. Derfor leses rosteret ÉN gang til her, før første frafall — se
 * {@link lateSubmitters}.
 *
 * For-lesingen lukker likevel ikke vinduet helt: for spiller nummer N spenner
 * det 2N+1 rundturer, og et kort kan lande inni det. Siste linje er derfor
 * `onlyIfUnsubmitted` (#1896), som legger betingelsen i selve UPDATE-en.
 *
 * ⚠️ Den kan gi et DELVIS utfall: spillerne 1..N−1 er trukket når nummer N
 * avvises. Det er akseptert — alternativet er å rulle tilbake trekk arrangøren
 * faktisk ba om. Utfallet får da sin EGEN kode, `withdraw-after-submit-partial`,
 * for copyen til `withdraw-after-submit` lover at ingen ble trukket. Skjermen
 * refresher på begge og viser sann tilstand, og et trekk som ble for mye angres
 * fra roster-flaten.
 */
async function markWithdrawals(
  gameId: string,
  gameMode: string,
  userIds: string[],
): Promise<EndRoundResult | null> {
  if (userIds.length === 0) return null;
  if (!supportsWithdrawal(gameMode as GameMode)) {
    return failed('withdrawal-unsupported', undefined, userIds);
  }

  const before = await loadFinishPlayers(gameId);
  if ('error' in before) return before.error;
  const late = lateSubmitters(before.rows, userIds);
  // Fail-closed, og alle-eller-ingen: én uventet levering stopper HELE bunken.
  // Å trekke «resten» ville vært en halv handling arrangøren ikke ba om, mot en
  // liste hen nettopp har fått vite at hen ikke kan stole på.
  if (late.length > 0) return failed('withdraw-after-submit', undefined, late);

  let withdrawn = 0;
  for (const playerUserId of userIds) {
    const result = await withdrawPlayer(gameId, playerUserId, {
      onlyIfUnsubmitted: true,
    });
    if (result.ok) {
      withdrawn += 1;
      continue;
    }
    // Samme form som for-lesingen gir (`blockedUserIds` = den som rakk å
    // levere). Koden skiller på om noen alt ER trukket: bare da er «ingen ble
    // trukket» usant, og da må setningen si noe annet.
    if (result.reason === 'already-submitted') {
      return failed(
        withdrawn === 0 ? 'withdraw-after-submit' : 'withdraw-after-submit-partial',
        undefined,
        [playerUserId],
      );
    }
    return failed(
      result.reason === 'rls-denied' ? 'rls-denied' : 'db-withdraw',
      result.message,
      [playerUserId],
    );
  }
  return null;
}

/**
 * (b) Lagre kåringen FØR status-flippen.
 *
 * Idempotent på PK-en `(game_id, category, position)`, så en retry etter en
 * feilet flipp skriver det samme settet på nytt uten å duplisere noe —
 * bekreftet mot staging også på et alt avsluttet spill.
 */
async function upsertSideWinners(
  gameId: string,
  winners: EndRoundSideWinner[],
): Promise<EndRoundResult | null> {
  if (winners.length === 0) return null;

  const rows = winners.map((winner) => ({
    game_id: gameId,
    category: winner.category,
    position: winner.position,
    // Null er «Ingen kvalifiserte» — en kåring som ble gjort, ikke en som mangler.
    winner_user_id: winner.winner_user_id,
  }));

  const response = await supabase
    .from('game_side_winners')
    .upsert(rows, { onConflict: 'game_id,category,position' })
    // Uten `.select()` finnes det ikke noe radantall å sjekke (trap 2).
    .select('position');
  // #2284: vakta i databasen (0193) svarer P0001, som `readWriteResult` ville
  // gjort til en anonym `db`. Sjekkes på det rå svaret, med samme gjenkjenning
  // som webben. Upserten er ett statement, så ingen rad i bunken ble skrevet.
  if (isSideWinnerNotActive(response.error)) return failed('winner-withdrawn');
  const written = readWriteResult(response, 'finishRound.sideWinners');
  if (written.ok) return null;
  return failed(
    written.error === 'rls-denied' ? 'rls-denied' : 'db-winners',
    written.message,
  );
}

/**
 * (c) Flipp `active → finished`, med optimistisk lås.
 *
 * `.eq('status', 'active')` er samme lås som webben har (#1856). Uten den ville
 * et dobbelttrykk skrevet et nytt `ended_at` oppå det gamle og flyttet
 * tidspunktet runden ble avsluttet.
 *
 * 0 rader er IKKE entydig: både «noen andre avsluttet den først» og «RLS nektet
 * skrivingen» filtreres bort til tom liste. Derfor ett oppfølgings-SELECT, som
 * `resolveZeroRows` i `rosterActions.ts`: står spillet som `finished`, var
 * flippen et idempotent no-op og arrangøren fikk det hen ba om. Står det ikke
 * det, ble skrivingen nektet, og det MÅ vises som en feil — stille suksess
 * finnes ikke her.
 */
async function flipToFinished(gameId: string): Promise<EndRoundResult> {
  const flipped = readWriteResult(
    await supabase
      .from('games')
      .update({ status: 'finished', ended_at: new Date().toISOString() })
      .eq('id', gameId)
      .eq('status', 'active')
      .select('id'),
    'finishRound.finish',
  );
  if (flipped.ok) return done(false);
  if (flipped.error !== 'no-rows') return failed(flipped.error, flipped.message);

  const { data, error } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .maybeSingle<{ status: string }>();
  if (error) return failed('db', error.message);
  return data?.status === 'finished' ? done(true) : failed('no-rows');
}

// -----------------------------------------------------------------------------
// Inngangen
// -----------------------------------------------------------------------------

/**
 * Avslutt runden herfra.
 *
 * Rekkefølgen er kontrakten: porter → (a) frafall → (b) kåring → (c) flipp.
 * Rosteret leses ETTER frafallene, slik at en spiller arrangøren nettopp
 * krysset av faktisk slutter å blokkere — og ÉN gang til FØR dem
 * ({@link lateSubmitters}), slik at et kort som kom inn i mellomtiden stopper
 * frafallet i stedet for å bli overkjørt av det.
 *
 * @param gameId spillet som skal flippes fra `active` til `finished`.
 * @param options «avslutt likevel», frafallene og kåringen.
 * @returns suksess (også når noen andre rakk flippen først) eller et typet avslag.
 */
export async function finishRound(
  gameId: string,
  options: EndRoundOptions = {},
): Promise<EndRoundResult> {
  const {
    allowMissing = false,
    withdrawUserIds = [],
    sideWinners = [],
  } = options;

  const userId = await currentDeviceUserId();
  const notReady = refuseUnlessReady(userId);
  if (notReady) return notReady;

  const game = await loadFinishGate(gameId);
  if ('error' in game) return game.error;

  // Cup-kampen avsluttes fra nettsiden. Cup-flyten eier `finishDerivedGames` og
  // undertrykkingen av per-spill-varsler; en app-flipp ville gått utenom begge
  // og etterlatt cup-tavla halvferdig. Porten står FØRST fordi svaret er det
  // samme uansett status: «dette gjøres på nettsiden».
  if (game.row.tournament_id !== null) return failed('cup-game');
  if (game.row.status !== 'active') return failed('not-active');

  const withdrawn = await markWithdrawals(
    gameId,
    game.row.game_mode,
    withdrawUserIds,
  );
  if (withdrawn) return withdrawn;

  const players = await loadFinishPlayers(gameId);
  if ('error' in players) return players.error;
  const blocked = findBlockingPlayers(players.rows, {
    allowMissing,
    requirePeerApproval: game.row.require_peer_approval,
  });
  if (blocked) return blocked;

  const winners = await upsertSideWinners(gameId, sideWinners);
  if (winners) return winners;

  // Cachen tømmes etter en vellykket flipp, også når noen andre rakk den først:
  // nettsiden kan fortsatt vise runden som aktiv. Svaret endrer ikke utfallet.
  const finished = await flipToFinished(gameId);
  if (finished.ok) await refreshWebCache(gameId);
  return finished;
}

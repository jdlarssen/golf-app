// native/app/src/data/endGame.ts
// Native N6c (#1856): avslutte runden fra appen.
//
// **Hvorfor speilet og ikke delt.** `lib/games/endGameCore.ts` åpner med
// `import 'server-only'` — appens `node_modules/server-only` er en bar `throw`,
// så modulen kaster ved import under Metro/Hermes. Den drar dessuten inn
// `next/cache`, Resend-mail og fire service-role-hjelpere. Motsatt konklusjon av
// N6b, altså: starten kunne kalle en delt, import-ren kjerne
// (`startScheduledGameCore`), avslutningen kan ikke. Gatene under er derfor en
// SPEILING av `endGameCore.ts:153-196`, og jest-paritet per gren er det som
// holder de to i lås. Endres kjernen, endres denne fila i samme PR.
//
// **Hva som IKKE skjer her.** Alt etter status-flippen i webben — avledede
// spill, resultatsammendrag (#572), WHS-differensialer (#941), bragder (#947),
// runde-referat (#1008), «Resultatet er klart»-mail og admin-hendelsesloggen —
// er server-eid. Seks av stegene kaller `getAdminClient()` selv, og en telefon
// kan aldri holde service-role-nøkkelen. Halen tas av finish-fullføreren på
// serversiden; appen flipper status og stopper der. Bokført gap, ikke en glipp.
//
// **Skriverekkefølgen er en regel, ikke en preferanse.** (a) frafall, (b)
// LD/CTP-vinnerne, (c) status-flippen — nøyaktig som `endGameCore:199-229`.
// Feiler vinner-upserten står spillet igjen som `active`, og arrangøren kan
// prøve igjen: upserten er idempotent på PK-en `(game_id, category, position)`.
// Snus rekkefølgen, kan et spill bli `finished` uten kåring, og #1850-seksjonen
// viser en tom sideturnering som ser ferdig ut.
//
// **Peer-gaten relakseres ALDRI av `allowMissing`.** I webben holder den
// invarianten på dataform: `continue`-en for en uinnlevert spiller hopper
// strukturelt over peer-sjekken, og det er ufarlig bare fordi `reopenScorecard`
// nuller `submitted_at` og `approved_at` i samme UPDATE. Her er vakten skrevet
// ut i stedet ({@link needsPeerApproval}) — den leser aldri `allowMissing`, og
// den stopper også en rad der bare den ene av de to er nullet.
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
import { needsPeerApproval } from '../lib/endGamePlan';
import { currentDeviceUserId, supabase } from '../supabase';
import { withdrawPlayer } from './rosterActions';
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
  /** Speiler `endGameCore:153-155` — kun en `active` runde kan avsluttes. */
  | 'not-active'
  /** Speiler `endGameCore:178-180` — spillet har ingen spillere. */
  | 'no-players'
  /** Speiler `endGameCore:181-193`. Relakseres av `allowMissing`. */
  | 'not-all-submitted'
  /** Speiler `endGameCore:194-196`. Relakseres ALDRI. */
  | 'not-all-approved'
  /** Formatet støtter ikke frafall — et WD betyr noe annet der. */
  | 'withdrawal-unsupported'
  /**
   * En avkrysset spiller rakk å levere mens arrangøren sto på skjermen.
   * Fail-closed: da trekkes INGEN — heller ikke de andre avkryssede.
   */
  | 'withdraw-after-submit'
  /** Et frafalls-skriv feilet; spillet står fortsatt `active`. */
  | 'db-withdraw'
  /** Kåringen ble ikke lagret; spillet står fortsatt `active`, retry er trygt. */
  | 'db-winners'
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
       * `withdrawal-unsupported` og `db-withdraw`. Råstoff for copyen — uten
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
 * Roster-lesingen speiler `endGameCore:162-176` minus `users`-joinen — den
 * finnes der kun for å bygge mail-mottakerne, og mailen er server-eid.
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
// Gatene — speilet fra endGameCore:181-197
// -----------------------------------------------------------------------------

/**
 * **Den eksplisitte peer-vakten bor i `lib/endGamePlan.ts`.**
 *
 * Webben stiller aldri spørsmålet for en uinnlevert spiller — `continue`-en
 * hopper strukturelt over sjekken — og det er trygt NÅ bare fordi
 * `reopenScorecard` nuller `submitted_at` og `approved_at` sammen. Regelen er
 * derfor skrevet ut i stedet, og den fanger begge halvdelene av paret (levert
 * uten godkjenning, og godkjent uten levering).
 *
 * Den ligger i `lib/` fordi avslutt-skjermen stiller NØYAKTIG samme spørsmål
 * når den navngir hvem som mangler godkjenning. To kopier ville vært to regler
 * (AGENTS.md felle 4), og skjermen kunne vist en klar liste mens skrivingen
 * avviste.
 *
 * {@link needsPeerApproval} leser ALDRI `allowMissing`. Det er hele poenget:
 * «avslutt likevel» hopper over en manglende LEVERING, aldri over en manglende
 * GODKJENNING.
 */

/**
 * Første blokkerende grunn, med alle spillerne den gjelder — eller `null` når
 * rosteret er klart.
 *
 * Grunnen velges i roster-rekkefølge, som webben (den returnerer på første
 * spiller som blokkerer). Forskjellen er at hele klassen samles opp, slik at
 * skjermen kan navngi alle på én gang i stedet for én per forsøk.
 *
 * ⚠️ Minst-én-spiller-porten teller RÅ rader, som `endGameCore:178-180` — også
 * trukne. Et spill der alle er trukket kan altså avsluttes, akkurat som på
 * nettsiden. WD-unntaket er lastbærende for cup-flyten og skal ikke strammes
 * her, ensidig, i appen.
 */
function findBlockingPlayers(
  rows: FinishPlayerRow[],
  gate: { allowMissing: boolean; requirePeerApproval: boolean },
): EndRoundResult | null {
  if (rows.length === 0) return failed('no-players');

  let reason: 'not-all-submitted' | 'not-all-approved' | null = null;
  const missingSubmission: string[] = [];
  const missingApproval: string[] = [];

  for (const player of rows) {
    // Trukket (WD, #386): ute av rangeringen, og blokkerer derfor hverken som
    // manglende levering eller som manglende godkjenning.
    if (player.withdrawn_at !== null) continue;

    if (player.submitted_at === null && !gate.allowMissing) {
      missingSubmission.push(player.user_id);
      reason ??= 'not-all-submitted';
    }

    if (
      gate.requirePeerApproval &&
      needsPeerApproval(player.submitted_at, player.approved_at)
    ) {
      missingApproval.push(player.user_id);
      reason ??= 'not-all-approved';
    }
  }

  if (reason === 'not-all-submitted') {
    return failed('not-all-submitted', undefined, missingSubmission);
  }
  if (reason === 'not-all-approved') {
    return failed('not-all-approved', undefined, missingApproval);
  }
  return null;
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

  for (const playerUserId of userIds) {
    const result = await withdrawPlayer(gameId, playerUserId);
    if (result.ok) continue;
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

  const written = readWriteResult(
    await supabase
      .from('game_side_winners')
      .upsert(rows, { onConflict: 'game_id,category,position' })
      // Uten `.select()` finnes det ikke noe radantall å sjekke (trap 2).
      .select('position'),
    'finishRound.sideWinners',
  );
  if (written.ok) return null;
  return failed(
    written.error === 'rls-denied' ? 'rls-denied' : 'db-winners',
    written.message,
  );
}

/**
 * (c) Flipp `active → finished`, med optimistisk lås.
 *
 * `.eq('status', 'active')` er låsen webben ikke har (den filtrerer bare på
 * `id`). Uten den ville et dobbelttrykk skrevet et nytt `ended_at` oppå det
 * gamle og flyttet tidspunktet runden ble avsluttet.
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

  return flipToFinished(gameId);
}

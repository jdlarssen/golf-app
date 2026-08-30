// Native N3 (#1825): lever, godkjenn og avvis scorekort fra appen.
//
// Ingen server actions speiles. På DB-nivå ER disse tre rene
// `game_players`-oppdateringer, og autorisasjonen ligger i Postgres:
// self-submit-policyen (0002), peer-porten `can_score_for` (0106) med
// kolonne-allowlist-triggeren og forbudet mot å godkjenne seg selv. Appen legger
// de samme delte gatene foran for UX-ens skyld, men gaten er RLS.
//
// **Trap 2 er ufravikelig.** PostgREST svarer `error == null` på en UPDATE som
// traff NULL rader — det er #667/#704 i ren form. Hver skriving kjeder derfor
// `.select('user_id')` og går gjennom den delte `expectAffected`, og 0 rader
// splittes i to med et oppfølgings-SELECT:
//   • raden er alt i måltilstanden → idempotent, `{ ok: true, alreadyDone: true }`
//   • raden er det ikke → RLS/rad-tilgang nektet → `{ ok: false }`
// Stille suksess finnes ikke her.
//
// Notifikasjonene webbens server actions sender (peer-varsel, admin-mail) er
// server-eide og sendes IKKE fra appen. Bokført gap i kontrakten — N7 eier det.
import { NO_REJECTION_REASON } from '../../../../lib/games/rejectionReason';
import {
  expectAffected,
  NoRowsAffectedError,
} from '../../../../lib/supabase/affectedRows';
import { currentDeviceUserId, supabase } from '../supabase';

/** Hvorfor en handling ikke gikk gjennom. Skjermene oversetter til norsk copy. */
export type ActionFailure =
  | 'no-session'
  | 'not-active'
  | 'withdrawn'
  | 'no-rows'
  | 'db';

export type ActionResult =
  | { ok: true; alreadyDone: boolean }
  | { ok: false; reason: ActionFailure; message?: string };

/** Maks lengde på en avvisningsgrunn — samme kutt som webben gjør. */
const MAX_REASON_LENGTH = 500;

const done = (alreadyDone: boolean): ActionResult => ({ ok: true, alreadyDone });

/**
 * Webbens `loadAndAuthorize` nekter alle tre handlingene utenfor et aktivt
 * spill, og det gjør denne porten her.
 *
 * Uten den ville et ferdig spill sett ut som en stille suksess i appen:
 * `game_players`-radene finnes fortsatt, så en approve-UPDATE ville truffet
 * 0 rader (RLS stopper skrivingen) og `resolveZeroRows` ville lest raden som
 * «alt godkjent» → `alreadyDone: true`. Feil svar på feil spørsmål. Porten
 * svarer i stedet det som faktisk er sant: spillet er ikke aktivt.
 *
 * Returnerer `null` når spillet ER aktivt — kalleren fortsetter da som før.
 */
async function refuseUnlessActive(gameId: string): Promise<ActionResult | null> {
  const { data, error } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .maybeSingle<{ status: string }>();
  if (error) return failed('db', error.message);
  if (!data || data.status !== 'active') return failed('not-active');
  return null;
}

const failed = (reason: ActionFailure, message?: string): ActionResult => ({
  ok: false,
  reason,
  ...(message === undefined ? {} : { message }),
});

function asFailure(err: unknown): ActionResult {
  return failed('db', err instanceof Error ? err.message : String(err));
}

/**
 * Lever spillerens eget scorekort.
 *
 * Speiler webbens `submitScorecard`-skriving: sett `submitted_at`, nullstill en
 * eventuell tidligere avvisningsgrunn, og filtrer på `submitted_at IS NULL` så
 * et dobbelttrykk ikke skriver et nytt tidspunkt.
 *
 * Lag-formater der ETT kort dekker hele laget (scramble-familien, alternate
 * shot) leverer webben lagvis med admin-klient. Appen har ingen service-role og
 * gater de formatene bort i GameHome — derfor kun egen rad her.
 */
export async function submitScorecard(gameId: string): Promise<ActionResult> {
  const userId = await currentDeviceUserId();
  if (!userId) return failed('no-session');

  try {
    // Et ferdig spill er lesevisning, et draft har ingen kort å levere.
    const inactive = await refuseUnlessActive(gameId);
    if (inactive) return inactive;

    const { data: me, error: meError } = await supabase
      .from('game_players')
      .select('withdrawn_at, submitted_at')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle<{ withdrawn_at: string | null; submitted_at: string | null }>();
    if (meError) return failed('db', meError.message);
    // #387: en trukket spiller leverer ikke.
    if (me?.withdrawn_at) return failed('withdrawn');
    // Alt levert: hopp over skrivingen helt, som webben (#1453).
    if (me?.submitted_at) return done(true);

    expectAffected(
      await supabase
        .from('game_players')
        .update({
          submitted_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('game_id', gameId)
        .eq('user_id', userId)
        .is('submitted_at', null)
        .select('user_id'),
      'submitScorecard',
    );
    return done(false);
  } catch (err: unknown) {
    if (err instanceof NoRowsAffectedError) {
      // Enten vant et parallelt trykk kappløpet (idempotent), eller RLS nektet.
      // Ett SELECT skiller dem — og bare det første er en suksess.
      return resolveZeroRows(gameId, userId, 'submitted_at', (row) =>
        row.submitted_at !== null,
      );
    }
    return asFailure(err);
  }
}

/**
 * Godkjenn en flight-makkers kort.
 *
 * Filtrene i selve UPDATE-en ER porten mot dobbel-godkjenning:
 * `submitted_at IS NOT NULL AND approved_at IS NULL`. Attestant-regelen
 * (`canApproveScorecardFor`) gates i skjermen; her stoler vi på 0106.
 */
export async function approveScorecard(
  gameId: string,
  playerUserId: string,
): Promise<ActionResult> {
  const userId = await currentDeviceUserId();
  if (!userId) return failed('no-session');

  try {
    // Samme port som ved levering: godkjenning finnes bare i et aktivt spill.
    const inactive = await refuseUnlessActive(gameId);
    if (inactive) return inactive;

    expectAffected(
      await supabase
        .from('game_players')
        .update({
          approved_at: new Date().toISOString(),
          approved_by_user_id: userId,
          // En tidligere avvisning skal ikke bli hengende på et godkjent kort.
          rejection_reason: null,
        })
        .eq('game_id', gameId)
        .eq('user_id', playerUserId)
        .not('submitted_at', 'is', null)
        .is('approved_at', null)
        .select('user_id'),
      'approveScorecard',
    );
    return done(false);
  } catch (err: unknown) {
    if (err instanceof NoRowsAffectedError) {
      // #704: alt godkjent → idempotent. Ikke godkjent og likevel 0 rader →
      // tilgang nektet (eller kortet er ikke levert), altså en ekte feil.
      return resolveZeroRows(gameId, playerUserId, 'approved_at', (row) =>
        row.approved_at !== null,
      );
    }
    return asFailure(err);
  }
}

/**
 * Avvis et levert kort: nullstill leverings- og godkjenningssporet og lagre en
 * grunn.
 *
 * Uten grunn lagres maskinsentinelen fra `lib/games/rejectionReason.ts`, ikke
 * norsk prosa — raden leses i begge locales, og avvist-banneret er gated på at
 * feltet er truthy (`null` ville vært umulig å skille fra «aldri levert»).
 */
export async function rejectScorecard(
  gameId: string,
  playerUserId: string,
  reason?: string,
): Promise<ActionResult> {
  const userId = await currentDeviceUserId();
  if (!userId) return failed('no-session');

  const trimmed = (reason ?? '').trim();
  const storedReason =
    trimmed.length > 0 ? trimmed.slice(0, MAX_REASON_LENGTH) : NO_REJECTION_REASON;

  try {
    const inactive = await refuseUnlessActive(gameId);
    if (inactive) return inactive;

    expectAffected(
      await supabase
        .from('game_players')
        .update({
          submitted_at: null,
          approved_at: null,
          approved_by_user_id: null,
          rejection_reason: storedReason,
        })
        .eq('game_id', gameId)
        .eq('user_id', playerUserId)
        // #1395: bare et levert kort kan avvises — uten filteret ville et
        // dobbelttrykk truffet raden på nytt.
        .not('submitted_at', 'is', null)
        .select('user_id'),
      'rejectScorecard',
    );
    return done(false);
  } catch (err: unknown) {
    if (err instanceof NoRowsAffectedError) {
      return resolveZeroRows(gameId, playerUserId, 'submitted_at', (row) =>
        row.submitted_at === null,
      );
    }
    return asFailure(err);
  }
}

/**
 * Oppfølgings-SELECT-et som skiller de to lovlige grunnene til 0 rader.
 *
 * Er raden allerede i måltilstanden, var skrivingen et idempotent no-op og
 * handlingen har lykkes. Er den det ikke — eller er raden usynlig for oss — ble
 * skrivingen nektet, og det MÅ vises som en feil.
 */
async function resolveZeroRows(
  gameId: string,
  playerUserId: string,
  column: 'submitted_at' | 'approved_at',
  isDone: (row: Record<string, string | null>) => boolean,
): Promise<ActionResult> {
  const { data, error } = await supabase
    .from('game_players')
    .select(column)
    .eq('game_id', gameId)
    .eq('user_id', playerUserId)
    .maybeSingle<Record<string, string | null>>();

  if (error) return failed('db', error.message);
  if (data && isDone(data)) return done(true);
  return failed('no-rows');
}

// Native N3 (#1825), #2215: godkjenn og avvis et scorekort fra appen.
//
// **Hvorfor en rute og ikke en skriving.** Fram til #2215 var dette to rene
// `game_players`-oppdateringer under RLS. Radene ble riktige, men varslene
// webben sender (`scorecard_approved` og `scorecard_rejected`) er `server-only`
// (`notify()`, push, e-post), og webbens cache (`game-${id}`) ble aldri tømt.
// En spiller fikk derfor aldri vite at kortet var avvist, og en makker på
// nettsiden så fortsatt kortet som levert. Nå spør appen
// `POST /api/games/{id}/scorecards/{userId}`, og ruta kaller den samme kjernen
// som webben (`lib/games/reviewScorecardCore.ts`): den vaktede UPDATE-en,
// 0-rads-oppløsningen, varselet og cache-tømmingen.
//
// **Porten er rutas.** Hvem som får godkjenne eller avvise (samme flight,
// arrangøren, admin) og at spillet må være aktivt, avgjør ruta med sin egen
// port før kjernen skriver. Appen speiler ingen av reglene. Knappene vises bare
// der de gjelder, men et svar fra ruta er fasiten.
//
// Leveringen bor i `submitCard.ts` (samme mønster, egen frosset rute).
// Gjenåpningen (#2220) er arrangørens handling og bor i `rosterActions.ts`, men
// går til samme rute med `decision: 'reopen'` via {@link callScorecardRoute}.
//
// **Wire-kontrakten** (ruta og denne fila endres i samme PR):
//   POST /api/games/{id}/scorecards/{userId}
//     kropp { decision: 'approve' | 'reject' | 'reopen', reason?: string }
//     200 { alreadyDone: boolean }
//     400 bad_request · 401 · 403 forbidden · 404 not_found
//     409 not_active · 422 not_pending · 500 review_failed
import { callWebRoute, type WebApiCall } from './webApi';

/** Hvorfor en handling ikke gikk gjennom. Skjermene oversetter til norsk copy. */
export type ActionFailure =
  /** Uten nett stopper kallet før det sendes; ingenting går i sync-køen. */
  | 'offline'
  /** Bygget mangler web-adressen — samme mangel som stopper lenke-knappene. */
  | 'no-web-base-url'
  | 'no-session'
  | 'not-active'
  /** Kortet var ikke til vurdering, eller vi fikk ikke lov. Se {@link failureFor}. */
  | 'no-rows'
  | 'db';

export type ActionResult =
  | { ok: true; alreadyDone: boolean }
  | { ok: false; reason: ActionFailure };

/** Hva ruta skal gjøre med kortet. `reopen` er arrangørens, se `rosterActions.ts`. */
export type ScorecardDecision =
  | { decision: 'approve' }
  | { decision: 'reject'; reason?: string }
  | { decision: 'reopen' };

/**
 * Stien for ett kort. Begge id-ene står i STIEN, aldri i kroppen: spillet og
 * spilleren kortet gjelder er det ruta gater på, og hvem som spør er tokenets
 * sak (`webApi.ts`). `encodeURIComponent` der stien bygges.
 */
function scorecardPath(gameId: string, playerUserId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}/scorecards/${encodeURIComponent(playerUserId)}`;
}

/**
 * Ett kall mot scorekort-ruta. Delt med `reopenScorecard` i `rosterActions.ts`,
 * så stien og kroppens form har ett hjem. Oversettelsen av svaret gjør hver
 * kaller selv: de to filene har hvert sitt feil-vokabular.
 */
export function callScorecardRoute(
  gameId: string,
  playerUserId: string,
  body: ScorecardDecision,
): Promise<WebApiCall> {
  return callWebRoute(scorecardPath(gameId, playerUserId), 'POST', body);
}

/**
 * Svar → kode, oversatt ÉN gang, slik at skjermen aldri leser et statusnummer.
 *
 * `not-active` og `no-rows` leser kroppens `error` der én status kan bære mer
 * enn én ting (som `inviteToGame.ts`). En 409 eller 422 med en kode vi ikke
 * kjenner, blir `db`: en gjettet forklaring er verre enn «noe gikk galt».
 *
 *  - 404 (spillet finnes ikke for oss) og 409 `not_active` sier det samme til
 *    spilleren: her er det ingenting å godkjenne lenger.
 *  - 403 (ikke din flight) og 422 `not_pending` (kortet er ikke levert, eller
 *    alt vurdert på en annen måte) er begge «noen andre rakk det, eller du har
 *    ikke tilgang» — den setningen `no-rows` alltid har hatt.
 *  - `db` får aldri serverens tekst med seg: ruta sender faste koder.
 */
function failureFor(status: number, body: Record<string, unknown>): ActionFailure {
  if (status === 401) return 'no-session';
  if (status === 404) return 'not-active';
  if (status === 409 && body.error === 'not_active') return 'not-active';
  if (status === 403) return 'no-rows';
  if (status === 422 && body.error === 'not_pending') return 'no-rows';
  return 'db';
}

/**
 * Hele svaret som `ActionResult`.
 *
 * **200 ER kvitteringen.** `alreadyDone` er informasjon om hvilken vei det gikk
 * (en makker rakk det først, eller et dobbelttrykk). Mangler feltet, faller det
 * til `false` og svaret er fortsatt suksess, samme resonnement som
 * `alreadySubmitted` i `submitCard.ts`.
 */
async function review(
  gameId: string,
  playerUserId: string,
  body: ScorecardDecision,
): Promise<ActionResult> {
  const call = await callScorecardRoute(gameId, playerUserId, body);
  if (!call.ok) {
    switch (call.reason) {
      case 'offline':
      case 'no-web-base-url':
        return { ok: false, reason: call.reason };
      case 'unauthorized':
        return { ok: false, reason: 'no-session' };
      case 'network':
        return { ok: false, reason: 'db' };
    }
  }
  if (call.status === 200) {
    return { ok: true, alreadyDone: call.body.alreadyDone === true };
  }
  return { ok: false, reason: failureFor(call.status, call.body) };
}

/**
 * Godkjenn et levert kort: en flight-makkers, eller et kort arrangøren
 * godkjenner på vegne av gruppa fra avslutt-skjermen (#1891). Ruta avgjør
 * rollen (`peer` eller `organizer`) og tar den med i varselet til spilleren.
 */
export function approveScorecard(
  gameId: string,
  playerUserId: string,
): Promise<ActionResult> {
  return review(gameId, playerUserId, { decision: 'approve' });
}

/**
 * Avvis et levert kort, med en grunn spilleren får se.
 *
 * Grunnen sendes som den ble skrevet. Trimmingen, kuttet ved 500 tegn og
 * maskinsentinelen for «ingen grunn» (`lib/games/rejectionReason.ts`) er
 * kjernens: én regel, ett hjem (AGENTS trap 4).
 */
export function rejectScorecard(
  gameId: string,
  playerUserId: string,
  reason?: string,
): Promise<ActionResult> {
  return review(
    gameId,
    playerUserId,
    reason === undefined ? { decision: 'reject' } : { decision: 'reject', reason },
  );
}

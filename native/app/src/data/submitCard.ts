// native/app/src/data/submitCard.ts
// Native #1918, #2215, #2200: «Lever» fra scorekortet — solo, lag og flighten.
//
// **Hvorfor en rute og ikke en skriving.** I formatene som kollapser til ett
// lagkort markerer leveringen HELE lagets aktive, uleverte rader, og det krever
// service-role: RLS lar appen bare skrive sin egen `game_players`-rad. Varslene
// som følger med (`peer_approval_request`, `scorecard_submitted`, admin-mailen)
// er `server-only` (`notify()` + Resend) i begge formene. Fram til #2215 skrev
// solo-greina rett i basen og hoppet dermed over varslene. Nå går begge hit.
// Regelen om hva en levering ER (WD-porten, idempotensen, lag-deteksjonen,
// søsken-kaskaden) bor i `lib/games/submitScorecardCore.ts` og speiles ALDRI her
// (AGENTS trap 4). Appen spør ruta og viser svaret.
//
// **Wire-kontrakten er frosset** og står i ruta
// (`app/api/games/[id]/submit-team/route.ts`). Stien heter fortsatt
// `submit-team`, fordi installerte bygg kaller den. Kjernen avgjør selv om
// kortet er et lagkort eller et solo-kort. Denne fila er den andre halvdelen av
// kontrakten; endres den ene, endres den andre i samme PR:
//   POST /api/games/{id}/submit-team   [{ alsoFor: string[] }]  (0–20 uuid-er)
//     200 { submitted: number, alreadySubmitted: boolean, alsoDelivered: number }
//     400 bad_request · 401 unauthorized · 403 forbidden · 404 not_found
//     409 not_active · 422 withdrawn · 500 submit_failed
//
// **Makkerne i samme kall (#2200).** Den som fører for flighten, leverer
// makkernes kort med det samme trykket: id-ene står i `alsoFor`. Lista er et
// ønske som bare kan snevre inn. Serveren spør leveringsregelen selv
// (`lib/games/flightDelivery.ts`) og leverer snittet. Uten makkere sendes ingen
// kropp, slik installerte bygg alltid har gjort.
//
// Vakt-rekkefølgen (nett → adresse → token → kall) og den trygge kropp-lesingen
// er `webApi.ts` sin; her ligger bare oversettelsen fra status til kode og
// avlesningen av det ene feltet skjermen trenger. Ingen bruker-tekst —
// `lib/actionFeedback.ts` eier setningene, slik `endGameCopy.ts` eier dem for
// `endGame.ts`.
import { callWebRoute, type WebApiFailure } from './webApi';

/**
 * Hvorfor kortet ikke ble levert.
 *
 * De fire første er appens egen tilstand ({@link WebApiFailure}); resten er
 * `error`-verdiene ruta svarer med, og beholder derfor wire-stavemåten med
 * understrek. Samme blanding som `ReminderFailure`, og med vilje: en kode som
 * kom fra nettverket skal se ut som det den kom som.
 *
 * `withdrawn` og `not_active` er to koder og ikke to grener av én 409, fordi de
 * betyr helt ulike ting for spilleren — den ene er endelig for hen, den andre
 * for runden. Appen leser KUN statusen, så skillet må stå i wiren.
 */
export type SubmitCardFailure =
  | WebApiFailure
  | 'bad_request'
  | 'forbidden'
  | 'not_found'
  | 'not_active'
  | 'withdrawn'
  | 'submit_failed';

/**
 * Utfallet av ett trykk.
 *
 * `alreadySubmitted` er sant når kortet alt sto som levert — UPDATE-en traff 0
 * rader, og det ER det lovlige utfallet av et dobbelttrykk, eller av at
 * makkeren rakk det først. Feltet styrer ordlyd, ikke suksess: kortet er levert
 * uansett hvilken vei det gikk.
 */
export type SubmitCardResult =
  | { ok: true; alreadySubmitted: boolean }
  | { ok: false; reason: SubmitCardFailure };

/**
 * Stien for ett spill. `encodeURIComponent` selv om id-en er en uuid fra vår
 * egen bundle: en sti bygget av data skal kodes der den bygges, ikke der noen
 * senere antar at den var trygg.
 */
function submitCardPath(gameId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}/submit-team`;
}

/**
 * Status → kode, oversatt ÉN gang. Alt over 200 ender her, slik at skjermen
 * aldri leser et statusnummer.
 *
 * Kroppens `error`-felt leses bevisst ikke: ruta sender de samme kodene som
 * statusene betyr, og å stole på begge ville gitt to sannheter om samme svar.
 */
function failureForStatus(status: number): SubmitCardFailure {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'not_active';
  if (status === 422) return 'withdrawn';
  return 'submit_failed';
}

/**
 * Lever kortet: spillerens eget, eller hele lagets i et lagformat — og kortene
 * til makkerne i `alsoFor`, dem spilleren har ført for (#2200).
 *
 * **200 ER kvitteringen.** Varslene på serversiden er best-effort
 * (`Promise.allSettled`), så ruta svarer 200 selv om en mail ikke gikk — og
 * appen skal si det samme. `alreadySubmitted` er informasjon om HVILKEN vei det
 * gikk: mangler feltet, faller det til `false` og svaret er fortsatt suksess.
 * Samme resonnement som `reminded` i purringen — å kalle en fullført handling
 * mislykket fordi et informasjonsfelt manglet, forteller spilleren det motsatte
 * av det som skjedde.
 *
 * Et lagkort låses for alle på laget, ikke bare for den som trykket. Advarselen
 * om det bor på skjermen, foran trykket; her er det for sent å spørre.
 */
export async function submitCard(
  gameId: string,
  alsoFor: readonly string[] = [],
): Promise<SubmitCardResult> {
  const call = await callWebRoute(
    submitCardPath(gameId),
    'POST',
    alsoFor.length > 0 ? { alsoFor: [...alsoFor] } : undefined,
  );
  if (!call.ok) return call;

  if (call.status === 200) {
    return { ok: true, alreadySubmitted: call.body.alreadySubmitted === true };
  }

  return { ok: false, reason: failureForStatus(call.status) };
}

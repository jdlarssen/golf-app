// native/app/src/data/withdrawSelf.ts
// Native #1917: «Trekk meg» og «Angre trekk» fra appen.
//
// **Hvorfor en rute og ikke en skriving.** `guard_game_players_self_update`
// vakt (c) (migrasjon 0147, uendret i 0168) nekter en ikke-admin å røre
// `withdrawn_at` på sin EGEN rad. Appen skriver alltid under RLS, så en direkte
// skriving ville blitt avvist med 42501 hver eneste gang — og den vakta skal
// stå. Regelen om hva frafallet gjør (mykt trekk vs. sletting, cup-sperren,
// varselet til kapteinen) bor i `lib/games/withdrawSelf.ts`; appen speiler
// ingenting av den (AGENTS trap 4).
//
// Fram til nå sto det en setning der handlingen skulle vært: «Du kan ikke trekke
// deg selv herfra. Det ordner du på nettsiden.» Nå finnes handlingen.
//
// **Wire-kontrakten er frosset** og står i ruta
// (`app/api/games/[id]/withdraw-self/route.ts`). Denne fila er den andre
// halvdelen av den; endres den ene, endres den andre i samme PR:
//   POST   200 { ok: true, kept: boolean }
//   DELETE 200 { ok: true, kept: true }
//   401 unauthorized · 403 not_registered · 404 not_found · 409 game_locked
//   500 withdraw_failed
//
// **Appen leser ikke `kept`.** Kallstedene henter bundelen på nytt etterpå, og
// den er fasiten for hva skjermen skal vise. Et felt appen tolket selv ville
// vært en andre sannhet om samme tilstand.
//
// Vakt-rekkefølgen (nett → adresse → token → kall) og den trygge kropp-lesingen
// er `webApi.ts` sin; her ligger bare oversettelsen fra status til kode. Ingen
// bruker-tekst — `rosterCopy.ts` eier setningene.
import { callWebRoute, type WebApiFailure } from './webApi';

/**
 * Hvorfor frafallet ikke gikk gjennom.
 *
 * De fire første er appens egen tilstand ({@link WebApiFailure}); resten er
 * `error`-verdiene ruta svarer med, og beholder derfor wire-stavemåten med
 * understrek — samme blanding som `ReminderFailure`.
 *
 * `withdraw_failed` er catch-all for alt ruta ikke navnga, også en 500.
 */
export type SelfWithdrawFailure =
  | WebApiFailure
  | 'not_registered'
  | 'not_found'
  | 'game_locked'
  | 'withdraw_failed';

export type SelfWithdrawResult =
  | { ok: true }
  | { ok: false; reason: SelfWithdrawFailure };

/**
 * Stien for ett spill. `encodeURIComponent` selv om id-en er en uuid fra vår
 * egen bundle: en sti bygget av data skal kodes der den bygges, ikke der noen
 * senere antar at den var trygg.
 */
function withdrawSelfPath(gameId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}/withdraw-self`;
}

/**
 * Status → kode, oversatt ÉN gang. Alt over 200 ender her, slik at skjermen
 * aldri leser et statusnummer.
 *
 * Kroppens `error`-felt leses bevisst ikke: ruta sender de samme kodene som
 * statusene betyr, og å stole på begge ville gitt to sannheter om samme svar.
 */
function failureForStatus(status: number): SelfWithdrawFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'not_registered';
  if (status === 404) return 'not_found';
  if (status === 409) return 'game_locked';
  return 'withdraw_failed';
}

/** Trekk deg selv fra runden. */
export async function withdrawSelf(gameId: string): Promise<SelfWithdrawResult> {
  const call = await callWebRoute(withdrawSelfPath(gameId), 'POST');
  if (!call.ok) return call;

  if (call.status === 200) return { ok: true };

  return { ok: false, reason: failureForStatus(call.status) };
}

/** Angre frafallet. Samme sti, motsatt verb. */
export async function undoSelfWithdraw(
  gameId: string,
): Promise<SelfWithdrawResult> {
  const call = await callWebRoute(withdrawSelfPath(gameId), 'DELETE');
  if (!call.ok) return call;

  if (call.status === 200) return { ok: true };

  return { ok: false, reason: failureForStatus(call.status) };
}

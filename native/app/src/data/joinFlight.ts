// native/app/src/data/joinFlight.ts
// #2750: spilleren velger eller bytter flight selv fra venterommet.
//
// **Hvorfor en rute og ikke en skriving.** `guard_game_players_self_update`
// (0168) nekter en spiller å endre `flight_number` på sin egen rad, unntatt for
// den som opprettet spillet. Appen skriver under RLS, så en direkte skriving
// ville blitt avvist for alle andre, og den vakta skal stå. Regelen om hvem som
// kan flytte, hvilke flighter som finnes og tellingen etter skrivingen bor i
// `lib/games/joinFlight.ts`. Appen speiler ingenting av den (AGENTS trap 4), og
// skjuler bare raden der velgeren ikke gjelder (`lib/flightPicker.ts`).
//
// **Går aldri i sync-køen.** En flight er en plass som kan være tatt når nettet
// er tilbake. Uten nett svarer `webApi.ts` med `offline`, og spilleren prøver
// igjen selv.
//
// **Wire-kontrakten er frosset** og står i ruta
// (`app/api/games/[id]/flight/route.ts`). Denne fila er den andre halvdelen av
// den; endres den ene, endres den andre i samme PR:
//   POST { flightNumber: number }
//   200 { ok: true }
//   400 bad_request · 401 unauthorized · 403 not_member
//   409 game_not_scheduled | flight_full | flight_bound_to_team | bad_flight
//   500 flight_failed
//
// Ingen bruker-tekst her: `lib/flightPicker.ts` eier setningene.
import { callWebRoute, type WebApiFailure } from './webApi';

/**
 * Hvorfor valget ikke gikk gjennom.
 *
 * De fire første er appens egen tilstand ({@link WebApiFailure}); resten er
 * `error`-verdiene ruta svarer med, med wire-stavemåten. `flight_failed` er
 * catch-all for alt ruta ikke navnga, også en 400 og en 500.
 */
export type JoinFlightFailure =
  | WebApiFailure
  | 'not_member'
  | 'game_not_scheduled'
  | 'flight_full'
  | 'flight_bound_to_team'
  | 'bad_flight'
  | 'flight_failed';

export type JoinFlightResult = { ok: true } | { ok: false; reason: JoinFlightFailure };

/** Statusen er klassen. Bare 409 bærer flere koder, og da leses `error`. */
function failureForStatus(status: number, body: Record<string, unknown>): JoinFlightFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'not_member';
  if (status === 409) {
    if (body.error === 'game_not_scheduled') return 'game_not_scheduled';
    if (body.error === 'flight_full') return 'flight_full';
    if (body.error === 'flight_bound_to_team') return 'flight_bound_to_team';
    if (body.error === 'bad_flight') return 'bad_flight';
  }
  return 'flight_failed';
}

/** Velg eller bytt flight i dette spillet. Spilleren er den tokenet sier. */
export async function joinFlight(gameId: string, flightNumber: number): Promise<JoinFlightResult> {
  const call = await callWebRoute(`/api/games/${encodeURIComponent(gameId)}/flight`, 'POST', {
    flightNumber,
  });
  if (!call.ok) return call;

  if (call.status === 200) return { ok: true };

  return { ok: false, reason: failureForStatus(call.status, call.body) };
}

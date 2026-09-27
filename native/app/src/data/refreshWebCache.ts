// native/app/src/data/refreshWebCache.ts
// #2215: nettsiden viser det appen nettopp skrev, med én gang.
//
// **Hvorfor det trengs.** Webben leser status, roster, innleveringer og wolf-
// og BBB-valgene fra spillets cache (`game-${id}`, `lib/games/getGameWithPlayers.ts`),
// som lever i opptil 15 minutter. Webbens egne skrivinger tømmer den. Appens
// skrivinger går rett i basen under RLS, og uten dette sto en makker på nettsiden
// og så gammel status: i venterommet etter start, eller «fant ikke spillet» etter
// at arrangøren la hen til.
//
// Cache-tømmingen bor på serveren (`expireGameCache`, Next-only), så appen spør
// `POST /api/games/{id}/refresh`. Ruta sender ingen varsler. Handlingene som
// varsler (levering, godkjenning og avvisning, start, publisering, legg til og
// gjenåpning) har sine egne ruter, og de tømmer cachen selv. Etter dem kalles
// ikke denne.
//
// **Best-effort, med vilje.** Skrivingen har alt skjedd når denne kalles, og et
// svar herfra kan ikke gjøre den ugjort. Derfor ingen returverdi, ingen kast og
// ingen feilmelding til skjermen: en feil logges, og cachen går ut av seg selv
// innen 15 minutter. Å melde «noe gikk galt» for en skriving som lyktes, ville
// fått arrangøren til å trykke igjen.
import { bestEffortCall } from './bestEffortCall';

/**
 * Stien for ett spill. `encodeURIComponent` selv om id-en er en uuid fra vår
 * egen bundle: en sti bygget av data skal kodes der den bygges.
 */
function refreshPath(gameId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}/refresh`;
}

/**
 * Tøm web-cachen for spillet etter en vellykket skriving fra appen.
 *
 * Kalles bare etter `ok: true` (også `alreadyDone`: raden står i måltilstanden,
 * og cachen kan fortsatt vise den gamle). Aldri etter en feil: da er ingenting
 * endret, og et kall ville bare vært en ekstra rundtur.
 *
 * Aldri kast, og aldri mer enn `BEST_EFFORT_WAIT_MS` venting: det eier
 * `bestEffortCall`, som invitasjonsvarslene etter publisering deler.
 */
export async function refreshWebCache(gameId: string): Promise<void> {
  await bestEffortCall(refreshPath(gameId), '[refreshWebCache]', gameId);
}

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
import { callWebRoute } from './webApi';

/**
 * Hvor lenge skjermen venter på svaret. Kallet awaites, så en nettside som
 * henger ville ellers holdt wolf-valget eller roster-knappen fast lenge etter at
 * skrivingen er lagret. Kallet får gå ferdig i bakgrunnen; vi slutter bare å
 * vente, og cachen går uansett ut av seg selv innen 15 minutter.
 */
export const REFRESH_TIMEOUT_MS = 5_000;

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
 * `callWebRoute` fanger alt selv. `try` står likevel her, fordi løftet til
 * kallerne er at denne aldri kaster: et kast etter en lagret skriving ville
 * blitt vist som en feil på en handling som lyktes.
 */
export async function refreshWebCache(gameId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), REFRESH_TIMEOUT_MS);
  });
  try {
    const call = await Promise.race([
      callWebRoute(refreshPath(gameId), 'POST'),
      timedOut,
    ]);
    if (call === 'timeout') {
      console.error('[refreshWebCache] ga opp etter', REFRESH_TIMEOUT_MS, 'ms', gameId);
      return;
    }
    if (call.ok && call.status === 200) return;
    console.error(
      '[refreshWebCache] fikk ikke tømt web-cachen',
      gameId,
      call.ok ? call.status : call.reason,
    );
  } catch (err: unknown) {
    console.error('[refreshWebCache] kastet', gameId, err);
  } finally {
    clearTimeout(timer);
  }
}

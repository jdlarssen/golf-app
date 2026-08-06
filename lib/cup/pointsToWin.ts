/**
 * Poengmålet for en cup — hvor mange poeng et lag trenger for å vinne.
 *
 * Regelen er halvparten av de tilgjengelige poengene + 0,5: det laveste
 * antallet motstanderen ikke kan møte, selv om de tar alt som er igjen.
 * Én match = ett poeng, delt match = et halvt til hver.
 *
 * Målet utledes ved cup-start (#1142), ikke ved opprettelse: matchene
 * genereres i /generer mens cupen er draft, så antallet finnes rett og slett
 * ikke før start. Fram til da bærer `tournaments.points_to_win` NULL.
 *
 * Egen modul fordi `lib/cup/actions.ts` er `'use server'` — der er kun async
 * exports lov, og denne skal kunne testes direkte.
 */
export function derivePointsToWin(matchCount: number): number {
  return matchCount / 2 + 0.5;
}

/** Dagens 1/½-default (#1441, D8) — samme verdier som computeCupLeaderboard
 * faller tilbake til når en cup mangler win_points/tie_points. */
const DEFAULT_WIN_POINTS = 1;
const DEFAULT_TIE_POINTS = 0.5;

/**
 * Vektbar variant av `derivePointsToWin` (#1441, D8). Arrangøren av splittet
 * cup-dag setter egne poengvekter (denne dagen: seier 5, delt 2 til hvert
 * lag) — med den vektingen betaler en delt match MINDRE enn en seier, så
 * «halvparten av totalen» slutter å bety «det motstanderen ikke kan nå» (selve
 * poenget med formelen i `derivePointsToWin`). Løsningen er å ikke sette et
 * mål i det hele tatt: `points_to_win = NULL` skjuler «først til X»-UI-en, og
 * vinneren avgjøres ved `finishTournament` (som allerede takler NULL, #1142).
 *
 * Når vektene er nøyaktig standard (1 for seier, 0,5 for delt) delegeres til
 * `derivePointsToWin` uendret — eksisterende cuper oppfører seg identisk.
 *
 * Ren funksjon; F3b kaller denne fra `startTournament` (ikke denne fasen).
 */
export function derivePointsToWinWeighted(
  matchCount: number,
  winPoints: number,
  tiePoints: number,
): number | null {
  if (winPoints !== DEFAULT_WIN_POINTS || tiePoints !== DEFAULT_TIE_POINTS) return null;
  return derivePointsToWin(matchCount);
}

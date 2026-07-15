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

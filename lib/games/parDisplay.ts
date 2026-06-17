import type { ScoringGender } from '@/lib/scoring/modes/types';

/**
 * Tre-grenede par-verdier for et hull, slik de er lagret i
 * `course_holes.par_<gender>`-kolonnene. Speilet av `ScoringHole.parByGender`.
 * #240.
 */
export type HoleParByGender = {
  mens: number;
  ladies: number;
  juniors: number;
};

/**
 * Sant når hullet har minst ett kjønns-par som avviker fra de andre.
 * Brukes til å avgjøre om avvik-indikator (asterisk) skal vises på par-
 * displays i scorekort, hull-page og leaderboard. #240.
 *
 * Eksempler:
 *   { mens: 4, ladies: 4, juniors: 4 } → false
 *   { mens: 4, ladies: 5, juniors: 4 } → true   (dame-par avviker)
 *   { mens: 4, ladies: 4, juniors: 5 } → true   (junior-par avviker)
 *   { mens: 3, ladies: 4, juniors: 5 } → true   (alle avviker)
 */
export function hasParDifference(par: HoleParByGender): boolean {
  return (
    par.mens !== par.ladies ||
    par.mens !== par.juniors ||
    par.ladies !== par.juniors
  );
}

/**
 * Pre-translated label strings for the three scoring genders. When passed to
 * `formatOtherGendersPar`, the caller controls how each gender is labelled so
 * the output is locale-aware. Each string should already include the par value
 * (e.g. `t('parGenderMens', { par: 4 })` → `"Men: 4"`). #681.
 */
export type ParGenderLabels = {
  mens: string;
  ladies: string;
  juniors: string;
};

/**
 * Forklaring av andre kjønns par-verdier. Brukes som tooltip/aria-label på
 * avvik-indikatoren. Spillerens egen kjønn ekskluderes — vi viser bare hva
 * MEDSPILLERE av andre kjønn ser. #240.
 *
 * Eksempel: playerGender='mens', par={mens:4, ladies:5, juniors:4}
 *   → "Damer: 5, Junior: 4" (norsk) / "Ladies: 5, Juniors: 4" (engelsk)
 *
 * Når `playerGender` er undefined (leaderboard-kontekst uten seer-kjønn),
 * vises alle tre par-verdier slik at leseren selv kan tolke hva som avviker.
 *
 * @param labels - Valgfrie forhåndsoversatte kjønnsetiketter. Når oppgitt brukes
 *   disse istedenfor de hardkodede norske fallback-verdiene. Kall-steder som har
 *   tilgang til `t()` fra next-intl bør alltid sende inn oversatte etiketter. #681.
 */
export function formatOtherGendersPar(
  par: HoleParByGender,
  playerGender: ScoringGender | undefined,
  labels?: ParGenderLabels,
): string {
  const parts: string[] = [];
  if (playerGender !== 'mens')
    parts.push(labels ? labels.mens : `Herrer: ${par.mens}`);
  if (playerGender !== 'ladies')
    parts.push(labels ? labels.ladies : `Damer: ${par.ladies}`);
  if (playerGender !== 'juniors')
    parts.push(labels ? labels.juniors : `Junior: ${par.juniors}`);
  return parts.join(', ');
}

/**
 * Spillerens egen par fra `HoleParByGender`. Tynn wrapper rundt
 * `parByGender[gender]` — eksisterer slik at UI-laget ikke trenger å
 * vite om enum-mapping. Default `'mens'` når `gender` er undefined,
 * samme fallback som `lib/scoring/modes/parResolver.ts`. #240.
 */
export function parForPlayer(
  par: HoleParByGender,
  playerGender: ScoringGender | undefined,
): number {
  return par[playerGender ?? 'mens'];
}

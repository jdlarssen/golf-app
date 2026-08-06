/**
 * Ren visnings-/redigerings-logikk for splittet-cup-dag-bunten (#1441, F3c).
 *
 * `generateSplitDayPlan` (cupPairing.ts) produserer en flat liste av
 * `PlannedBundleMatch[]` (4 per flight: greensome, best_ball, 2× singles).
 * Oppstillings-editoren i wizarden trenger dem gruppert per flight for
 * visning, og en måte å bytte hvem-møter-hvem i singles-parene UTEN å røre
 * greensome/best-ball-paret eller hente inn spillere fra andre flights (de
 * fire spillerne i en flight er et fysisk krav — samme fire spiller hele
 * runden, D4).
 */

import type { PlannedBundleMatch } from './cupPairing';

export type SplitDayFlight = {
  flightIndex: number;
  greensome: PlannedBundleMatch;
  bestBall: PlannedBundleMatch;
  /** Alltid nøyaktig to — rank1-mot-rank1 og rank2-mot-rank2 (default) eller
   * byttet via `swapFlightSinglesPairing`. */
  singles: [PlannedBundleMatch, PlannedBundleMatch];
};

/**
 * Grupperer bunt-matchene per flight, sortert på `flightIndex`. En flight med
 * mangler (ikke nøyaktig én greensome + én best_ball + to singles) hoppes
 * over — kan ikke skje med output fra `generateSplitDayPlan`, men editoren
 * skal ikke krasje på en uventet payload.
 */
export function groupBundleMatchesByFlight(
  matches: PlannedBundleMatch[],
): SplitDayFlight[] {
  const byFlight = new Map<number, PlannedBundleMatch[]>();
  for (const m of matches) {
    const arr = byFlight.get(m.flightIndex) ?? [];
    arr.push(m);
    byFlight.set(m.flightIndex, arr);
  }

  const flights: SplitDayFlight[] = [];
  const flightIndexes = Array.from(byFlight.keys()).sort((a, b) => a - b);
  for (const flightIndex of flightIndexes) {
    const ms = byFlight.get(flightIndex) ?? [];
    const greensome = ms.find((m) => m.format === 'greensome_matchplay');
    const bestBall = ms.find((m) => m.format === 'best_ball');
    const singles = ms.filter((m) => m.format === 'singles_matchplay');
    if (!greensome || !bestBall || singles.length !== 2) continue;
    flights.push({ flightIndex, greensome, bestBall, singles: [singles[0], singles[1]] });
  }
  return flights;
}

/**
 * Bytter singles-parene innad i én flight: fra rank1-vs-rank1/rank2-vs-rank2
 * til rank1-vs-rank2/rank2-vs-rank1 (og tilbake — kallet er sin egen invers).
 * Bytter KUN `side2` mellom de to singles-matchene i flighten — `side1`
 * (rank-identiteten hver singles-match er navngitt etter) og alle andre
 * flights/matcher (greensome, best_ball) er urørt. Med bare fire spillere i
 * flighten finnes det nøyaktig to gyldige 1v1-paringer, så et bytte trenger
 * ingen fri spiller-velger — én knapp per flight er nok.
 *
 * No-op (returnerer `matches` uendret) hvis flighten ikke har nøyaktig to
 * singles-matcher (defensivt — kan ikke skje med gyldig bunt-output).
 */
export function swapFlightSinglesPairing(
  matches: PlannedBundleMatch[],
  flightIndex: number,
): PlannedBundleMatch[] {
  const singlesInFlight = matches.filter(
    (m) => m.flightIndex === flightIndex && m.format === 'singles_matchplay',
  );
  if (singlesInFlight.length !== 2) return matches;
  const [a, b] = singlesInFlight;
  return matches.map((m) => {
    if (m.id === a.id) return { ...m, side2: b.side2 };
    if (m.id === b.id) return { ...m, side2: a.side2 };
    return m;
  });
}

/** Antall flights et splittet-cup-dag-oppsett gir for gitte lagstørrelser —
 * speiler klampingen i `generateSplitDayPlan` (2 spillere per side per
 * flight; overskytende spillere blir bye). */
export function splitDayFlightCount(team1Size: number, team2Size: number): number {
  return Math.min(Math.floor(team1Size / 2), Math.floor(team2Size / 2));
}

/** Totalt antall cup-matcher (4 per flight: greensome + best_ball + 2×
 * singles) for gitte lagstørrelser. */
export function splitDayTotalMatches(team1Size: number, team2Size: number): number {
  return splitDayFlightCount(team1Size, team2Size) * 4;
}

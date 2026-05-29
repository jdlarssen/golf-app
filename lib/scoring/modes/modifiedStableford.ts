// Modified stableford (issue #281) — pro-stil poeng-tabell med negative poeng.
//
// Som standard Stableford, men poeng-tabellen straffer dårlige hull og belønner
// gode kraftigere (slik PGA Tour bruker den, f.eks. Barracuda Championship).
// Premierer risiko foran par-jaging. Handicap brukes identisk med standard
// Stableford (netto-score mot par), og solo-/par-varianten følger samme
// MAX-regel.
//
// Hele solo-/team-motoren gjenbrukes fra `stableford.ts` via
// `computeWithPointsTable` — eneste forskjellen er poeng-tabellen og
// contributor-regelen. Resultatet beholder `kind: 'stableford'` slik at
// leaderboard-/podium-visningen rendrer uendret.

import { computeWithPointsTable } from './stableford';
import type { StablefordPointsInput, ContributorPredicate } from './stableford';
import type { ScoringContext, StablefordResult } from './types';

/**
 * Konverterer ett hull-resultat til modified-stableford-poeng:
 *   diff (netto − par)      poeng
 *   ≤ −3 (albatross+)         8
 *   −2 (eagle)                5
 *   −1 (birdie)               2
 *    0 (par)                  0
 *   +1 (bogey)               −1
 *   ≥ +2 (dobbeltbogey+)     −3
 *
 * Albatross (−3) er toppen i den offisielle tabellen; alt bedre (condor, hole-
 * in-one på par 5) caps på 8 — samme som albatross. Null netStrokes (hull ikke
 * spilt) gir 0, samme som standard Stableford: hullet teller ikke. Merk at par
 * og ikke-spilt begge gir 0; totaler er kun sammenlignbare når like mange hull
 * er spilt.
 */
export function computeModifiedStablefordPoints(input: StablefordPointsInput): number {
  if (input.netStrokes === null) return 0;
  const diff = input.netStrokes - input.par;
  if (diff <= -3) return 8; // albatross eller bedre
  if (diff === -2) return 5; // eagle
  if (diff === -1) return 2; // birdie
  if (diff === 0) return 0; // par
  if (diff === 1) return -1; // bogey
  return -3; // dobbeltbogey eller verre
}

/**
 * Contributor-regel for modified stableford: et lag-hull har en bidragsyter så
 * snart minst én partner faktisk spilte det. Skiller seg fra standard
 * Stableford (`teamPoints > 0`) fordi par gir 0 poeng og lag-MAX kan være
 * negativ — et 0-poengs par er fortsatt et ekte resultat, ikke en blank.
 */
const modifiedContributorPredicate: ContributorPredicate = (_teamPoints, players) =>
  players.some((pc) => pc.gross !== null);

/**
 * Beregner modified-stableford-leaderboard. Solo (`team_size: 1`) eller par
 * (`team_size: 2`, 4BBB-MAX). Returnerer en `StablefordResult` (`kind:
 * 'stableford'`) — view-laget gjenbrukes uendret.
 */
export function compute(ctx: ScoringContext): StablefordResult {
  return computeWithPointsTable(ctx, computeModifiedStablefordPoints, modifiedContributorPredicate);
}

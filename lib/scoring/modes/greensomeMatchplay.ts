// Greensome matchplay-scoring (issue #289, alternate-shot-familien).
//
// 2v2 velg-beste-tee + alternate: begge slår ut, paret velger det beste tee
// shot-et og spiller alternate shot derfra. For SCORING er resultatet på hvert
// hull én lag-gross-score per side — mekanisk identisk med Foursomes matchplay.
// Velg/alternate er on-course-veiledning, ikke noe appen sporer slag-for-slag.
//
// Eneste forskjell fra Foursomes er lag-handicapet: Greensome bruker 60/40-
// blandingen (60 % av laveste + 40 % av høyeste, avrundet) i stedet for summen.
// Vi delegerer derfor til den delte `computeFoursomesCore` med
// `greensomeTeamHandicap`-strategien (samme mønster som chapmanMatchplay #290 og
// gruesomeMatchplay) og returnerer `kind: 'foursomes_matchplay'` → all
// leaderboard-/podium-/scorekort-/mail-visning gjenbrukes uendret (Ambrose-
// mønsteret, #284). WHS-default allowance = 100 % for greensome.

import { computeFoursomesCore } from './foursomesMatchplay';
import type { ScoringContext, FoursomesMatchplayResult } from './types';

/**
 * Greensome lag-handicap: 60 % av laveste + 40 % av høyeste course-handicap,
 * avrundet (WHS-greensome-konvensjon). Skiller seg fra foursomes (sum). Matcher
 * `SideHandicapFn`-signaturen og er order-uavhengig (min/max).
 */
export function greensomeTeamHandicap(chA: number, chB: number): number {
  const low = Math.min(chA, chB);
  const high = Math.max(chA, chB);
  return Math.round(0.6 * low + 0.4 * high);
}

/**
 * Trekker `allowance_pct` ut av mode_config. Defensivt fallback til 100 hvis
 * feltet mangler. Validatoren håndhever range 0..100 ved publish.
 */
function readAllowancePct(ctx: ScoringContext): number {
  const config = ctx.game.mode_config;
  if (config.kind !== 'greensome_matchplay') return 100;
  const raw = (config as { allowance_pct?: number }).allowance_pct;
  return typeof raw === 'number' ? raw : 100;
}

/**
 * Beregner Greensome-matchplay-leaderboard. Delegerer til den delte foursomes-
 * kjernen med 60/40-side-handicap. Returnerer `kind: 'foursomes_matchplay'`.
 */
export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  return computeFoursomesCore(ctx, readAllowancePct(ctx), greensomeTeamHandicap);
}

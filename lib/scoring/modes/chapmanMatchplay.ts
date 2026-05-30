// Chapman matchplay-scoring (issue #290) — 2v2 alternate shot med 60/40-handicap.
//
// Chapman (også kjent som Pinehurst): begge partnere slår ut, bytter ball
// (hver slår partnerens ball som andreslag), velger beste ball, og spiller
// annenhver derfra. For SCORING er resultatet på hvert hull én lag-gross-score
// per side — mekanisk identisk med Foursomes matchplay. Bytt/velg/alternate er
// on-course-veiledning, ikke noe appen sporer slag-for-slag.
//
// Eneste forskjell fra Foursomes er lag-handicapet: Chapman bruker WHS-allowance
// 60 % av laveste + 40 % av høyeste (vs Foursomes' sum). Vi delegerer derfor til
// den delte `computeFoursomesCore` med `chapmanSideHandicap`-strategien og
// returnerer `kind: 'foursomes_matchplay'` → all leaderboard-/podium-/mail-/
// scorekort-visning gjenbrukes uendret (Ambrose-mønsteret, #284). Format-navnet
// «Chapman» kommer fra `game_mode` → MODE_LABELS, ikke fra result-kind.
//
// Allowance: side-HCP = round(0.6×lav + 0.4×høy); høylaget får
// round(|side1Hcp − side2Hcp| × allowance_pct/100) strokes via SI. Default
// allowance_pct = 100 (full diff etter 60/40-reduksjonen — WHS matchplay-
// standard). 0 = brutto matchplay. Justerbar 0..100 av admin.

import { chapmanSideHandicap, computeFoursomesCore } from './foursomesMatchplay';
import type { ScoringContext, FoursomesMatchplayResult } from './types';

/**
 * Beregner Chapman-matchplay-leaderboard. Leser `allowance_pct` fra
 * `mode_config` (defensiv fallback til 100 hvis feil kind — draft-state kan ha
 * en buggy config) og delegerer til den delte foursomes-kjernen med
 * 60/40-side-handicap. Returnerer `kind: 'foursomes_matchplay'`.
 */
export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  const allowancePct =
    ctx.game.mode_config.kind === 'chapman_matchplay'
      ? ctx.game.mode_config.allowance_pct
      : 100;
  return computeFoursomesCore(ctx, allowancePct, chapmanSideHandicap);
}

// Gruesome matchplay-scoring (issue #291) — 2v2 alternate shot der motstanderlaget
// velger hvilken av de to tee-ballene paret må spille videre med.
//
// Gruesome (også kjent som «Pinehurst Gruesome»): begge partnere slår ut på hvert
// hull. Motstanderlaget velger hvilken av de to tee-ballene paret MÅ spille
// videre med — typisk den dårligste. Partneren til den som eier den valgte ballen
// slår neste slag, og paret alternerer derfra. Lavest par-score vinner hullet.
//
// For SCORING er resultatet på hvert hull én lag-gross-score per side —
// mekanisk identisk med Foursomes matchplay. «Motstander velger tee-ballen»
// er en on-course/honor-system-regel med null scoring-impact: tallet appen
// lagrer er det samme uansett hvilken tee-ball motstanderen plukker.
// → Beslutning (bekreftet i kontrakt-diskusjon, #291): appen sporer ikke
//   valget. Regelen forklares i format-infoen (formatGuide.content-katalogen).
//
// Eneste forskjell fra Foursomes er lag-handicapet: Gruesome bruker den
// samme WHS-handicapen som Foursomes (sum av begge partneres CH) — merk
// at motstanderens tee-valg IKKE endrer dette. Vi delegerer til den delte
// `computeFoursomesCore` med `combinedSideHandicap`-strategien og returnerer
// `kind: 'foursomes_matchplay'` → all leaderboard-/podium-/mail-/scorekort-
// visning gjenbrukes uendret (Ambrose-mønsteret, #284). Format-navnet
// «Gruesome» kommer fra `game_mode` → MODE_LABELS, ikke fra result-kind.
//
// Allowance: highSideExtraHCP = round(|side1SumCH − side2SumCH| × pct/100);
// lavlaget får 0 strokes, høylaget får extra via SI. Default pct = 50 (WHS
// foursomes-standard — lik foursomes siden handicap-formelen er identisk).
// Justerbar 0..100 av admin.

import { combinedSideHandicap, computeFoursomesCore } from './foursomesMatchplay';
import type { ScoringContext, FoursomesMatchplayResult } from './types';

/**
 * Beregner Gruesome-matchplay-leaderboard. Leser `allowance_pct` fra
 * `mode_config` (defensiv fallback til 50 hvis feil kind — foursomes-familiens
 * WHS-default speiles her) og delegerer til den delte foursomes-kjernen med
 * sum-side-handicap (combinedSideHandicap). Returnerer `kind: 'foursomes_matchplay'`.
 */
export function compute(ctx: ScoringContext): FoursomesMatchplayResult {
  const allowancePct =
    ctx.game.mode_config.kind === 'gruesome_matchplay'
      ? ctx.game.mode_config.allowance_pct
      : 50; // defensiv fallback: foursomes-familiens WHS-standard
  return computeFoursomesCore(ctx, allowancePct, combinedSideHandicap);
}

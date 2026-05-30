// Ambrose-scoring (issue #284) — net scramble med team-handicap.
//
// Mekanisk identisk med Texas scramble: lagene velger beste slag og slår
// derfra — én ball per lag, én score per lag per hull lagret på lag-kapteinen
// (lex-min userId). Eneste forskjell er DEFAULT-lag-handicapet: standard
// Ambrose-formel `combinedCourseHandicap ÷ (2 × team_size)`:
//   - 2-spiller-lag: ÷4 = 25 %
//   - 4-spiller-lag: ÷8 = 12,5 %
// (Bekreftet mot flere golf-kilder; issue-teksten oppga divisorene feil.)
//
// `team_handicap_pct` er justerbar (0–100) som i Texas — Ambrose er en klubb-
// konvensjon, ikke strengt regelbundet, så admin kan overstyre. Default-
// prosenten settes av form/validator-laget via `ambroseDefaultPct`.
//
// Scoring delegeres til den delte `computeScramble`-kjernen i `texasScramble.ts`
// og returnerer `kind: 'texas_scramble'`, slik at leaderboard, podium, mail og
// hull-page-rendering gjenbrukes uendret (samme mønster som modified_stableford
// → stableford). Format-navnet «Ambrose» kommer fra `game_mode` → MODE_LABELS,
// ikke fra result-kind.

import { computeScramble } from './texasScramble';
import type { ScoringContext, TexasScrambleResult } from './types';

/**
 * Standard Ambrose-default-handicap som prosent av summert lag-HCP:
 * `100 / (2 × team_size)`. 2-mannslag → 25 %, 4-mannslag → 12,5 %. Matematisk
 * identisk med den kanoniske divisor-formelen (combinedCH ÷ 2N). Brukes av
 * admin-formen som startverdi og av validatoren som default; admin kan justere.
 */
export function ambroseDefaultPct(teamSize: number): number {
  return 100 / (2 * teamSize);
}

/**
 * Beregner Ambrose-leaderboard. Leser `team_handicap_pct` fra `mode_config`
 * (defensiv fallback til 0 = brutto hvis feil kind) og delegerer til den delte
 * scramble-kjernen. Returnerer `kind: 'texas_scramble'` — view-laget gjenbrukes.
 */
export function compute(ctx: ScoringContext): TexasScrambleResult {
  const handicapPct =
    ctx.game.mode_config.kind === 'ambrose'
      ? ctx.game.mode_config.team_handicap_pct
      : 0;
  return computeScramble(ctx, handicapPct);
}

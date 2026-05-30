// Florida Scramble-scoring (issue #283) — Texas-variant med step-aside-regel.
//
// Mekanisk identisk med Texas scramble: lagene velger beste slag og slår
// derfra — én ball per lag, én score per lag per hull lagret på lag-kapteinen
// (lex-min userId). Eneste forskjell fra Texas er:
//  1. DEFAULT-lag-handicapet: NGF-konvensjon for Florida — fasttabell per
//     lagstørrelse (3-mannslag 15 %, 4-mannslag 10 %). NB: 15 % er høyere enn
//     Texas' 10 % fordi step-aside-regelen øker effektiv vanskelighetsgrad.
//  2. Step-aside-regelen (honor-system, ingen slag-for-slag-tracking i Tørny):
//     spilleren hvis slag ble valgt, «sitter over» neste slag. Resten av laget
//     slår videre. Dette styrer kun HVEM som slår på banen, ikke hva som
//     registreres — Tørny lagrer én lag-gross per hull uansett.
//
// `team_handicap_pct` er justerbar (0–100) som i Texas/Ambrose — Florida er
// en klubb-konvensjon, ikke strengt regelbundet. Default settes av form/
// validator-laget via `defaultFloridaHandicapPct`.
//
// Scoring delegeres til den delte `computeScramble`-kjernen i `texasScramble.ts`
// og returnerer `kind: 'texas_scramble'`, slik at leaderboard, podium, mail og
// hull-page-rendering gjenbrukes uendret (samme mønster som ambrose → Texas).
// Format-navnet «Florida Scramble» kommer fra `game_mode` → MODE_LABELS,
// ikke fra result-kind.

import { computeScramble } from './texasScramble';
import type { ScoringContext, TexasScrambleResult } from './types';

/**
 * NGF-fasttabell for Florida Scramble lag-handicap-default:
 *  - 3-mannslag → 15 % (step-aside øker effektiv vanskelighetsgrad vs Texas)
 *  - 4-mannslag → 10 % (NGF-standard, lik Texas 4-mann)
 *  - Andre størrelser: 10 % som konservativ default
 *
 * Brukes av admin-formen som startverdi og av validatoren som default; admin
 * kan justere (0–100). Fraksjonelle verdier er tillatt (i motsetning til heltall-
 * kravet for Texas), men default-verdiene er alltid heltall.
 */
export function defaultFloridaHandicapPct(teamSize: number): number {
  if (teamSize === 3) return 15;
  if (teamSize === 4) return 10;
  return 10;
}

/**
 * Beregner Florida Scramble-leaderboard. Leser `team_handicap_pct` fra
 * `mode_config` (defensiv fallback til 0 = brutto hvis feil kind) og delegerer
 * til den delte scramble-kjernen. Returnerer `kind: 'texas_scramble'` — view-
 * laget gjenbrukes (leaderboard, podium, mail, hull-page).
 */
export function compute(ctx: ScoringContext): TexasScrambleResult {
  const handicapPct =
    ctx.game.mode_config.kind === 'florida_scramble'
      ? ctx.game.mode_config.team_handicap_pct
      : 0;
  return computeScramble(ctx, handicapPct);
}

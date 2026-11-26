// The extra strokes for a higher par in match play (#2941, F17) — the one home
// of the rule. The engines, the hole page, the scorecard, the cup points and
// the app all read it (the views via `allocatedStrokes.ts`).
//
// NGF 6.2b(i) s. 56, for match play where the result is a net score: «En
// spiller som konkurrerer fra et utslagssted med en høyere par må få
// tilleggsslag for runden, lik differansen mellom par fra de utslagsstedene de
// spiller og utslagsstedene med lavest par», added as «Spillehandicap x
// handicapgodtgjørelse + Forskjell i par» — whole strokes, after the
// allowance. Vedlegg C s. 76: «etter at handicapgodtgjørelse er lagt til i
// matchspillformater, spiller den spilleren med det laveste spillehandicapet
// med null handicapslag».
//
// A tee has one par per gender here (`games.tee_box_id` is one tee box), so a
// different par comes from `game_players.tee_gender` (`parFor`).

import { usesMatchDifference } from './matchStrokes';
import { parFor } from './modes/parResolver';
import type { GameModeConfig, ScoringGender, ScoringHole } from './modes/types';

/**
 * True when the match gives the extra strokes for a higher par
 * (`par_strokes: 'difference'`). Stamped on NEW match play games only
 * (`stampNewMatchConfig`), never added to a game created before.
 *
 * Singles, four-ball and Round Robin count it only together with
 * `match_strokes: 'difference'`, where the lowest plays off zero; the two are
 * stamped together. The alternate shot formats always play off the lower side.
 */
export function usesParDifference(config: GameModeConfig): boolean {
  switch (config.kind) {
    case 'singles_matchplay':
    case 'fourball_matchplay':
    case 'round_robin':
      return config.par_strokes === 'difference' && usesMatchDifference(config);
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
      return config.par_strokes === 'difference';
    default:
      return false;
  }
}

/** Σ par over `holes` for one tee. */
function parTotal(holes: readonly ScoringHole[], tee: ScoringGender | undefined): number {
  return holes.reduce((sum, hole) => sum + parFor(hole, tee), 0);
}

/**
 * NGF 6.2b(i): Σ own par − Σ lowest par in the match over the holes in scope;
 * 0 when every tee shares par (#2941). `holes` are the holes in scope
 * (`holesForSegment`), so nine holes give the difference over the nine.
 * `inMatch` is every tee in the match; the player's own may be included.
 */
export function parDifferenceStrokes(
  holes: readonly ScoringHole[],
  own: ScoringGender | undefined,
  inMatch: readonly (ScoringGender | undefined)[],
): number {
  const ownTotal = parTotal(holes, own);
  const lowest = Math.min(ownTotal, ...inMatch.map((tee) => parTotal(holes, tee)));
  return ownTotal - lowest;
}

/**
 * The strokes each player (or side) spreads over SI once the par difference
 * is in: `strokes[i] + parDiffs[i]`, less the lowest of those, so the lowest
 * playing handicap plays off zero (vedlegg C s. 76). `strokes` is what the
 * match gives without par (the share of the difference, lowest 0).
 *
 * When the player on the higher par has the lowest handicap, she plays off
 * zero and the others get the difference: 10 + 2 against 14 gives 0 and 2.
 */
export function withParDifference(
  strokes: readonly number[],
  parDiffs: readonly number[],
): number[] {
  const total = strokes.map((s, i) => s + (parDiffs[i] ?? 0));
  const lowest = Math.min(...total);
  return total.map((t) => t - lowest);
}

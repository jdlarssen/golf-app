// Lag-handicapet i scramble-familien (Texas, Ambrose, Florida), per lag (#2569).
//
// `mode_config.team_handicap_pct` er prosent av SUMMEN av lagets banehandicap,
// regnet for `mode_config.team_size` (#2009, #2566). Arrangøren tenker i
// prosent av lagets SNITT, og det tallet skal gjelde alle lag i spillet. Når
// et lag har én spiller mindre (forfall, eller 11 påmeldte i et 4-mannsspill),
// er summen mindre, men snittet er det samme. Prosenten av summen skaleres
// derfor med konfigurert ÷ faktisk størrelse:
//
//   prosent av snitt = sumPct × konfigurert
//   lag-HCP          = round(sum × sumPct × konfigurert ÷ (faktisk × 100))
//
// Eksempel: 80 % av snittet i et 4-mannsspill er lagret som 20. Laget på 3 med
// 10/20/30 har snitt 20 og får 16, ikke 12.
//
// Fullt lag gir nøyaktig det gamle uttrykket, så jevne lag er bit-like med før.
// Texas' startverdi for tre (15 % av summen) byttes IKKE inn for det korte laget:
// det får arrangørens prosent av snittet, som alle andre lag.
//
// Motoren (`computeScramble`), scorekortet og hullsiden leser alle herfra.
//
// #2997 (F16/F25): `sideHandicap` er lag-tallet i lagformatene med egen
// prosent (alternate shot, scramble-familien og patsome), regnet av det urundede
// banehandicapet når starten frøs det (NGF 6.2a, avklaring 6.2a/1, s. 55).
//
// #3002 (F23): et nytt Texas- eller Florida-spill vekter hver spiller etter
// NGF vedlegg C s. 75 (`team_handicap_rule: 'ngf_weighted'`). Et spill uten
// nøkkelen beholder én prosent av summen over. `scrambleTeamHandicapFor`
// velger mellom dem, og motoren, scorekortet og hullsiden kaller den.

import { roundHalfUp } from './courseHandicap';
import type { GameModeConfig } from './modes/types';

/**
 * How a team's (a side's) handicap comes from its players' course handicaps:
 * the sum (foursomes, gruesome, the scramble family, patsome holes 13–18) or
 * 60 % of the lowest plus 40 % of the highest (greensome, chapman, patsome
 * holes 7–12).
 */
export type SideRule = 'sum' | 'sixtyForty';

/** The two course handicaps `sideHandicap` reads from one player. */
export interface SidePlayer {
  courseHandicap: number;
  rawCourseHandicap?: number | null;
}

/**
 * The numbers a team's handicap is taken of: the unrounded course handicaps
 * when the start froze them for every player (#2997), otherwise the frozen
 * integers. Same rule as `sideHandicap`.
 */
function sideBases(players: readonly SidePlayer[]): number[] {
  const exact = players.length > 0 && players.every((p) => p.rawCourseHandicap != null);
  return players.map((p) => (exact ? (p.rawCourseHandicap as number) : p.courseHandicap));
}

function combine(rule: SideRule, values: readonly number[]): number {
  if (values.length === 0) return 0;
  if (rule === 'sum') return values.reduce((sum, v) => sum + v, 0);
  return 0.6 * Math.min(...values) + 0.4 * Math.max(...values);
}

/**
 * The team's handicap before the format's percentage, one home for the engines
 * and the views.
 *
 * - Every player has the unrounded course handicap the start froze (#2997):
 *   the rule on those numbers, NOT rounded. The format rounds once, after its
 *   percentage (WHS 6.2a, interpretation 6.2a/1). 9,513 + 11,394 stays 20,907.
 * - Otherwise (a round started before the column existed): the rule on the
 *   frozen integers, rounded, as before. 60/40 of 8 and 14 is 10,4, so 10.
 *   The sum of integers is already whole.
 *
 * A team of another size than two (draft state) takes 60/40 over its lowest
 * and highest, and an empty team is 0.
 */
export function sideHandicap(rule: SideRule, players: readonly SidePlayer[]): number {
  const exact = players.length > 0 && players.every((p) => p.rawCourseHandicap != null);
  const combined = combine(rule, sideBases(players));
  return exact ? combined : roundHalfUp(combined);
}

/**
 * Lagets handicap i scramble-familien. `sumPct` er lagret prosent av summen
 * for `configuredTeamSize`; `actualTeamSize` er hvor mange laget faktisk har.
 */
export function scrambleTeamHandicap(
  combinedCourseHandicap: number,
  sumPct: number,
  configuredTeamSize: number,
  actualTeamSize: number,
): number {
  if (actualTeamSize <= 0) return 0;
  if (
    actualTeamSize === configuredTeamSize ||
    !Number.isInteger(configuredTeamSize) ||
    configuredTeamSize <= 0
  ) {
    return Math.round((combinedCourseHandicap * sumPct) / 100);
  }
  return Math.round(
    (combinedCourseHandicap * sumPct * configuredTeamSize) / (actualTeamSize * 100),
  );
}

/**
 * NGF vedlegg C s. 75, scramble: each player's share, from the lowest to the
 * highest handicap, per team size (#3002, F23).
 */
export const NGF_SCRAMBLE_WEIGHTS: Readonly<Record<2 | 3 | 4, readonly number[]>> = {
  2: [35, 15],
  3: [30, 20, 10],
  4: [25, 20, 15, 10],
};

/**
 * The team handicap by NGF's weighting: the handicaps sorted from the lowest,
 * each times its share, summed and rounded once. 10, 18, 27 and 39 give
 * 2,5 + 3,6 + 4,05 + 3,9 = 14,05 → 14. A plus handicap counts with its sign.
 * `null` for a team the table has no row for (one player, or more than four).
 */
export function ngfWeightedTeamHandicap(bases: readonly number[]): number | null {
  const weights =
    bases.length === 2 || bases.length === 3 || bases.length === 4
      ? NGF_SCRAMBLE_WEIGHTS[bases.length]
      : null;
  if (!weights) return null;
  const sorted = [...bases].sort((a, b) => a - b);
  const weighted = sorted.reduce((sum, base, i) => sum + base * weights[i], 0);
  return roundHalfUp(weighted / 100);
}

/** The keys of a scramble `mode_config` (Texas, Ambrose, Florida) the team handicap reads. */
export interface ScrambleHandicapConfig {
  team_size: number;
  team_handicap_pct: number;
  team_handicap_rule?: 'ngf_weighted' | 'sum_pct';
}

/**
 * The scramble keys of a game's `mode_config`, for the views. Another kind
 * reads as gross (0 %), as the engines' `compute` does.
 */
export function scrambleHandicapConfig(config: GameModeConfig): ScrambleHandicapConfig {
  if (
    config.kind === 'texas_scramble' ||
    config.kind === 'ambrose' ||
    config.kind === 'florida_scramble'
  ) {
    return {
      team_size: config.team_size,
      team_handicap_pct: config.team_handicap_pct,
      team_handicap_rule: config.team_handicap_rule,
    };
  }
  return { team_size: config.team_size, team_handicap_pct: 0 };
}

/**
 * A scramble team's handicap by the rule the game was created with, one home
 * for the engine, the scorecard and the hole page (#3002, F23):
 *
 * - `'ngf_weighted'` and two to four players: NGF's weighting per player
 *   (`ngfWeightedTeamHandicap`). A team one player short takes the row for its
 *   own size, so a team of three in a game of four gets 30/20/10 %.
 * - Otherwise, also with no key (every game created before #3002), or a draft
 *   team outside the table: the stored share of the sum,
 *   `scrambleTeamHandicap` (#2569).
 */
export function scrambleTeamHandicapFor(
  config: ScrambleHandicapConfig,
  members: readonly SidePlayer[],
): number {
  if (config.team_handicap_rule === 'ngf_weighted') {
    const weighted = ngfWeightedTeamHandicap(sideBases(members));
    if (weighted !== null) return weighted;
  }
  return scrambleTeamHandicap(
    sideHandicap('sum', members),
    config.team_handicap_pct,
    config.team_size,
    members.length,
  );
}

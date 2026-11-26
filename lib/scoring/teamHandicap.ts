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
// Texas' NGF-tabell (15 % av summen à 3) byttes IKKE inn for det korte laget:
// det får arrangørens prosent av snittet, som alle andre lag.
//
// Motoren (`computeScramble`), scorekortet og hullsiden leser alle herfra.
//
// #2997 (F16/F25): `sideHandicap` er lag-tallet i lagformatene med egen
// prosent (alternate shot, scramble-familien og patsome), regnet av det urundede
// banehandicapet når starten frøs det (NGF 6.2a, avklaring 6.2a/1, s. 55).

import { roundHalfUp } from './courseHandicap';

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
  if (exact) return combine(rule, players.map((p) => p.rawCourseHandicap as number));
  return roundHalfUp(combine(rule, players.map((p) => p.courseHandicap)));
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

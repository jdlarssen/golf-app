import type { TeamLine } from '@/lib/leaderboard';
import { formatVsPar as formatTableVsPar } from '@/lib/scoring/scoreTone';

/**
 * «Mot par» over hullene som faktisk teller (#2217 D6):
 * total − baller × (par for hullene konkurrenten har score på).
 *
 * Før ble totalen sammenlignet med par for hele banen. Et lag med hull 17–18
 * uspilt sto da på «−6» selv om det lå over par, og shamble med to baller som
 * teller fikk 148 mot 72 («+76»).
 *
 * - `scopePar`: par for én ball over alle hull i spillets scope
 * - `unplayedPars`: par for hullene i scope uten score
 * - `holesInScope`: antall hull-rader konkurrenten har; 0 = ukjent (ingen rader)
 * - `balls`: ballene som teller per hull — `count` i shamble/champagne, ellers 1
 *
 * `null` når konkurrenten har rader, men ikke ett spilt hull. Da finnes det
 * ingen mot par-verdi, og flatene viser «—». Et komplett spill gir samme tall
 * som total − banens par.
 */
export function vsParOverPlayed(opts: {
  total: number;
  scopePar: number;
  unplayedPars: readonly number[];
  holesInScope: number;
  balls?: number;
}): number | null {
  const { total, scopePar, unplayedPars, holesInScope, balls = 1 } = opts;
  if (holesInScope > 0 && unplayedPars.length >= holesInScope) return null;
  const unplayedPar = unplayedPars.reduce((sum, par) => sum + par, 0);
  return total - balls * (scopePar - unplayedPar);
}

/**
 * `vsParOverPlayed` for en best ball-`TeamLine` (tavla, «Hull for hull» og
 * CSV-en). `coursePar` er summen av `LbHole.par` over hullene som ble sendt til
 * `computeLeaderboard`.
 *
 * Et uspilt hulls par leses som `parByGender?.mens ?? par`. I alle tre
 * kallstedene er det nøyaktig `LbHole.par` (`par_mens`), altså samme kilde som
 * `coursePar`. `TeamHoleRow.par` alene er par for lagets representant-kjønn og
 * ville blandet grunnlaget for et dame- eller juniorlag.
 */
export function teamLineVsPar(
  line: Pick<TeamLine, 'total' | 'holes'>,
  coursePar: number,
): number | null {
  return vsParOverPlayed({
    total: line.total,
    scopePar: coursePar,
    unplayedPars: line.holes
      .filter((h) => h.teamNet == null)
      .map((h) => h.parByGender?.mens ?? h.par),
    holesInScope: line.holes.length,
  });
}

/**
 * #2253: a vs-par number as the label every net-to-par surface shows — the
 * live board, the podium and the duel. `null` (no hole played) → «—», 0 → «E»,
 * over par → «+3», under par → «−2» with U+2212, the minus sign the share card
 * already uses.
 */
export function formatVsPar(n: number | null): string {
  if (n === null) return '—';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** #2625: the rule a team result ranks on (`TexasScrambleResult.ranking` et al.). */
export type TeamRanking = 'net_to_par' | 'net_total' | undefined;

/**
 * #2625: what a team row or podium leads with, from the game's rule. A game
 * ranked on net to par leads with the team's to par (what it ranks on), any
 * other game with the sum, as before — so the number and the order agree.
 * `format` is the surface's own to-par label (the tables use the hyphen-minus
 * one in `lib/scoring/scoreTone.ts`).
 */
export function teamHeadline(
  ranking: TeamRanking,
  line: { total: number; toPar: number | null },
  format: (n: number | null) => string = formatVsPar,
): { unit: 'toPar' | 'total'; value: number | null; text: string } {
  return ranking === 'net_to_par'
    ? { unit: 'toPar', value: line.toPar, text: format(line.toPar) }
    : { unit: 'total', value: line.total, text: String(line.total) };
}

/**
 * #2625 part 2: what a points row, podium or duel leads with — points against
 * par pace in a game ranked on net to par, else the points — and the
 * `leaderboard.common` label under it. One home for the choice the stableford
 * and patsome surfaces make, so the number and its label cannot disagree.
 */
export function pointsHeadline(
  ranking: TeamRanking,
  line: { totalPoints: number; toPar: number | null },
): ReturnType<typeof teamHeadline> & { labelKey: 'vsParLabel' | 'poengLabel' } {
  const headline = teamHeadline(ranking, { total: line.totalPoints, toPar: line.toPar });
  return { ...headline, labelKey: headline.unit === 'toPar' ? 'vsParLabel' : 'poengLabel' };
}

/**
 * #2625: the row's distance to the leader in the headline's unit: to par in a
 * net-to-par game (`null` when either has no hole), else the sum.
 */
export function teamHeadlineGap(
  ranking: TeamRanking,
  line: { total: number; toPar: number | null },
  leader: { total: number; toPar: number | null },
): number | null {
  if (ranking !== 'net_to_par') return line.total - leader.total;
  return line.toPar === null || leader.toPar === null ? null : line.toPar - leader.toPar;
}

/**
 * #2625: a best ball line's «mot par» for the game's rule. A net-to-par game
 * shows what it ranks on (`TeamLine.toPar`, against the team row's par); any
 * other game keeps `teamLineVsPar` (against the men's par).
 */
export function bestBallLineVsPar(
  line: Pick<TeamLine, 'total' | 'holes' | 'toPar'>,
  coursePar: number,
  ranking: 'net_to_par' | undefined,
): number | null {
  return ranking === 'net_to_par' ? line.toPar : teamLineVsPar(line, coursePar);
}

/**
 * #2625: a team's to-par label for the game's rule. A net-to-par game shows it
 * with U+2212 on every surface, like the board, the podium and the share card
 * (`formatVsPar`); other games keep the tables' hyphen-minus
 * (`lib/scoring/scoreTone.ts`), as before.
 */
export function formatTeamVsPar(ranking: TeamRanking, n: number | null): string {
  return ranking === 'net_to_par' ? formatVsPar(n) : formatTableVsPar(n);
}

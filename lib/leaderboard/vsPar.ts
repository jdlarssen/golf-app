import type { TeamLine } from '@/lib/leaderboard';

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

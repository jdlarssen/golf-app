import type { NassauHolePlayerCell, NassauResult } from '@/lib/scoring/modes/types';

/**
 * #2625: a Nassau hole card's rows, best first and unplayed last, on the
 * measure the hole winner (★, `NassauHoleRow.bestUserIds`) is picked on: the
 * engine's `toPar` (effective − own par) in a game ranked on net to par, else
 * effective strokes. The ★ row then always stands first. Equal rows keep the
 * engine's order.
 */
export function nassauHoleCardRows(
  perPlayer: readonly NassauHolePlayerCell[],
  ranking: NassauResult['ranking'],
): NassauHolePlayerCell[] {
  const measure = (c: NassauHolePlayerCell) =>
    (ranking === 'net_to_par' ? c.toPar : c.effective) ?? Number.POSITIVE_INFINITY;
  return [...perPlayer].sort((a, b) => measure(a) - measure(b) || 0);
}

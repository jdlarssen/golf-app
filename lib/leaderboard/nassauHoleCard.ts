import type { NassauHolePlayerCell, NassauResult } from '@/lib/scoring/modes/types';

/**
 * #2625: a Nassau hole card's rows, best first and unplayed last, on the
 * measure the hole winner (★, `NassauHoleRow.bestUserIds`) is picked on:
 * effective strokes against the player's own par in a game ranked on net to
 * par, else effective strokes. The ★ row then always stands first. Equal rows
 * keep the engine's order.
 */
export function nassauHoleCardRows(
  perPlayer: readonly NassauHolePlayerCell[],
  ranking: NassauResult['ranking'],
): NassauHolePlayerCell[] {
  const measure = (c: NassauHolePlayerCell) =>
    c.effective == null
      ? Number.POSITIVE_INFINITY
      : ranking === 'net_to_par'
        ? c.effective - c.par
        : c.effective;
  return [...perPlayer].sort((a, b) => measure(a) - measure(b) || 0);
}

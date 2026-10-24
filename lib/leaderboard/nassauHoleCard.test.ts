import { describe, expect, it } from 'vitest';
import type { NassauHolePlayerCell } from '@/lib/scoring/modes/types';
import { nassauHoleCardRows } from './nassauHoleCard';

describe('nassauHoleCardRows (#2625)', () => {
  // Mixed tees on a hole that is par 3 for men and par 5 for ladies: M scores
  // 3 (par), L scores 4 (one under her par), U has not played. The engine
  // gives L the hole in a game ranked on net to par.
  const cells: NassauHolePlayerCell[] = [
    { userId: 'U', gross: null, effective: null, par: 3 },
    { userId: 'M', gross: 3, effective: 3, par: 3 },
    { userId: 'L', gross: 4, effective: 4, par: 5 },
  ];

  it('in a game ranked on net to par the ★ player stands first, unplayed last', () => {
    expect(nassauHoleCardRows(cells, 'net_to_par').map((c) => c.userId)).toEqual(['L', 'M', 'U']);
  });

  it('otherwise the rows keep the lowest effective strokes first, as before', () => {
    expect(nassauHoleCardRows(cells, 'net_total').map((c) => c.userId)).toEqual(['M', 'L', 'U']);
  });
});

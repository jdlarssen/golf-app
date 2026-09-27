import { describe, it, expect } from 'vitest';
import type { TeamLine } from '@/lib/leaderboard';
import { formatVsPar, teamLineVsPar, vsParOverPlayed } from './vsPar';

// Type A (#2217 D6): «mot par» = total − balls × (par for the holes the
// competitor has a score on). A complete game gives the same number as
// total − course par did.

const fours = (n: number) => Array.from({ length: n }, () => 4);

describe('vsParOverPlayed', () => {
  it.each([
    ['full game', { total: 70, scopePar: 72, unplayedPars: [], holesInScope: 18 }, -2],
    ['16 of 18 holes', { total: 66, scopePar: 72, unplayedPars: [4, 4], holesInScope: 18 }, 2],
    ['two balls count (shamble best 2)', { total: 148, scopePar: 72, unplayedPars: [], holesInScope: 0, balls: 2 }, 4],
    ['nothing played', { total: 0, scopePar: 72, unplayedPars: fours(18), holesInScope: 18 }, null],
    ['no hole rows (holesInScope 0)', { total: 70, scopePar: 72, unplayedPars: [], holesInScope: 0 }, -2],
  ] as const)('%s', (_label, opts, expected) => {
    expect(vsParOverPlayed(opts)).toBe(expected);
  });
});

describe('teamLineVsPar', () => {
  function line(holes: Array<{ par: number; mens?: number; teamNet: number | null }>, total: number) {
    return {
      total,
      holes: holes.map((h, i) => ({
        holeNumber: i + 1,
        par: h.par,
        strokeIndex: i + 1,
        teamNet: h.teamNet,
        contributorIds: [],
        players: [],
        parByGender: h.mens == null ? undefined : { mens: h.mens, ladies: h.par, juniors: h.mens },
      })),
    } satisfies Pick<TeamLine, 'total' | 'holes'>;
  }

  it('takes the men’s par of an unplayed hole, the same source as the course par', () => {
    // A ladies team: row par 5 on hole 2, men's par 4. Course par (par_mens) = 8.
    const l = line(
      [
        { par: 4, mens: 4, teamNet: 5 },
        { par: 5, mens: 4, teamNet: null },
      ],
      5,
    );
    // 5 − (8 − 4) = +1. With the row par it would have been 5 − (8 − 5) = +2.
    expect(teamLineVsPar(l, 8)).toBe(1);
  });

  it('falls back to the row par when the hole has no per-gender par', () => {
    const l = line(
      [
        { par: 4, teamNet: 3 },
        { par: 4, teamNet: null },
      ],
      3,
    );
    expect(teamLineVsPar(l, 8)).toBe(-1);
  });

  it('is null for a team without a single played hole', () => {
    const l = line(
      [
        { par: 4, teamNet: null },
        { par: 4, teamNet: null },
      ],
      0,
    );
    expect(teamLineVsPar(l, 8)).toBeNull();
  });
});

describe('formatVsPar (#2253)', () => {
  it.each([
    [null, '—'],
    [0, 'E'],
    [3, '+3'],
    [1, '+1'],
    [-2, '\u22122'],
    [-11, '\u221211'],
  ] as const)('%s → %s', (n, label) => {
    expect(formatVsPar(n)).toBe(label);
  });
});

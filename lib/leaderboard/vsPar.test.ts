import { describe, it, expect } from 'vitest';
import type { TeamLine } from '@/lib/leaderboard';
import { formatVsPar as formatTableVsPar } from '@/lib/scoring/scoreTone';
import {
  bestBallLineVsPar,
  formatVsPar,
  teamHeadline,
  teamHeadlineGap,
  teamLineVsPar,
  vsParOverPlayed,
} from './vsPar';

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

// #2625: the team surfaces lead with the number the game ranks on. A game
// stamped `ranking: 'net_to_par'` shows its to par (and the gap in it), any
// other game keeps the sum. One rule, so the number and the order agree.
describe('teamHeadline / teamHeadlineGap (#2625)', () => {
  const lag1 = { total: 7, toPar: -5 };
  const lag2 = { total: 17, toPar: -7 };
  const none = { total: 0, toPar: null };

  it.each([
    ['net_to_par', lag2, { unit: 'toPar', value: -7, text: '\u22127' }],
    ['net_to_par', { total: 72, toPar: 0 }, { unit: 'toPar', value: 0, text: 'E' }],
    ['net_to_par', none, { unit: 'toPar', value: null, text: '—' }],
    ['net_total', lag2, { unit: 'total', value: 17, text: '17' }],
    [undefined, lag2, { unit: 'total', value: 17, text: '17' }],
  ] as const)('%s: %o → %o', (ranking, line, expected) => {
    expect(teamHeadline(ranking, line)).toEqual(expected);
  });

  it('formats to par with the surface’s own formatter (the tables use a hyphen-minus)', () => {
    expect(teamHeadline('net_to_par', lag1, formatTableVsPar).text).toBe('-5');
  });

  it.each([
    ['net_to_par', lag1, lag2, 2],
    ['net_to_par', none, lag2, null],
    ['net_total', lag2, lag1, 10],
    [undefined, lag2, lag1, 10],
  ] as const)('%s: gap to the leader', (ranking, line, leader, expected) => {
    expect(teamHeadlineGap(ranking, line, leader)).toBe(expected);
  });
});

describe('bestBallLineVsPar (#2625)', () => {
  // A team led by a lady: hole 1 is par 5 from her tee, 4 from the men's.
  // The flagged game shows what it ranks on (the team row's par); the other
  // game keeps the men's par (teamLineVsPar).
  const line = {
    total: 8,
    toPar: -1,
    holes: [
      { holeNumber: 1, par: 5, parByGender: { mens: 4, ladies: 5, juniors: 4 }, strokeIndex: 1, teamNet: 4, contributorIds: [], players: [] },
      { holeNumber: 2, par: 4, strokeIndex: 2, teamNet: 4, contributorIds: [], players: [] },
    ],
  } satisfies Pick<TeamLine, 'total' | 'toPar' | 'holes'>;

  it('net_to_par: the line’s own toPar', () => {
    expect(bestBallLineVsPar(line, 8, 'net_to_par')).toBe(-1);
  });

  it('otherwise teamLineVsPar, as before', () => {
    expect(bestBallLineVsPar(line, 8, undefined)).toBe(teamLineVsPar(line, 8));
    expect(bestBallLineVsPar(line, 8, undefined)).toBe(0);
  });
});

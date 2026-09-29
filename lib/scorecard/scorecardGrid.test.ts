import { describe, it, expect } from 'vitest';
import { compute, computeStablefordPoints } from '@/lib/scoring/modes/stableford';
import { computeModifiedStablefordPoints } from '@/lib/scoring/modes/modifiedStableford';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import type { GameMode } from '@/lib/scoring/modes/types';
import {
  buildScorecardGrid,
  stablefordPointsFnFor,
  type ScorecardGridRow,
} from './scorecardGrid';

function row(
  holeNumber: number,
  strokes: number | null,
  extra: number | null = 0,
  par = 4,
): ScorecardGridRow {
  return { holeNumber, par, strokes, extra };
}

function fullRound(strokes: number, extra = 0): ScorecardGridRow[] {
  return Array.from({ length: 18 }, (_, i) => row(i + 1, strokes, extra));
}

describe('buildScorecardGrid — halves', () => {
  it('splits 18 holes into UT (1–9) and INN (10–18)', () => {
    const { halves } = buildScorecardGrid({ rows: fullRound(4), pointsFn: null });
    expect(halves.map((half) => half.key)).toEqual(['out', 'in']);
    expect(halves[0].cells.map((cell) => cell.holeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(halves[1].cells.map((cell) => cell.holeNumber)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    expect(halves[0].sum).toEqual({ par: 36, strokes: 36, net: 36, points: null });
    expect(halves[1].sum).toEqual({ par: 36, strokes: 36, net: 36, points: null });
  });

  it('gives one card for a front-nine round', () => {
    const rows = Array.from({ length: 9 }, (_, i) => row(i + 1, 5));
    const { halves, totals } = buildScorecardGrid({ rows, pointsFn: null });
    expect(halves.map((half) => half.key)).toEqual(['out']);
    expect(totals.holeCount).toBe(9);
  });

  it('gives one card for a back-nine round', () => {
    const rows = Array.from({ length: 9 }, (_, i) => row(i + 10, 5));
    const { halves } = buildScorecardGrid({ rows, pointsFn: null });
    expect(halves.map((half) => half.key)).toEqual(['in']);
  });

  it('gives no cards and zero totals for no holes', () => {
    const { halves, totals } = buildScorecardGrid({ rows: [], pointsFn: computeStablefordPoints });
    expect(halves).toEqual([]);
    expect(totals).toEqual({ played: 0, holeCount: 0, brutto: 0, netto: 0, points: 0 });
  });

  it('sums par over the whole half, played or not', () => {
    const rows = [row(1, 4, 0, 4), row(2, null, 0, 5), row(3, 3, 0, 3)];
    const { halves } = buildScorecardGrid({ rows, pointsFn: null });
    expect(halves[0].sum.par).toBe(12);
    expect(halves[0].sum.strokes).toBe(7);
  });
});

describe('buildScorecardGrid — net and missing holes', () => {
  it('subtracts the allocated strokes per hole', () => {
    const rows = [row(1, 5, 1), row(2, 4, 0), row(3, 6, 2)];
    const { halves, totals } = buildScorecardGrid({ rows, pointsFn: null });
    expect(halves[0].cells.map((cell) => cell.net)).toEqual([4, 4, 4]);
    expect(totals).toEqual({ played: 3, holeCount: 3, brutto: 15, netto: 12, points: null });
  });

  it('leaves a hole without strokes empty and out of the sums', () => {
    const rows = [row(1, 5, 1), row(2, null, 1), row(3, 4, 0)];
    const { halves, totals } = buildScorecardGrid({ rows, pointsFn: computeStablefordPoints });
    expect(halves[0].cells[1]).toEqual({ holeNumber: 2, par: 4, strokes: null, net: null, points: null });
    expect(totals).toEqual({ played: 2, holeCount: 3, brutto: 9, netto: 8, points: 4 });
  });

  it('makes net, points and their sums unknown when a played hole has unknown allocation', () => {
    const rows = [row(1, 5, 1), row(2, 5, null), ...Array.from({ length: 9 }, (_, i) => row(i + 10, 4, 0))];
    const { halves, totals } = buildScorecardGrid({ rows, pointsFn: computeStablefordPoints });
    expect(halves[0].cells[1].net).toBeNull();
    expect(halves[0].cells[1].points).toBeNull();
    expect(halves[0].sum).toEqual({ par: 8, strokes: 10, net: null, points: null });
    // The other half is fully known, so its own sum still stands.
    expect(halves[1].sum).toEqual({ par: 36, strokes: 36, net: 36, points: 18 });
    expect(totals.brutto).toBe(46);
    expect(totals.netto).toBeNull();
    expect(totals.points).toBeNull();
  });

  it('ignores unknown allocation on a hole nobody has played', () => {
    const rows = [row(1, 5, 1), row(2, null, null)];
    const { totals } = buildScorecardGrid({ rows, pointsFn: computeStablefordPoints });
    expect(totals).toEqual({ played: 1, holeCount: 2, brutto: 5, netto: 4, points: 2 });
  });
});

describe('buildScorecardGrid — points', () => {
  it.each([
    { strokes: 3, extra: 0, expected: 3 },
    { strokes: 4, extra: 0, expected: 2 },
    { strokes: 5, extra: 1, expected: 2 },
    { strokes: 7, extra: 0, expected: 0 },
    { strokes: 3, extra: 2, expected: 5 },
  ])('standard: $strokes strokes with $extra extra on a par 4 → $expected', ({ strokes, extra, expected }) => {
    const { halves } = buildScorecardGrid({
      rows: [row(1, strokes, extra)],
      pointsFn: computeStablefordPoints,
    });
    expect(halves[0].cells[0].points).toBe(expected);
  });

  it('sums modified points, negative ones included', () => {
    // par 0 · bogey −1 · double −3 · birdie 2 · eagle 5
    const rows = [row(1, 4), row(2, 5), row(3, 6), row(4, 3), row(5, 2)];
    const { halves, totals } = buildScorecardGrid({
      rows,
      pointsFn: computeModifiedStablefordPoints,
    });
    expect(halves[0].cells.map((cell) => cell.points)).toEqual([0, -1, -3, 2, 5]);
    expect(halves[0].sum.points).toBe(3);
    expect(totals.points).toBe(3);
  });

  it('shows no points without a points function', () => {
    const { halves, totals } = buildScorecardGrid({ rows: fullRound(4), pointsFn: null });
    expect(halves.flatMap((half) => half.cells).every((cell) => cell.points === null)).toBe(true);
    expect(totals.points).toBeNull();
  });

  it('agrees with the stableford engine on the same round', () => {
    // A guard against drift between the card and the leaderboard: mixed pars,
    // a handicap above 18 (two strokes on the hardest holes) and one missing hole.
    const courseHandicap = 20;
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4];
    const strokeIndexes = [7, 1, 15, 3, 11, 5, 17, 9, 13, 8, 18, 2, 12, 4, 16, 6, 10, 14];
    const gross = [5, 6, 4, 7, 4, 5, 3, null, 6, 5, 4, 6, 5, 8, 3, 6, 5, 4];

    const rows: ScorecardGridRow[] = pars.map((par, i) => ({
      holeNumber: i + 1,
      par,
      strokes: gross[i],
      extra: strokesForHole(courseHandicap, strokeIndexes[i]),
    }));
    const { totals } = buildScorecardGrid({ rows, pointsFn: computeStablefordPoints });

    const result = compute({
      game: {
        id: 'g1',
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
      },
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap }],
      holes: pars.map((par, i) => ({ number: i + 1, par, strokeIndex: strokeIndexes[i] })),
      scores: gross.flatMap((value, i) =>
        value === null ? [] : [{ userId: 'u1', holeNumber: i + 1, gross: value }],
      ),
    });
    if (result.variant !== 'solo') throw new Error('expected solo');

    expect(totals.points).toBe(result.players[0].totalPoints);
    expect(totals.played).toBe(result.players[0].holesPlayed);
  });
});

describe('stablefordPointsFnFor', () => {
  it.each<{ mode: GameMode; expected: unknown }>([
    { mode: 'stableford', expected: computeStablefordPoints },
    { mode: 'modified_stableford', expected: computeModifiedStablefordPoints },
    { mode: 'solo_strokeplay', expected: null },
    { mode: 'best_ball', expected: null },
    { mode: 'singles_matchplay', expected: null },
  ])('$mode', ({ mode, expected }) => {
    expect(stablefordPointsFnFor(mode)).toBe(expected);
  });
});

import { describe, it, expect } from 'vitest';
import { netScore, bestBallForHole, teamTotal } from './bestBall';

describe('netScore', () => {
  it('subtracts strokes from gross', () => {
    expect(netScore({ gross: 6, extraStrokes: 2 })).toBe(4);
  });
  it('returns null for missing gross', () => {
    expect(netScore({ gross: null, extraStrokes: 1 })).toBeNull();
  });
  it('handles negative extra strokes (plus golfer)', () => {
    expect(netScore({ gross: 4, extraStrokes: -1 })).toBe(5);
  });
});

describe('bestBallForHole', () => {
  it('returns min of two net scores', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: 6, extraStrokes: 2 },
      { userId: 'b', gross: 5, extraStrokes: 1 },
    ]);
    expect(r.teamNet).toBe(4);
    expect(r.contributors.sort()).toEqual(['a', 'b']);
  });

  it('picks the lower one', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: 7, extraStrokes: 1 },
      { userId: 'b', gross: 5, extraStrokes: 1 },
    ]);
    expect(r.teamNet).toBe(4);
    expect(r.contributors).toEqual(['b']);
  });

  it('handles one missing player', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: null, extraStrokes: 1 },
      { userId: 'b', gross: 5, extraStrokes: 1 },
    ]);
    expect(r.teamNet).toBe(4);
    expect(r.contributors).toEqual(['b']);
  });

  it('returns null teamNet when both missing', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: null, extraStrokes: 1 },
      { userId: 'b', gross: null, extraStrokes: 1 },
    ]);
    expect(r.teamNet).toBeNull();
    expect(r.contributors).toEqual([]);
  });
});

describe('teamTotal', () => {
  it('sums all holes', () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, teamNet: 4 }));
    expect(teamTotal(holes)).toEqual({ total: 72, missingHoles: [] });
  });
  it('tracks missing holes', () => {
    const holes = [
      { holeNumber: 1, teamNet: 4 },
      { holeNumber: 2, teamNet: null },
    ];
    expect(teamTotal(holes)).toEqual({ total: 4, missingHoles: [2] });
  });
  it('returns partial total when some holes are missing', () => {
    const holes = [
      { holeNumber: 1, teamNet: 4 },
      { holeNumber: 2, teamNet: null },
      { holeNumber: 3, teamNet: 3 },
    ];
    const result = teamTotal(holes);
    expect(result.total).toBe(7);  // 4 + 3, partial — caller must check missingHoles
    expect(result.missingHoles).toEqual([2]);
  });
});

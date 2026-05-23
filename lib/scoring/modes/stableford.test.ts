import { describe, it, expect } from 'vitest';
import { computeStablefordPoints, compute } from './stableford';
import type { ScoringContext, ScoringHole, ScoringPlayer, ScoringHoleScore } from './types';

function par4Holes(count: number): ScoringHole[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

function makeCtx(opts: {
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
}): ScoringContext {
  return {
    game: {
      id: 'g1',
      game_mode: 'stableford',
      mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    },
    ...opts,
  };
}

describe('computeStablefordPoints', () => {
  it('returns 2 for par', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 4 })).toBe(2);
  });

  it('returns 3 for birdie (1 under par)', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 3 })).toBe(3);
  });

  it('returns 4 for eagle (2 under par)', () => {
    expect(computeStablefordPoints({ par: 5, netStrokes: 3 })).toBe(4);
  });

  it('returns 5 for double-eagle (3 under par)', () => {
    expect(computeStablefordPoints({ par: 5, netStrokes: 2 })).toBe(5);
  });

  it('returns 1 for bogey (1 over par)', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 5 })).toBe(1);
  });

  it('returns 0 for double-bogey-or-worse', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 6 })).toBe(0);
    expect(computeStablefordPoints({ par: 4, netStrokes: 7 })).toBe(0);
  });

  it('returns 0 for null netStrokes (no score)', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: null })).toBe(0);
  });
});

describe('compute (full stableford leaderboard)', () => {
  it('summerer per-hull-poeng per spiller og returnerer discriminated shape', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'u2', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: par4Holes(2),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 }, // par → 2
        { userId: 'u1', holeNumber: 2, gross: 3 }, // birdie → 3
        { userId: 'u2', holeNumber: 1, gross: 5 }, // bogey → 1
        { userId: 'u2', holeNumber: 2, gross: 4 }, // par → 2
      ],
    });
    const result = compute(ctx);
    expect(result.kind).toBe('stableford');
    expect(result.players).toEqual([
      { userId: 'u1', totalPoints: 5, rank: 1, holesPlayed: 2, tiedWith: [] },
      { userId: 'u2', totalPoints: 3, rank: 2, holesPlayed: 2, tiedWith: [] },
    ]);
  });

  it('inkluderer extra strokes via courseHandicap → stroke-fordeling', () => {
    // CH 18 → 1 ekstra slag på alle 18 hull. Brutto 5 − 1 = netto 4 = par = 2 poeng × 18 = 36.
    const ctx = makeCtx({
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 18 }],
      holes: par4Holes(18),
      scores: Array.from({ length: 18 }, (_, i) => ({
        userId: 'u1',
        holeNumber: i + 1,
        gross: 5,
      })),
    });
    const result = compute(ctx);
    expect(result.players[0].totalPoints).toBe(36);
    expect(result.players[0].holesPlayed).toBe(18);
  });

  it('hopper over hull med null gross (pick up / ikke spilt)', () => {
    const ctx = makeCtx({
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 }],
      holes: par4Holes(3),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 }, // par → 2
        { userId: 'u1', holeNumber: 2, gross: null }, // skip
        { userId: 'u1', holeNumber: 3, gross: 3 }, // birdie → 3
      ],
    });
    const result = compute(ctx);
    expect(result.players[0].totalPoints).toBe(5);
    expect(result.players[0].holesPlayed).toBe(2);
  });

  it('håndterer partial round (færre rader enn 18 hull)', () => {
    const ctx = makeCtx({
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 }],
      holes: par4Holes(18),
      scores: Array.from({ length: 9 }, (_, i) => ({
        userId: 'u1',
        holeNumber: i + 1,
        gross: 4, // par → 2 each
      })),
    });
    const result = compute(ctx);
    expect(result.players[0].totalPoints).toBe(18);
    expect(result.players[0].holesPlayed).toBe(9);
  });

  it('sorterer høyest poeng først og assignerer rank 1, 2, 3...', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'low', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'high', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'mid', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'low', holeNumber: 1, gross: 5 }, // 1
        { userId: 'high', holeNumber: 1, gross: 3 }, // 3
        { userId: 'mid', holeNumber: 1, gross: 4 }, // 2
      ],
    });
    const result = compute(ctx);
    expect(result.players.map((p) => p.userId)).toEqual(['high', 'mid', 'low']);
    expect(result.players.map((p) => p.rank)).toEqual([1, 2, 3]);
  });
});

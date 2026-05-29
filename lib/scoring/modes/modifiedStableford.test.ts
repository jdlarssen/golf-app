import { describe, it, expect } from 'vitest';
import { computeModifiedStablefordPoints, compute } from './modifiedStableford';
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
      game_mode: 'modified_stableford',
      mode_config: { kind: 'modified_stableford', team_size: 1, points_table: 'modified' },
    },
    ...opts,
  };
}

function makeTeamCtx(opts: {
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
}): ScoringContext {
  return {
    game: {
      id: 'g1',
      game_mode: 'modified_stableford',
      mode_config: { kind: 'modified_stableford', team_size: 2, points_table: 'modified' },
    },
    ...opts,
  };
}

describe('computeModifiedStablefordPoints (pro-tabell)', () => {
  // par 4 brukt for bogey/par/birdie; par 5 for eagle/albatross.
  it.each([
    { label: 'dobbeltbogey (par 4, 6 slag)', par: 4, net: 6, expected: -3 },
    { label: 'trippelbogey eller verre (par 4, 8 slag)', par: 4, net: 8, expected: -3 },
    { label: 'bogey (par 4, 5 slag)', par: 4, net: 5, expected: -1 },
    { label: 'par (par 4, 4 slag)', par: 4, net: 4, expected: 0 },
    { label: 'birdie (par 4, 3 slag)', par: 4, net: 3, expected: 2 },
    { label: 'eagle (par 5, 3 slag)', par: 5, net: 3, expected: 5 },
    { label: 'albatross (par 5, 2 slag)', par: 5, net: 2, expected: 8 },
  ])('gir $expected poeng for $label', ({ par, net, expected }) => {
    expect(computeModifiedStablefordPoints({ par, netStrokes: net })).toBe(expected);
  });

  it('caps på 8 for bedre enn albatross (condor / hole-in-one på par 5)', () => {
    // diff = 1 − 5 = −4 (hole-in-one på par 5) skal fortsatt gi 8.
    expect(computeModifiedStablefordPoints({ par: 5, netStrokes: 1 })).toBe(8);
    expect(computeModifiedStablefordPoints({ par: 6, netStrokes: 1 })).toBe(8);
  });

  it('gir 0 for null netStrokes (hull ikke spilt)', () => {
    expect(computeModifiedStablefordPoints({ par: 4, netStrokes: null })).toBe(0);
  });
});

describe('compute — solo modified stableford', () => {
  it('summerer negative og positive poeng og returnerer kind: stableford', () => {
    // u1: par (0) + birdie (2) = 2
    // u2: bogey (−1) + dobbeltbogey (−3) = −4
    const ctx = makeCtx({
      players: [
        { userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'u2', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: par4Holes(2),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 }, // par → 0
        { userId: 'u1', holeNumber: 2, gross: 3 }, // birdie → 2
        { userId: 'u2', holeNumber: 1, gross: 5 }, // bogey → −1
        { userId: 'u2', holeNumber: 2, gross: 6 }, // double-bogey → −3
      ],
    });
    const result = compute(ctx);
    expect(result.kind).toBe('stableford');
    if (result.variant !== 'solo') throw new Error('expected solo');
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.totalPoints).toBe(2);
    expect(u2.totalPoints).toBe(-4);
  });

  it('rangerer høyest total øverst, også med negative totaler', () => {
    // low: dobbeltbogey × 2 = −6
    // mid: bogey × 2 = −2
    // high: birdie × 2 = 4
    const ctx = makeCtx({
      players: [
        { userId: 'low', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'mid', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'high', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: par4Holes(2),
      scores: [
        { userId: 'low', holeNumber: 1, gross: 6 },
        { userId: 'low', holeNumber: 2, gross: 6 },
        { userId: 'mid', holeNumber: 1, gross: 5 },
        { userId: 'mid', holeNumber: 2, gross: 5 },
        { userId: 'high', holeNumber: 1, gross: 3 },
        { userId: 'high', holeNumber: 2, gross: 3 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'solo') throw new Error('expected solo');
    expect(result.players.map((p) => p.userId)).toEqual(['high', 'mid', 'low']);
    expect(result.players.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(result.players.map((p) => p.totalPoints)).toEqual([4, -2, -6]);
  });

  it('hopper over hull med null gross (teller ikke, gir ikke −3)', () => {
    // Ikke-spilt hull skal ikke straffes som dobbeltbogey — det teller ikke.
    const ctx = makeCtx({
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 }],
      holes: par4Holes(3),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 }, // birdie → 2
        { userId: 'u1', holeNumber: 2, gross: null }, // ikke spilt → 0 (teller ikke)
        { userId: 'u1', holeNumber: 3, gross: 5 }, // bogey → −1
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'solo') throw new Error('expected solo');
    expect(result.players[0].totalPoints).toBe(1);
    expect(result.players[0].holesPlayed).toBe(2);
  });

  it('inkluderer extra strokes via courseHandicap', () => {
    // CH 18 → 1 ekstra slag på hull 1 (SI 1). Brutto 6 − 1 = netto 5 = bogey = −1.
    const ctx = makeCtx({
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 18 }],
      holes: par4Holes(1),
      scores: [{ userId: 'u1', holeNumber: 1, gross: 6 }],
    });
    const result = compute(ctx);
    if (result.variant !== 'solo') throw new Error('expected solo');
    expect(result.players[0].totalPoints).toBe(-1);
  });
});

describe('compute — team (par) modified stableford', () => {
  it('lag-hull-poeng = MAX av partnernes poeng, også når MAX er negativ', () => {
    // Lag 1: u1 bogey (−1), u2 dobbeltbogey (−3) → MAX = −1
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 }, // bogey → −1
        { userId: 'u2', holeNumber: 1, gross: 6 }, // double → −3
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const row = result.teams[0].holes[0];
    expect(row.teamPoints).toBe(-1);
    expect(row.contributorIds).toEqual(['u1']);
  });

  it('par (0 poeng) markerer fortsatt contributor (ikke en blank)', () => {
    // Lag 1: u1 par (0), u2 bogey (−1) → MAX = 0, contributor = u1 (spilte par).
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 }, // par → 0
        { userId: 'u2', holeNumber: 1, gross: 5 }, // bogey → −1
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const row = result.teams[0].holes[0];
    expect(row.teamPoints).toBe(0);
    expect(row.contributorIds).toEqual(['u1']);
    expect(row.players.find((p) => p.userId === 'u1')!.isContributor).toBe(true);
  });

  it('ingen contributor når ingen partner spilte hullet', () => {
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: null },
        { userId: 'u2', holeNumber: 1, gross: null },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const row = result.teams[0].holes[0];
    expect(row.teamPoints).toBe(0);
    expect(row.contributorIds).toEqual([]);
    expect(row.players.every((pc) => !pc.isContributor)).toBe(true);
  });

  it('lag-totalen summerer per-hull-MAX inkludert negative hull', () => {
    // Hull 1: u1 birdie (2), u2 par (0) → MAX 2
    // Hull 2: u1 bogey (−1), u2 dobbeltbogey (−3) → MAX −1
    // Total = 2 + (−1) = 1
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(2),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u1', holeNumber: 2, gross: 5 },
        { userId: 'u2', holeNumber: 2, gross: 6 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    expect(result.teams[0].totalPoints).toBe(1);
  });
});

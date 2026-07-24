import { describe, it, expect } from 'vitest';
import { computePuttsStats, type PuttsRoundInput } from './puttsStats';

/**
 * Type-A: putte-statistikk (#939, #1290). PPH er gate-fri (teller alle førte
 * hull); snitt/beste/runder krever komplett 18/18. `nearMiss` grunngir «du
 * mangler N hull»-tomtilstanden. Dekker edge-tabellen fra kontrakten.
 */

const round = (
  recordedPutts: number[],
  playedHoles: number = recordedPutts.length,
): PuttsRoundInput => ({ recordedPutts, playedHoles });

const full = (perHole: number): PuttsRoundInput =>
  round(
    Array.from({ length: 18 }, () => perHole),
    18,
  );

describe('computePuttsStats', () => {
  it('returns empty stats when there are no rounds (panel hidden)', () => {
    expect(computePuttsStats([])).toEqual({
      pph: null,
      holesCounted: 0,
      roundsCounted: 0,
      avgPuttsPerRound: null,
      bestRoundPutts: null,
      nearMiss: { partialRounds: 0, missingHoles: 0 },
    });
  });

  it('1 putted hole of 18 played: PPH from that hole, near-miss {1, 17}', () => {
    const stats = computePuttsStats([round([2], 18)]);
    expect(stats.pph).toBe(2);
    expect(stats.holesCounted).toBe(1);
    expect(stats.roundsCounted).toBe(0);
    expect(stats.avgPuttsPerRound).toBeNull();
    expect(stats.bestRoundPutts).toBeNull();
    expect(stats.nearMiss).toEqual({ partialRounds: 1, missingHoles: 17 });
  });

  it("17/18 (owner's case): PPH over 17 holes, near-miss {1, 1}, no qualifying round", () => {
    const stats = computePuttsStats([round(Array(17).fill(2), 18)]);
    expect(stats.pph).toBe(2); // 34 / 17
    expect(stats.holesCounted).toBe(17);
    expect(stats.roundsCounted).toBe(0);
    expect(stats.avgPuttsPerRound).toBeNull();
    expect(stats.nearMiss).toEqual({ partialRounds: 1, missingHoles: 1 });
  });

  it('18/18 complete: all cells populated, no near-miss', () => {
    const stats = computePuttsStats([full(2)]);
    expect(stats.pph).toBe(2);
    expect(stats.holesCounted).toBe(18);
    expect(stats.roundsCounted).toBe(1);
    expect(stats.avgPuttsPerRound).toBe(36);
    expect(stats.bestRoundPutts).toBe(36);
    expect(stats.nearMiss).toEqual({ partialRounds: 0, missingHoles: 0 });
  });

  it('fully-putted 9-hole round: PPH counts 9 holes, NOT partial, no qualifying round', () => {
    const stats = computePuttsStats([round(Array(9).fill(2), 9)]);
    expect(stats.pph).toBe(2);
    expect(stats.holesCounted).toBe(9);
    expect(stats.roundsCounted).toBe(0);
    expect(stats.nearMiss).toEqual({ partialRounds: 0, missingHoles: 0 });
  });

  it('mix of complete and partial: average over complete only, PPH over all, near-miss only partial', () => {
    // full(2) = 36 over 18; partial = 2 putts over 2 of 5 played holes.
    const stats = computePuttsStats([full(2), round([1, 1], 5)]);
    expect(stats.holesCounted).toBe(20);
    expect(stats.pph).toBe((36 + 2) / 20); // 1.9
    expect(stats.roundsCounted).toBe(1);
    expect(stats.avgPuttsPerRound).toBe(36);
    expect(stats.bestRoundPutts).toBe(36);
    expect(stats.nearMiss).toEqual({ partialRounds: 1, missingHoles: 3 });
  });

  it('putts = 0 on a hole counts as a recorded hole (0 is a value, not a gap)', () => {
    const stats = computePuttsStats([round([0, 1, 2], 3)]);
    expect(stats.holesCounted).toBe(3);
    expect(stats.pph).toBe(1); // (0 + 1 + 2) / 3
    expect(stats.nearMiss).toEqual({ partialRounds: 0, missingHoles: 0 });
  });

  it('a round with no putts recorded contributes nothing (no mas)', () => {
    const stats = computePuttsStats([round([], 18), full(2)]);
    expect(stats.holesCounted).toBe(18); // only the full round's holes
    expect(stats.nearMiss).toEqual({ partialRounds: 0, missingHoles: 0 });
  });

  it('averages complete rounds and tracks the best', () => {
    // 18×2 = 36, 18×1 = 18 → avg 27, best 18
    const stats = computePuttsStats([full(2), full(1)]);
    expect(stats.roundsCounted).toBe(2);
    expect(stats.avgPuttsPerRound).toBe(27);
    expect(stats.bestRoundPutts).toBe(18);
  });

  it('produces a fractional average when round totals differ', () => {
    const r35 = round([...Array(17).fill(2), 1], 18); // total 35
    expect(computePuttsStats([full(2), r35]).avgPuttsPerRound).toBe(35.5);
  });
});

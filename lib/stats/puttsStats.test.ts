import { describe, it, expect } from 'vitest';
import { computePuttsStats, type PuttsRoundInput } from './puttsStats';

/** Type-A: putte-snitt-beregning (#939). Kvalifiserende runde = putts på alle 18. */

const full = (perHole: number): PuttsRoundInput => ({
  recordedPutts: Array.from({ length: 18 }, () => perHole),
});

describe('computePuttsStats', () => {
  it('returns nulls and zero count when there are no rounds', () => {
    expect(computePuttsStats([])).toEqual({
      roundsCounted: 0,
      avgPuttsPerRound: null,
      bestRoundPutts: null,
    });
  });

  it('ignores rounds without putts on all 18 holes', () => {
    const partial: PuttsRoundInput = { recordedPutts: Array(17).fill(2) }; // 17 holes
    expect(computePuttsStats([partial])).toEqual({
      roundsCounted: 0,
      avgPuttsPerRound: null,
      bestRoundPutts: null,
    });
  });

  it('counts a single qualifying round (sum of its putts)', () => {
    // 18 holes × 2 putts = 36
    expect(computePuttsStats([full(2)])).toEqual({
      roundsCounted: 1,
      avgPuttsPerRound: 36,
      bestRoundPutts: 36,
    });
  });

  it('averages totals across qualifying rounds and tracks the best', () => {
    // round A: 18×2 = 36, round B: 18×1 = 18 → avg 27, best 18
    const stats = computePuttsStats([full(2), full(1)]);
    expect(stats.roundsCounted).toBe(2);
    expect(stats.avgPuttsPerRound).toBe(27);
    expect(stats.bestRoundPutts).toBe(18);
  });

  it('mixes qualifying and non-qualifying rounds — only full-18 count', () => {
    const partial: PuttsRoundInput = { recordedPutts: Array(10).fill(2) };
    const stats = computePuttsStats([full(2), partial, full(2)]);
    expect(stats.roundsCounted).toBe(2);
    expect(stats.avgPuttsPerRound).toBe(36);
    expect(stats.bestRoundPutts).toBe(36);
  });

  it('produces a fractional average when round totals differ', () => {
    // totals 36 and 35 → avg 35.5
    const r35: PuttsRoundInput = {
      recordedPutts: [...Array(17).fill(2), 1],
    };
    expect(computePuttsStats([full(2), r35]).avgPuttsPerRound).toBe(35.5);
  });
});

import { describe, it, expect } from 'vitest';
import { strokesForHole, allStrokeAllocations } from './strokeAllocation';

describe('strokesForHole', () => {
  it('HCP 18 gives 1 stroke on every hole', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesForHole(18, si)).toBe(1);
    }
  });

  it('HCP 0 gives no strokes', () => {
    expect(strokesForHole(0, 1)).toBe(0);
    expect(strokesForHole(0, 18)).toBe(0);
  });

  it('HCP 6: strokes on SI 1..6 only', () => {
    expect(strokesForHole(6, 1)).toBe(1);
    expect(strokesForHole(6, 6)).toBe(1);
    expect(strokesForHole(6, 7)).toBe(0);
    expect(strokesForHole(6, 18)).toBe(0);
  });

  it('HCP 31: SI 1..13 get 2, SI 14..18 get 1', () => {
    expect(strokesForHole(31, 1)).toBe(2);
    expect(strokesForHole(31, 13)).toBe(2);
    expect(strokesForHole(31, 14)).toBe(1);
    expect(strokesForHole(31, 18)).toBe(1);
  });

  it('plus handicap -2: SI 17 and 18 give -1 each', () => {
    expect(strokesForHole(-2, 17)).toBe(-1);
    expect(strokesForHole(-2, 18)).toBe(-1);
    expect(strokesForHole(-2, 16)).toBe(0);
    expect(strokesForHole(-2, 1)).toBe(0);
  });

  it('plus handicap -1: only SI 18 gives -1', () => {
    expect(strokesForHole(-1, 18)).toBe(-1);
    expect(strokesForHole(-1, 17)).toBe(0);
  });
});

describe('allStrokeAllocations', () => {
  it('returns map of 18 holes summing to handicap', () => {
    const result = allStrokeAllocations(31);
    expect(Object.keys(result).length).toBe(18);
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    expect(total).toBe(31);
  });

  it('sums to 0 for scratch', () => {
    const result = allStrokeAllocations(0);
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it('sums to negative handicap for plus golfer', () => {
    const result = allStrokeAllocations(-2);
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    expect(total).toBe(-2);
  });

  it.each([-18, -19, -20, -24, -36])(
    'sums to %i for plus golfer beyond -18',
    (ch) => {
      const result = allStrokeAllocations(ch);
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      expect(total).toBe(ch);
    }
  );
});

describe('strokesForHole — plus-handicap multi-round distribution', () => {
  it('HCP -18: -1 on every hole', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesForHole(-18, si)).toBe(-1);
    }
  });

  it('HCP -19: only SI 18 gets -2, rest get -1', () => {
    expect(strokesForHole(-19, 18)).toBe(-2);
    for (let si = 1; si <= 17; si++) {
      expect(strokesForHole(-19, si)).toBe(-1);
    }
  });

  it('HCP -20: SI 17 and 18 get -2, SI 1..16 get -1', () => {
    expect(strokesForHole(-20, 17)).toBe(-2);
    expect(strokesForHole(-20, 18)).toBe(-2);
    for (let si = 1; si <= 16; si++) {
      expect(strokesForHole(-20, si)).toBe(-1);
    }
  });

  it('HCP -24: SI 13..18 (6 easiest) get -2, SI 1..12 get -1', () => {
    // remainder = 24 % 18 = 6, threshold = 18 - 6 + 1 = 13
    for (let si = 13; si <= 18; si++) {
      expect(strokesForHole(-24, si)).toBe(-2);
    }
    for (let si = 1; si <= 12; si++) {
      expect(strokesForHole(-24, si)).toBe(-1);
    }
  });

  it('HCP -36: -2 on every hole (two full rounds)', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesForHole(-36, si)).toBe(-2);
    }
  });
});

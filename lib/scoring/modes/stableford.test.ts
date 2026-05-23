import { describe, it, expect } from 'vitest';
import { computeStablefordPoints } from './stableford';

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

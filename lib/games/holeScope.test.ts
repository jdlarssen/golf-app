import { describe, it, expect } from 'vitest';
import type { HoleSegment } from '@/lib/scoring';
import {
  holeNumbersForSegment,
  holeCountForSegment,
  firstHoleForSegment,
  lastHoleForSegment,
  isHoleInSegment,
  firstHalfHoleNumbersForSegment,
} from './holeScope';

describe('holeNumbersForSegment', () => {
  it.each<{ segment: HoleSegment; expected: number[] }>([
    { segment: 'full', expected: Array.from({ length: 18 }, (_, i) => i + 1) },
    { segment: 'front9', expected: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { segment: 'back9', expected: [10, 11, 12, 13, 14, 15, 16, 17, 18] },
  ])('$segment → $expected', ({ segment, expected }) => {
    expect(holeNumbersForSegment(segment)).toEqual(expected);
  });
});

describe('holeCountForSegment', () => {
  it.each<{ segment: HoleSegment; expected: number }>([
    { segment: 'full', expected: 18 },
    { segment: 'front9', expected: 9 },
    { segment: 'back9', expected: 9 },
  ])('$segment → $expected holes', ({ segment, expected }) => {
    expect(holeCountForSegment(segment)).toBe(expected);
  });
});

describe('firstHoleForSegment / lastHoleForSegment', () => {
  it.each<{ segment: HoleSegment; first: number; last: number }>([
    { segment: 'full', first: 1, last: 18 },
    { segment: 'front9', first: 1, last: 9 },
    { segment: 'back9', first: 10, last: 18 },
  ])('$segment → first $first, last $last', ({ segment, first, last }) => {
    expect(firstHoleForSegment(segment)).toBe(first);
    expect(lastHoleForSegment(segment)).toBe(last);
  });
});

describe('isHoleInSegment', () => {
  it.each<{ segment: HoleSegment; holeNumber: number; expected: boolean }>([
    { segment: 'full', holeNumber: 1, expected: true },
    { segment: 'full', holeNumber: 18, expected: true },
    { segment: 'front9', holeNumber: 9, expected: true },
    { segment: 'front9', holeNumber: 10, expected: false },
    { segment: 'back9', holeNumber: 9, expected: false },
    { segment: 'back9', holeNumber: 10, expected: true },
    { segment: 'back9', holeNumber: 18, expected: true },
  ])('$segment / hole $holeNumber → $expected', ({ segment, holeNumber, expected }) => {
    expect(isHoleInSegment(holeNumber, segment)).toBe(expected);
  });
});

describe('firstHalfHoleNumbersForSegment', () => {
  it.each<{ segment: HoleSegment; expected: number[] }>([
    // 'full' must stay byte-identical to the pre-#1441 hardcoded FRONT_9
    // gate (lib/leaderboard/frontNineGate.ts) — the front 9 of 18.
    { segment: 'full', expected: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    // 9-hole segments round their "half" up to 5, not down to 4.
    { segment: 'front9', expected: [1, 2, 3, 4, 5] },
    { segment: 'back9', expected: [10, 11, 12, 13, 14] },
  ])('$segment → $expected', ({ segment, expected }) => {
    expect(firstHalfHoleNumbersForSegment(segment)).toEqual(expected);
  });
});

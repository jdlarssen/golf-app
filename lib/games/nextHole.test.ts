import { describe, it, expect } from 'vitest';
import { nextUnfilledHole, playOrder } from './nextHole';

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('nextUnfilledHole (#2253)', () => {
  it.each([
    ['full', new Set<number>(), 1],
    ['front9', new Set<number>(), 1],
    ['back9', new Set<number>(), 10],
  ] as const)('%s with nothing filled starts on the first hole of the segment', (segment, filled, next) => {
    expect(nextUnfilledHole(segment, filled)).toBe(next);
  });

  it('continues after the last filled hole', () => {
    expect(nextUnfilledHole('full', new Set(range(1, 6)))).toBe(7);
    expect(nextUnfilledHole('back9', new Set(range(10, 13)))).toBe(14);
  });

  it('goes back to an empty hole in the middle', () => {
    expect(nextUnfilledHole('full', new Set([1, 2, 3, 5, 6, 7]))).toBe(4);
  });

  it.each([
    ['full', range(1, 18)],
    ['front9', range(1, 9)],
    ['back9', range(10, 18)],
  ] as const)('%s with every hole filled → null', (segment, filled) => {
    expect(nextUnfilledHole(segment, new Set(filled))).toBeNull();
  });
});

describe('playOrder (#2286) — a shotgun group plays on from the hole it started on', () => {
  it.each([
    ['10, 11, 13, 14 started on 10', [10, 11, 13, 14], 10],
    ['15–18 and 1 started on 15', [15, 16, 17, 18, 1], 15],
    ['nothing played starts on 1', [], 1],
    ['a skipped hole (1, 3, 4) started on 1', [1, 3, 4], 1],
  ])('%s', (_label, filled, start) => {
    const order = playOrder('full', 'shotgun', new Set(filled));
    expect(order[0]).toBe(start);
    expect(order).toHaveLength(18);
    expect(new Set(order).size).toBe(18);
  });

  it('wraps round the segment', () => {
    expect(playOrder('full', 'shotgun', new Set([15, 16]))).toEqual([...range(15, 18), ...range(1, 14)]);
    expect(playOrder('back9', 'shotgun', new Set([16, 17]))).toEqual([16, 17, 18, 10, 11, 12, 13, 14, 15]);
  });

  it('a first-tee start keeps the hole order', () => {
    expect(playOrder('full', 'first_tee', new Set([10, 11, 13, 14]))).toEqual(range(1, 18));
    expect(playOrder('back9', 'first_tee', new Set([16]))).toEqual(range(10, 18));
  });

  it('nextUnfilledHole follows it in a shotgun, and is unchanged without one', () => {
    expect(nextUnfilledHole('full', new Set([10, 11]), 'shotgun')).toBe(12);
    expect(nextUnfilledHole('full', new Set([15, 16, 17, 18]), 'shotgun')).toBe(1);
    expect(nextUnfilledHole('full', new Set([10, 11, 13, 14]), 'shotgun')).toBe(12);
    expect(nextUnfilledHole('full', new Set(), 'shotgun')).toBe(1);
    expect(nextUnfilledHole('full', new Set(range(1, 18)), 'shotgun')).toBeNull();
    expect(nextUnfilledHole('full', new Set([10, 11]))).toBe(1);
  });
});


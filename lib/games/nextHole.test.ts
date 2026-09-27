import { describe, it, expect } from 'vitest';
import { nextUnfilledHole } from './nextHole';

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

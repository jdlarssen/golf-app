import { describe, it, expect } from 'vitest';
import { holesForSegment } from './holeSegment';
import type { HoleSegment } from './holeSegment';

interface Hole {
  number: number;
  label: string;
}

function holes18(): Hole[] {
  return Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    label: `h${i + 1}`,
  }));
}

describe('holesForSegment', () => {
  it('full: returns every hole unfiltered', () => {
    const result = holesForSegment(holes18(), 'full');
    expect(result).toHaveLength(18);
    expect(result.map((h) => h.number)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
  });

  it('front9: keeps only hole numbers 1-9', () => {
    const result = holesForSegment(holes18(), 'front9');
    expect(result.map((h) => h.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('back9: keeps only hole numbers 10-18', () => {
    const result = holesForSegment(holes18(), 'back9');
    expect(result.map((h) => h.number)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
  });

  it('front9/back9 partition the full 18 with no overlap', () => {
    const front = holesForSegment(holes18(), 'front9');
    const back = holesForSegment(holes18(), 'back9');
    expect(front.length + back.length).toBe(18);
    const overlap = front.filter((f) =>
      back.some((b) => b.number === f.number),
    );
    expect(overlap).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = holes18();
    const before = [...input];
    holesForSegment(input, 'back9');
    expect(input).toEqual(before);
  });

  it('empty input: returns empty array for every segment', () => {
    const segments: HoleSegment[] = ['full', 'front9', 'back9'];
    for (const segment of segments) {
      expect(holesForSegment([], segment)).toEqual([]);
    }
  });

  it('is order-preserving, not sorting: caller-supplied order survives the filter', () => {
    const shuffled: Hole[] = [
      { number: 12, label: 'h12' },
      { number: 3, label: 'h3' },
      { number: 10, label: 'h10' },
      { number: 7, label: 'h7' },
    ];
    expect(holesForSegment(shuffled, 'back9').map((h) => h.number)).toEqual([
      12, 10,
    ]);
    expect(holesForSegment(shuffled, 'front9').map((h) => h.number)).toEqual([
      3, 7,
    ]);
  });

  it('front9/back9 ignore hole numbers outside 1-18 defensively (neither range claims them)', () => {
    const withJunk: Hole[] = [...holes18(), { number: 0, label: 'h0' }, { number: 19, label: 'h19' }];
    expect(holesForSegment(withJunk, 'front9').some((h) => h.number === 0)).toBe(false);
    expect(holesForSegment(withJunk, 'back9').some((h) => h.number === 19)).toBe(false);
    // 'full' still returns everything, junk included — it's a pure passthrough.
    expect(holesForSegment(withJunk, 'full')).toHaveLength(20);
  });
});

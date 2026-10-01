import { describe, it, expect } from 'vitest';
import { scoreTone, formatVsPar } from './scoreTone';

describe('scoreTone', () => {
  it('returns unset when score is null', () => {
    expect(scoreTone(null, 4)).toBe('unset');
  });

  it('returns under for eagle (2 under par)', () => {
    expect(scoreTone(2, 4)).toBe('under');
  });

  it('returns under for birdie (1 under par)', () => {
    expect(scoreTone(3, 4)).toBe('under');
  });

  it('returns par when score equals par', () => {
    expect(scoreTone(4, 4)).toBe('par');
  });

  it('returns over1 for bogey (1 over par)', () => {
    expect(scoreTone(5, 4)).toBe('over1');
  });

  it('returns over2 for double bogey (2 over par)', () => {
    expect(scoreTone(6, 4)).toBe('over2');
  });

  it('returns over2 for triple bogey (3 over par)', () => {
    expect(scoreTone(7, 4)).toBe('over2');
  });

  it('handles par 3 boundaries', () => {
    expect(scoreTone(2, 3)).toBe('under');
    expect(scoreTone(3, 3)).toBe('par');
    expect(scoreTone(4, 3)).toBe('over1');
    expect(scoreTone(5, 3)).toBe('over2');
  });

  it('handles par 5 boundaries', () => {
    expect(scoreTone(3, 5)).toBe('under');
    expect(scoreTone(5, 5)).toBe('par');
    expect(scoreTone(6, 5)).toBe('over1');
    expect(scoreTone(7, 5)).toBe('over2');
  });
});

describe('formatVsPar', () => {
  // The hyphen-minus to-par label (#2225): one home for the leaderboard
  // surfaces that wrote it by hand. The U+2212 variant in
  // lib/leaderboard/vsPar.ts is a different, deliberate label.
  it.each([
    [null, '—'],
    [0, 'E'],
    [-1, '-1'],
    [-2, '-2'],
    [1, '+1'],
    [2, '+2'],
    [3, '+3'],
  ] as const)('formatVsPar(%s) → %s', (diff, label) => {
    expect(formatVsPar(diff)).toBe(label);
  });
});

import { describe, it, expect } from 'vitest';
import { scoreShape } from './scoreShape';

describe('scoreShape', () => {
  it('returns none for null score', () => {
    expect(scoreShape(null, 4)).toBe('none');
  });

  it('returns none for par', () => {
    expect(scoreShape(4, 4)).toBe('none');
    expect(scoreShape(3, 3)).toBe('none');
    expect(scoreShape(5, 5)).toBe('none');
  });

  it('returns circle for birdie (1 under)', () => {
    expect(scoreShape(3, 4)).toBe('circle');
    expect(scoreShape(2, 3)).toBe('circle');
  });

  it('returns double-circle for eagle (2 under)', () => {
    expect(scoreShape(2, 4)).toBe('double-circle');
    expect(scoreShape(3, 5)).toBe('double-circle');
    expect(scoreShape(1, 3)).toBe('double-circle');
  });

  it('returns square for bogey (1 over)', () => {
    expect(scoreShape(5, 4)).toBe('square');
    expect(scoreShape(4, 3)).toBe('square');
  });

  it('returns double-square for double bogey (2 over)', () => {
    expect(scoreShape(6, 4)).toBe('double-square');
    expect(scoreShape(5, 3)).toBe('double-square');
  });

  // #2635 (owner, 24.10: «Maks to»): an eagle or better keeps two circles and
  // a double bogey or worse keeps two squares, so no score draws more than two.
  const CAPPED = [
    [-4, 'double-circle'],
    [-3, 'double-circle'],
    [-2, 'double-circle'],
    [-1, 'circle'],
    [0, 'none'],
    [1, 'square'],
    [2, 'double-square'],
    [3, 'double-square'],
    [4, 'double-square'],
    [7, 'double-square'],
  ] as const;

  describe.each([3, 4, 5])('at most two shapes on par %i (#2635)', (par) => {
    // A score is at least one stroke, so −4 drops out on a par 4 and −3 on a par 3.
    it.each(CAPPED.filter(([diff]) => par + diff >= 1))('%i against par gives %s', (diff, shape) => {
      expect(scoreShape(par + diff, par)).toBe(shape);
    });
  });
});

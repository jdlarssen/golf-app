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

  it('returns double-circle for eagle or better (2+ under)', () => {
    expect(scoreShape(2, 4)).toBe('double-circle');
    expect(scoreShape(1, 4)).toBe('double-circle');
    expect(scoreShape(1, 5)).toBe('double-circle');
  });

  it('returns square for bogey (1 over)', () => {
    expect(scoreShape(5, 4)).toBe('square');
    expect(scoreShape(4, 3)).toBe('square');
  });

  it('returns double-square for double bogey or worse (2+ over)', () => {
    expect(scoreShape(6, 4)).toBe('double-square');
    expect(scoreShape(8, 4)).toBe('double-square');
    expect(scoreShape(15, 4)).toBe('double-square');
  });
});

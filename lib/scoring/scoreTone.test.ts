import { describe, it, expect } from 'vitest';
import { scoreTone, deltaLabel } from './scoreTone';

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

describe('deltaLabel', () => {
  it('returns em-dash when score is null', () => {
    expect(deltaLabel(null, 4)).toBe('—');
  });

  it('returns E when score equals par', () => {
    expect(deltaLabel(4, 4)).toBe('E');
  });

  it('returns negative number string for under par', () => {
    expect(deltaLabel(3, 4)).toBe('-1');
    expect(deltaLabel(2, 4)).toBe('-2');
  });

  it('returns plus-prefixed string for over par', () => {
    expect(deltaLabel(5, 4)).toBe('+1');
    expect(deltaLabel(6, 4)).toBe('+2');
    expect(deltaLabel(7, 4)).toBe('+3');
  });

  it('handles par 3 labels', () => {
    expect(deltaLabel(2, 3)).toBe('-1');
    expect(deltaLabel(3, 3)).toBe('E');
    expect(deltaLabel(4, 3)).toBe('+1');
    expect(deltaLabel(5, 3)).toBe('+2');
  });

  it('handles par 5 labels', () => {
    expect(deltaLabel(3, 5)).toBe('-2');
    expect(deltaLabel(5, 5)).toBe('E');
    expect(deltaLabel(7, 5)).toBe('+2');
  });
});

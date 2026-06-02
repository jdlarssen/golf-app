import { describe, it, expect } from 'vitest';
import { toSignedHcp, fromSignedHcp, formatGolfboxHcp } from './sign';

describe('toSignedHcp', () => {
  it.each([
    [1.5, true, -1.5],
    [12.4, false, 12.4],
    [0, true, 0],
    [0, false, 0],
    [10, true, -10],
    [54, false, 54],
  ])('magnitude %s plus=%s → %s', (mag, plus, expected) => {
    expect(toSignedHcp(mag, plus)).toBe(expected);
  });

  it('gir ikke −0 for «pluss 0»', () => {
    expect(Object.is(toSignedHcp(0, true), -0)).toBe(false);
  });
});

describe('fromSignedHcp', () => {
  it.each([
    [-1.5, 1.5, true],
    [12.4, 12.4, false],
    [0, 0, false],
    [-10, 10, true],
  ])('signert %s → magnitude %s plus=%s', (signed, mag, plus) => {
    expect(fromSignedHcp(signed)).toEqual({ magnitude: mag, isPlus: plus });
  });
});

describe('formatGolfboxHcp', () => {
  it.each([
    [1.5, true, '+1,5'],
    [12.4, false, '12,4'],
    [25, false, '25'],
    [0, false, '0'],
    [0, true, '0'],
  ])('magnitude %s plus=%s → «%s»', (mag, plus, expected) => {
    expect(formatGolfboxHcp(mag, plus)).toBe(expected);
  });
});

describe('round-trip', () => {
  it.each([-1.5, 0, 12.4, 54, -10])('fromSignedHcp ∘ toSignedHcp = identitet for %s', (signed) => {
    const { magnitude, isPlus } = fromSignedHcp(signed);
    expect(toSignedHcp(magnitude, isPlus)).toBe(signed);
  });
});

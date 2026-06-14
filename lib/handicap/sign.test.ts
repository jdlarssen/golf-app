import { describe, it, expect } from 'vitest';
import {
  toSignedHcp,
  fromSignedHcp,
  formatGolfboxHcp,
  formatHcpDisplay,
} from './sign';

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
  // Default locale ('no'): comma decimal, byte-identical to legacy behaviour.
  it.each([
    [1.5, true, '+1,5'],
    [12.4, false, '12,4'],
    [25, false, '25'],
    [0, false, '0'],
    [0, true, '0'],
  ])('magnitude %s plus=%s → «%s»', (mag, plus, expected) => {
    expect(formatGolfboxHcp(mag, plus)).toBe(expected);
  });

  // English: period decimal separator, otherwise identical echo semantics —
  // no forced one-decimal (mirrors what the user is typing).
  it.each([
    [1.5, true, '+1.5'],
    [12.4, false, '12.4'],
    [25, false, '25'],
    [0, true, '0'],
  ])("'en': magnitude %s plus=%s → «%s»", (mag, plus, expected) => {
    expect(formatGolfboxHcp(mag, plus, 'en')).toBe(expected);
  });

  it("explicit 'no' locale matches the default", () => {
    expect(formatGolfboxHcp(12.4, false, 'no')).toBe('12,4');
  });
});

describe('round-trip', () => {
  it.each([-1.5, 0, 12.4, 54, -10])('fromSignedHcp ∘ toSignedHcp = identitet for %s', (signed) => {
    const { magnitude, isPlus } = fromSignedHcp(signed);
    expect(toSignedHcp(magnitude, isPlus)).toBe(signed);
  });
});

describe('formatHcpDisplay', () => {
  // Norwegian: comma decimal, always one decimal, plus-handicap (stored
  // negative) shows «+», scratch (0) shows no sign.
  it.each([
    [12.2, '12,2'],
    [24.5, '24,5'],
    [-8, '+8,0'], // plusshandicap, lagret negativt → «+8,0» (én desimal)
    [-1.5, '+1,5'],
    [0, '0,0'], // scratch — ingen pluss
    [25, '25,0'], // heltalls-magnitude → tvinges til én desimal
  ])('norsk: signert %s → «%s»', (signed, expected) => {
    expect(formatHcpDisplay(signed, 'no')).toBe(expected);
  });

  // English: period decimal, same one-decimal + plus-sign convention.
  it.each([
    [12.2, '12.2'],
    [-8, '+8.0'],
    [0, '0.0'],
  ])('engelsk: signert %s → «%s»', (signed, expected) => {
    expect(formatHcpDisplay(signed, 'en')).toBe(expected);
  });
});

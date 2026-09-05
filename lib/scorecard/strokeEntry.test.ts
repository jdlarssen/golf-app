import { describe, it, expect } from 'vitest';
import {
  MAX_STROKES,
  MIN_STROKES,
  firstEntryStrokes,
  nextStrokes,
} from './strokeEntry';

describe('nextStrokes', () => {
  it.each([
    // Fra tomt kort er par baselinjen — ikke 0. Ett tapp på «+» gir bogey,
    // ett på «−» gir birdie, som på webbens kort.
    { current: null, par: 4, delta: 1, expected: 5 },
    { current: null, par: 4, delta: -1, expected: 3 },
    { current: null, par: 3, delta: 1, expected: 4 },
    { current: null, par: 5, delta: -1, expected: 4 },
    // Med en verdi satt stepper vi fra den.
    { current: 6, par: 4, delta: 1, expected: 7 },
    { current: 6, par: 4, delta: -1, expected: 5 },
    // Clamp i begge ender.
    { current: MAX_STROKES, par: 4, delta: 1, expected: MAX_STROKES },
    { current: MIN_STROKES, par: 4, delta: -1, expected: MIN_STROKES },
    // «−» tar deg aldri til tomt: MIN er gulvet. Nullstilling er «Angre».
    { current: 1, par: 3, delta: -1, expected: MIN_STROKES },
  ])(
    'current=$current par=$par delta=$delta → $expected',
    ({ current, par, delta, expected }) => {
      expect(nextStrokes({ current, par, delta })).toBe(expected);
    },
  );

  it.each([
    // Defensivt: en par-verdi utenfor [MIN, MAX] skal klemmes, ikke kaste.
    // Ingen bane har par 0 eller par 30, men hjelperen er den siste porten
    // før tallet skrives, og et kast her ville tatt hele hull-skjermen.
    { current: null, par: 0, delta: -1, expected: MIN_STROKES },
    { current: null, par: 99, delta: 1, expected: MAX_STROKES },
  ])(
    'defensivt: current=$current par=$par delta=$delta → $expected',
    ({ current, par, delta, expected }) => {
      expect(nextStrokes({ current, par, delta })).toBe(expected);
    },
  );
});

describe('firstEntryStrokes', () => {
  it.each([
    { par: 3, expected: 3 },
    { par: 4, expected: 4 },
    { par: 5, expected: 5 },
  ])('par $par → $expected', ({ par, expected }) => {
    expect(firstEntryStrokes(par)).toBe(expected);
  });

  it.each([
    { par: 0, expected: MIN_STROKES },
    { par: 99, expected: MAX_STROKES },
  ])('defensivt: par $par → $expected', ({ par, expected }) => {
    expect(firstEntryStrokes(par)).toBe(expected);
  });
});

describe('grensene', () => {
  it('er webbens: 1 til 15', () => {
    expect([MIN_STROKES, MAX_STROKES]).toEqual([1, 15]);
  });
});

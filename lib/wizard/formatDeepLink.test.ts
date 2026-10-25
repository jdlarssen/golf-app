/**
 * Type-A tests for parseFormatDeepLink (#2328): `?format=…&antall=…` from the
 * format helper on /spillformater into the Kompis wizard.
 */

import { describe, expect, it } from 'vitest';
import { parseFormatDeepLink } from './formatDeepLink';

const KOMPIS = ['texas_scramble', 'wolf', 'stableford', 'singles_matchplay'];

describe('parseFormatDeepLink', () => {
  it('no format → null', () => {
    expect(parseFormatDeepLink({ format: undefined, antall: '4' }, KOMPIS)).toBeNull();
    expect(parseFormatDeepLink({ format: '', antall: undefined }, KOMPIS)).toBeNull();
  });

  it('a format outside the Kompis catalog → null', () => {
    expect(parseFormatDeepLink({ format: 'finnes_ikke', antall: undefined }, KOMPIS)).toBeNull();
    expect(parseFormatDeepLink({ format: 'ambrose', antall: '4' }, KOMPIS)).toBeNull();
  });

  it('a format with a count it fits → both', () => {
    expect(parseFormatDeepLink({ format: 'texas_scramble', antall: '4' }, KOMPIS)).toEqual({
      gameMode: 'texas_scramble',
      expectedPlayerCount: 4,
    });
  });

  it('no count → the format without a count', () => {
    expect(parseFormatDeepLink({ format: 'texas_scramble', antall: undefined }, KOMPIS)).toEqual({
      gameMode: 'texas_scramble',
      expectedPlayerCount: null,
    });
  });

  it.each([
    ['a count the format does not fit', 'wolf', '9'],
    ['one below the format minimum', 'texas_scramble', '3'],
    ['zero', 'stableford', '0'],
    ['negative', 'stableford', '-2'],
    ['above the team format cap', 'stableford', '41'],
    ['a decimal', 'stableford', '4.5'],
    ['not a number', 'stableford', 'fire'],
    ['a number with trailing text', 'stableford', '4x'],
    ['empty', 'stableford', ''],
  ])('%s → the format without a count', (_, format, antall) => {
    expect(parseFormatDeepLink({ format, antall }, KOMPIS)).toEqual({
      gameMode: format,
      expectedPlayerCount: null,
    });
  });

  it('the boundaries 1 and 40 count when the format fits them', () => {
    expect(parseFormatDeepLink({ format: 'stableford', antall: '1' }, KOMPIS)?.expectedPlayerCount).toBe(1);
    expect(parseFormatDeepLink({ format: 'stableford', antall: '40' }, KOMPIS)?.expectedPlayerCount).toBe(40);
  });
});

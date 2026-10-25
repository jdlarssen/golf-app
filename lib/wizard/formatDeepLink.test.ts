/**
 * Type-A tests for parseFormatDeepLink (#2328): `?format=…&antall=…` from the
 * format helper on /spillformater into the Kompis wizard. And for
 * resolveWizardDeepLink (#2331): the order between `?format=` and the guides'
 * `?oppsett=`, and the prefill sources that beat both.
 */

import { describe, expect, it } from 'vitest';
import { parseFormatDeepLink, resolveWizardDeepLink, type WizardDeepLinkParams } from './formatDeepLink';

const KOMPIS = ['texas_scramble', 'wolf', 'stableford', 'singles_matchplay', 'skins'];

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

const NONE: WizardDeepLinkParams = {
  oppsett: undefined,
  format: undefined,
  antall: undefined,
  fra: undefined,
  bane: undefined,
  klubb: undefined,
  intent: undefined,
};

describe('resolveWizardDeepLink', () => {
  it('nothing set → null', () => {
    expect(resolveWizardDeepLink(NONE, KOMPIS)).toBeNull();
  });

  it.each([
    ['firmagolf', 'texas_scramble', 4],
    ['vennegjeng', 'skins', 1],
    ['klubbkveld', 'stableford', 1],
  ])('?oppsett=%s → the setup %s with team size %i', (oppsett, gameMode, teamSize) => {
    expect(resolveWizardDeepLink({ ...NONE, oppsett }, KOMPIS)).toEqual({
      kind: 'preset',
      audience: oppsett,
      gameMode,
      teamSize,
    });
  });

  it('?oppsett= beats ?format= when both are set', () => {
    expect(
      resolveWizardDeepLink({ ...NONE, oppsett: 'firmagolf', format: 'wolf', antall: '4' }, KOMPIS),
    ).toMatchObject({ kind: 'preset', gameMode: 'texas_scramble' });
  });

  it('an unknown ?oppsett= falls through to ?format=, or to null', () => {
    expect(resolveWizardDeepLink({ ...NONE, oppsett: 'tull', format: 'wolf' }, KOMPIS)).toEqual({
      kind: 'format',
      gameMode: 'wolf',
      expectedPlayerCount: null,
    });
    expect(resolveWizardDeepLink({ ...NONE, oppsett: 'tull' }, KOMPIS)).toBeNull();
  });

  it('a setup whose format is not in the Kompis catalog → null', () => {
    expect(resolveWizardDeepLink({ ...NONE, oppsett: 'vennegjeng' }, ['stableford'])).toBeNull();
  });

  it.each([
    ['fra', { fra: 'game-id' }],
    ['bane', { bane: 'course-id' }],
    ['klubb', { klubb: 'club-id' }],
  ])('?%s= beats both suggestion links', (_, prefill) => {
    expect(
      resolveWizardDeepLink({ ...NONE, ...prefill, oppsett: 'firmagolf', format: 'wolf' }, KOMPIS),
    ).toBeNull();
  });

  it('any ?intent= turns the setup off; only kompis keeps ?format=', () => {
    expect(resolveWizardDeepLink({ ...NONE, oppsett: 'firmagolf', intent: 'kompis' }, KOMPIS)).toBeNull();
    expect(resolveWizardDeepLink({ ...NONE, oppsett: 'firmagolf', intent: 'cup' }, KOMPIS)).toBeNull();
    expect(
      resolveWizardDeepLink({ ...NONE, format: 'wolf', intent: 'kompis' }, KOMPIS),
    ).toMatchObject({ kind: 'format', gameMode: 'wolf' });
    expect(resolveWizardDeepLink({ ...NONE, format: 'wolf', intent: 'klubb' }, KOMPIS)).toBeNull();
  });
});

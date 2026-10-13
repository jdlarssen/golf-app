// #2228: the wolf choice rules have one home, shared by the web's
// setWolfChoice action and the native app's choices.ts. Cases moved from the
// native choices.test.ts.
import { describe, it, expect } from 'vitest';
import {
  isPlayableHole,
  validateWolfChoice,
  type WolfChoiceValidationInput,
} from './validateWolfChoice';

const ME = 'user-me';
const MATE = 'user-mate';

function wolfWrite(over: Partial<WolfChoiceValidationInput> = {}): WolfChoiceValidationInput {
  return {
    holeNumber: 7,
    wolfUserId: ME,
    choice: 'partner',
    partnerUserId: MATE,
    ...over,
  };
}

describe('validateWolfChoice', () => {
  const VALID: [string, Partial<WolfChoiceValidationInput>][] = [
    ['partner på hull 1', { holeNumber: 1 }],
    ['partner på hull 18', { holeNumber: 18 }],
    ['lone uten partner', { choice: 'lone', partnerUserId: null }],
    ['blind uten partner', { choice: 'blind', partnerUserId: null }],
  ];

  const INVALID: [string, Partial<WolfChoiceValidationInput>, string][] = [
    ['hull 0', { holeNumber: 0 }, 'invalid_hole'],
    ['hull 19', { holeNumber: 19 }, 'invalid_hole'],
    ['et halvt hull', { holeNumber: 7.5 }, 'invalid_hole'],
    // Bare en manipulert/utdatert klient kan sende dette — typen tillater det
    // ikke, men vakten skal stå der uansett.
    ['ukjent valg', { choice: 'solo' as never }, 'invalid_choice'],
    ['partner uten partner', { choice: 'partner', partnerUserId: null }, 'partner_required'],
    ['lone med partner', { choice: 'lone', partnerUserId: MATE }, 'partner_must_be_null'],
    ['blind med partner', { choice: 'blind', partnerUserId: MATE }, 'partner_must_be_null'],
    ['wolfen som sin egen partner', { partnerUserId: ME }, 'partner_cannot_be_wolf'],
  ];

  it.each(VALID)('godtar %s', (_label, over) => {
    expect(validateWolfChoice(wolfWrite(over))).toBeNull();
  });

  it.each(INVALID)('avviser %s', (_label, over, error) => {
    expect(validateWolfChoice(wolfWrite(over))).toBe(error);
  });
});

describe('isPlayableHole', () => {
  it.each<[number, boolean]>([
    [0, false],
    [1, true],
    [18, true],
    [19, false],
    [1.5, false],
  ])('hull %s → %s', (holeNumber, expected) => {
    expect(isPlayableHole(holeNumber)).toBe(expected);
  });
});

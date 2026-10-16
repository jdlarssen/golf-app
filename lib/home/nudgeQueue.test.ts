import { describe, it, expect } from 'vitest';
import {
  NUDGE_PRIORITY,
  resolveVisibleNudge,
  type NudgeSlotStatus,
} from './nudgeQueue';

const statuses = (
  aiConsent: NudgeSlotStatus,
  install: NudgeSlotStatus,
  push: NudgeSlotStatus,
  kavalkade: NudgeSlotStatus,
  productUpdate: NudgeSlotStatus,
  passkey: NudgeSlotStatus,
) => ({ aiConsent, install, push, kavalkade, productUpdate, passkey });

describe('resolveVisibleNudge', () => {
  it('has the contract-fixed priority order, with the AI question first (#2561) and Kavalkaden between Push and ProductUpdate (#2131)', () => {
    expect(NUDGE_PRIORITY).toEqual([
      'aiConsent',
      'install',
      'push',
      'kavalkade',
      'productUpdate',
      'passkey',
    ]);
  });

  // Ingenting vises før køen vet nok: en 'pending' høyere oppe blokkerer alle
  // under seg — det er dette som hindrer synlig banner-bytting ved sidelast.
  it.each([
    [statuses('no', 'pending', 'pending', 'pending', 'pending', 'pending'), null],
    [statuses('no', 'no', 'pending', 'no', 'yes', 'yes'), null],
    [statuses('no', 'pending', 'no', 'no', 'yes', 'no'), null],
    [statuses('no', 'no', 'no', 'no', 'pending', 'yes'), null],
  ] as const)('waits while a higher slot is undecided: %j → %s', (input, expected) => {
    expect(resolveVisibleNudge(input)).toBe(expected);
  });

  it.each([
    // #2561: spørsmålet om AI-tekster avgjøres på serveren og går foran alt,
    // også Install og Push som ennå ikke har avklart seg.
    [statuses('yes', 'pending', 'pending', 'pending', 'pending', 'pending'), 'aiConsent'],
    [statuses('yes', 'yes', 'yes', 'yes', 'yes', 'yes'), 'aiConsent'],
    // First 'yes' wins regardless of lower slots' state.
    [statuses('no', 'yes', 'pending', 'pending', 'pending', 'pending'), 'install'],
    [statuses('no', 'yes', 'no', 'yes', 'yes', 'yes'), 'install'],
    [statuses('no', 'no', 'yes', 'yes', 'yes', 'pending'), 'push'],
    // #2131: Kavalkaden går foran produktnytt og passkey, men aldri foran
    // Install/Push — de to er engangs-spørsmål som avklarer seg selv.
    [statuses('no', 'no', 'no', 'yes', 'yes', 'yes'), 'kavalkade'],
    [statuses('no', 'no', 'no', 'no', 'yes', 'yes'), 'productUpdate'],
    [statuses('no', 'no', 'no', 'no', 'no', 'yes'), 'passkey'],
  ] as const)('shows the highest-priority qualified slot: %j → %s', (input, expected) => {
    expect(resolveVisibleNudge(input)).toBe(expected);
  });

  it('shows nothing when every slot disqualified', () => {
    expect(
      resolveVisibleNudge(statuses('no', 'no', 'no', 'no', 'no', 'no')),
    ).toBeNull();
  });
});

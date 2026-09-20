import { describe, it, expect } from 'vitest';
import {
  NUDGE_PRIORITY,
  resolveVisibleNudge,
  type NudgeSlotStatus,
} from './nudgeQueue';

const statuses = (
  install: NudgeSlotStatus,
  push: NudgeSlotStatus,
  kavalkade: NudgeSlotStatus,
  productUpdate: NudgeSlotStatus,
  passkey: NudgeSlotStatus,
) => ({ install, push, kavalkade, productUpdate, passkey });

describe('resolveVisibleNudge', () => {
  it('has the contract-fixed priority order, with Kavalkaden between Push and ProductUpdate (#2131)', () => {
    expect(NUDGE_PRIORITY).toEqual([
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
    [statuses('pending', 'pending', 'pending', 'pending', 'pending'), null],
    [statuses('no', 'pending', 'no', 'yes', 'yes'), null],
    [statuses('pending', 'no', 'no', 'yes', 'no'), null],
    [statuses('no', 'no', 'no', 'pending', 'yes'), null],
  ] as const)('waits while a higher slot is undecided: %j → %s', (input, expected) => {
    expect(resolveVisibleNudge(input)).toBe(expected);
  });

  it.each([
    // First 'yes' wins regardless of lower slots' state.
    [statuses('yes', 'pending', 'pending', 'pending', 'pending'), 'install'],
    [statuses('yes', 'no', 'yes', 'yes', 'yes'), 'install'],
    [statuses('no', 'yes', 'yes', 'yes', 'pending'), 'push'],
    // #2131: Kavalkaden går foran produktnytt og passkey, men aldri foran
    // Install/Push — de to er engangs-spørsmål som avklarer seg selv.
    [statuses('no', 'no', 'yes', 'yes', 'yes'), 'kavalkade'],
    [statuses('no', 'no', 'no', 'yes', 'yes'), 'productUpdate'],
    [statuses('no', 'no', 'no', 'no', 'yes'), 'passkey'],
  ] as const)('shows the highest-priority qualified slot: %j → %s', (input, expected) => {
    expect(resolveVisibleNudge(input)).toBe(expected);
  });

  it('shows nothing when every slot disqualified', () => {
    expect(
      resolveVisibleNudge(statuses('no', 'no', 'no', 'no', 'no')),
    ).toBeNull();
  });
});

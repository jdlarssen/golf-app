import { describe, it, expect } from 'vitest';
import { isSideWinnerNotActive, SIDE_WINNER_NOT_ACTIVE } from './sideWinnerGuard';

/**
 * #2284: migration 0193 refuses a withdrawn (or absent) side-tournament winner
 * with P0001 + `side_winner_not_active`. Web and app both recognise it through
 * this one predicate (Type A).
 */
describe('isSideWinnerNotActive (#2284)', () => {
  it('matches the trigger’s P0001 + token', () => {
    expect(
      isSideWinnerNotActive({ code: 'P0001', message: SIDE_WINNER_NOT_ACTIVE }),
    ).toBe(true);
    expect(SIDE_WINNER_NOT_ACTIVE).toBe('side_winner_not_active');
  });

  it('does not match another P0001 raise', () => {
    expect(isSideWinnerNotActive({ code: 'P0001', message: 'sole_club_owner' })).toBe(false);
  });

  it('does not match an RLS denial', () => {
    expect(
      isSideWinnerNotActive({ code: '42501', message: SIDE_WINNER_NOT_ACTIVE }),
    ).toBe(false);
  });

  it('does not match no error', () => {
    expect(isSideWinnerNotActive(null)).toBe(false);
    expect(isSideWinnerNotActive(undefined)).toBe(false);
  });
});

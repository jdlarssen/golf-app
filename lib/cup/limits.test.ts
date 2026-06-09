import { describe, it, expect } from 'vitest';
import {
  MAX_PERSONAL_CUP_MATCHES,
  MAX_PERSONAL_CUP_PLAYERS,
  exceedsPersonalMatchCap,
  exceedsPersonalPlayerCap,
} from './limits';

describe('personal cup limits', () => {
  it('caps are the public kompis-sized values (#525/#526)', () => {
    expect(MAX_PERSONAL_CUP_MATCHES).toBe(4);
    expect(MAX_PERSONAL_CUP_PLAYERS).toBe(24);
  });

  describe('exceedsPersonalMatchCap', () => {
    it.each<[number, boolean, boolean]>([
      // [totalMatches, isAdmin, expected]
      [4, false, false], // at the cap → allowed
      [5, false, true], // over the cap → blocked
      [0, false, false],
      [1, false, false],
      [99, true, false], // admin is uncapped
      [5, true, false],
    ])('total=%i admin=%s → %s', (total, isAdmin, expected) => {
      expect(exceedsPersonalMatchCap(total, isAdmin)).toBe(expected);
    });
  });

  describe('exceedsPersonalPlayerCap', () => {
    it.each<[number, boolean, boolean]>([
      // [distinctPlayers, isAdmin, expected]
      [24, false, false], // at the cap → allowed
      [25, false, true], // over the cap → blocked
      [0, false, false],
      [16, false, false],
      [99, true, false], // admin is uncapped
      [25, true, false],
    ])('distinct=%i admin=%s → %s', (distinct, isAdmin, expected) => {
      expect(exceedsPersonalPlayerCap(distinct, isAdmin)).toBe(expected);
    });
  });
});

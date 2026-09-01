import { describe, it, expect } from 'vitest';
import {
  MAX_PERSONAL_CUP_MATCHES,
  MAX_PERSONAL_CUP_PLAYERS,
  exceedsPersonalMatchCap,
  exceedsPersonalPlayerCap,
} from './limits';

describe('personal cup limits', () => {
  it('caps fit a full Ryder Cup with 16-player teams (#1883)', () => {
    expect(MAX_PERSONAL_CUP_MATCHES).toBe(36);
    expect(MAX_PERSONAL_CUP_PLAYERS).toBe(40);
  });

  describe('exceedsPersonalMatchCap', () => {
    it.each<[number, boolean, boolean]>([
      // [totalMatches, isAdmin, expected]
      [36, false, false], // at the cap (#1883: raised from 16) → allowed
      [37, false, true], // over the cap → blocked
      [28, false, false], // the submitted 8+8+12 Ryder Cup setup
      [0, false, false],
      [1, false, false],
      [99, true, false], // admin is uncapped
      [37, true, false],
    ])('total=%i admin=%s → %s', (total, isAdmin, expected) => {
      expect(exceedsPersonalMatchCap(total, isAdmin)).toBe(expected);
    });
  });

  describe('exceedsPersonalPlayerCap', () => {
    it.each<[number, boolean, boolean]>([
      // [distinctPlayers, isAdmin, expected]
      [40, false, false], // at the cap → allowed
      [41, false, true], // over the cap → blocked
      [34, false, false], // 16+16 players + two captains
      [0, false, false],
      [16, false, false],
      [99, true, false], // admin is uncapped
      [41, true, false],
    ])('distinct=%i admin=%s → %s', (distinct, isAdmin, expected) => {
      expect(exceedsPersonalPlayerCap(distinct, isAdmin)).toBe(expected);
    });
  });
});

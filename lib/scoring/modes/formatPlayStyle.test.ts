import { describe, it, expect } from 'vitest';
import {
  formatPlayStyle,
  PLAY_STYLE_LABELS,
  type PlayStyle,
  type GameMode,
} from './types';

// #478/#498: format-kortene merkes med spillestil (Solo / Lag). Pott- og
// 1-mot-1-format er «Solo»; fleksible format (stableford-familien) viser begge.
// Ren klassifisering — testes uten DB.

describe('formatPlayStyle', () => {
  const cases: Array<[GameMode, PlayStyle]> = [
    // Ekte solo — spill alene / øv.
    ['solo_strokeplay', 'solo'],
    // Fleksible — kan spilles solo eller som 4BBB-lag.
    ['stableford', 'flexible'],
    ['modified_stableford', 'flexible'],
    // Hver for seg — flere spillere, ingen lag (pott-format + 1-mot-1).
    ['singles_matchplay', 'individual'],
    ['wolf', 'individual'],
    ['nassau', 'individual'],
    ['skins', 'individual'],
    ['bingo_bango_bongo', 'individual'],
    ['nines', 'individual'],
    ['round_robin', 'individual'],
    ['acey_deucey', 'individual'],
    // Lag — dere er gruppert på lag/side.
    ['best_ball', 'team'],
    ['texas_scramble', 'team'],
    ['ambrose', 'team'],
    ['florida_scramble', 'team'],
    ['fourball_matchplay', 'team'],
    ['foursomes_matchplay', 'team'],
    ['greensome_matchplay', 'team'],
    ['chapman_matchplay', 'team'],
    ['gruesome_matchplay', 'team'],
    ['shamble', 'team'],
    ['patsome', 'team'],
  ];

  it.each(cases)('klassifiserer %s som %s', (mode, expected) => {
    expect(formatPlayStyle(mode)).toBe(expected);
  });

  it('har en norsk label for hver spillestil', () => {
    // #498: «Hver for seg» slått sammen til «Solo».
    expect(PLAY_STYLE_LABELS).toEqual({
      solo: 'Solo',
      individual: 'Solo',
      team: 'Lag',
      flexible: 'Solo eller lag',
    });
  });
});

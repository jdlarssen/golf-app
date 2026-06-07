import { describe, it, expect } from 'vitest';
import {
  formatPlayStyle,
  PLAY_STYLE_LABELS,
  type PlayStyle,
  type GameMode,
} from './types';

// #478: format-kortene merkes med spillestil (Solo / Hver for seg / Lag), og
// fleksible format (stableford-familien) merkes «Solo eller lag». Ren
// klassifisering — testes uten DB.

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
    expect(PLAY_STYLE_LABELS).toEqual({
      solo: 'Solo',
      individual: 'Hver for seg',
      team: 'Lag',
      flexible: 'Solo eller lag',
    });
  });
});

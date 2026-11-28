import { describe, expect, it } from 'vitest';
import { BLOCKED_WORDS, containsBlockedWord, normaliseWords } from './blockedWords';

describe('normaliseWords', () => {
  it.each([
    ['Lørdagsrunden', ['lørdagsrunden']],
    ['  Høst-cupen 2026! ', ['høst', 'cupen', 'o']], // «2026» leaves an «o»: harmless
    ['F1tt3', ['fitte']],
    ['$lut', ['slut']],
    ['ÆØÅ', ['æøå']],
    ['', []],
  ])('%j → %j', (input, expected) => {
    expect(normaliseWords(input)).toEqual(expected);
  });
});

describe('containsBlockedWord', () => {
  it.each([
    ['Største fitte på banen'],
    ['KUK'],
    ['Drittsekken'],
    ['f.u.c.k'.replace(/\./g, '')],
    ['Taperpremie: n1gger'],
    ['hore-cupen'],
  ])('stops %j', (text) => {
    expect(containsBlockedWord(text)).toBe(true);
  });

  // Golf clubs and places whose names contain a blocked word inside a longer
  // word. Whole-word matching must let every one through.
  it.each([
    ['Fitjar Golfklubb'],
    ['Hoftun'],
    ['Kukkerud'],
    ['Grini Golfklubb'],
    ['Skjeberg Golfklubb'],
    ['Horten'],
    ['Pikkerud'],
    ['Scunthorpe'],
    ['Lørdagsrunden'],
    ['Gul tee'],
  ])('lets %j through', (text) => {
    expect(containsBlockedWord(text)).toBe(false);
  });

  it.each([[null], [undefined], ['']])('is false for %j', (text) => {
    expect(containsBlockedWord(text)).toBe(false);
  });
});

describe('BLOCKED_WORDS', () => {
  it('holds only normalised, unique words', () => {
    for (const word of BLOCKED_WORDS) {
      expect(normaliseWords(word)).toEqual([word]);
    }
    expect(new Set(BLOCKED_WORDS).size).toBe(BLOCKED_WORDS.length);
  });
});

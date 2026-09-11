import { describe, it, expect } from 'vitest';

import {
  MAX_TEAMS,
  MAX_TEAM_FORMAT_PLAYERS,
  fitsTeamFormat,
  teamSizesForMode,
  teamsShownForSize,
} from './teamFormatLimits';
import { TEAM_NUMBERS } from '@/app/[locale]/admin/games/new/useGameFormState';

// Lag-format-grensene bor i ÉN fil (#2009), men lag-rutenettet har sin egen
// TEAM_NUMBERS-tuppel fordi den må være en literal union for typing. Denne
// testen låser at de to er enige — AGENTS.md trap 4 («en regel har ett hjem»:
// når grensen bor flere steder, skal en test påstå at lagene stemmer overens).
describe('teamFormatLimits — lagene er enige', () => {
  it('MAX_TEAMS matcher lag-rutenettets TEAM_NUMBERS', () => {
    expect(TEAM_NUMBERS).toHaveLength(MAX_TEAMS);
    expect(TEAM_NUMBERS[TEAM_NUMBERS.length - 1]).toBe(MAX_TEAMS);
  });

  it('taket er fire lag à fire spillere', () => {
    expect(MAX_TEAM_FORMAT_PLAYERS).toBe(16);
  });
});

describe('teamSizesForMode', () => {
  it.each([
    ['texas_scramble', [2, 3, 4]],
    ['ambrose', [2, 3, 4]],
    ['florida_scramble', [3, 4]],
    ['shamble', [3, 4]],
  ] as const)('%s → %j', (mode, sizes) => {
    expect(teamSizesForMode(mode)).toEqual(sizes);
  });

  it('formater utenfor scramble-familien har ingen lagstørrelser her', () => {
    expect(teamSizesForMode('best_ball')).toEqual([]);
    expect(teamSizesForMode('wolf')).toEqual([]);
  });
});

describe('fitsTeamFormat — texas/ambrose (2, 3 eller 4 per lag)', () => {
  it.each([
    [0, false], // ingen spillere
    [2, false], // 1 lag à 2 — ett lag er ingen turnering
    [3, false], // 1 lag à 3
    [4, true], // 2 lag à 2
    [5, false], // går ikke opp
    [6, true], // 2 lag à 3 / 3 lag à 2
    [8, true], // 2 lag à 4 / 4 lag à 2
    [9, true], // 3 lag à 3
    [10, false], // ville krevd 5 lag à 2
    [12, true], // 4 lag à 3
    [15, false], // ville krevd 5 lag à 3
    [16, true], // 4 lag à 4
    [17, false], // over taket
  ])('n=%i → %s', (n, expected) => {
    expect(fitsTeamFormat('texas_scramble', n)).toBe(expected);
    expect(fitsTeamFormat('ambrose', n)).toBe(expected);
  });
});

describe('fitsTeamFormat — florida/shamble (3 eller 4 per lag)', () => {
  it.each([
    [4, false], // 1 lag à 4 — ingen turnering
    [6, true], // 2 lag à 3
    [8, true], // 2 lag à 4
    [9, true], // 3 lag à 3
    [12, true], // 4 lag à 3 / 3 lag à 4
    [16, true], // 4 lag à 4
    [17, false], // over taket
  ])('n=%i → %s', (n, expected) => {
    expect(fitsTeamFormat('florida_scramble', n)).toBe(expected);
    expect(fitsTeamFormat('shamble', n)).toBe(expected);
  });

  it('2-mannslag finnes ikke i florida/shamble', () => {
    expect(fitsTeamFormat('florida_scramble', 4)).toBe(false);
    expect(fitsTeamFormat('shamble', 10)).toBe(false);
  });
});

describe('teamsShownForSize', () => {
  it.each([
    [2, 4],
    [3, 4],
    [4, 4],
  ])('lagstørrelse %i → %i lag i rutenettet', (size, expected) => {
    expect(teamsShownForSize(size)).toBe(expected);
  });

  it('ugyldig lagstørrelse faller tilbake til fullt rutenett', () => {
    expect(teamsShownForSize(0)).toBe(MAX_TEAMS);
  });
});

import { describe, it, expect } from 'vitest';

import {
  MAX_TEAMS,
  MAX_TEAM_FORMAT_PLAYERS,
  MIN_TEAMS,
  fitsTeamFormat,
  randomDrawTeamCount,
  registrationSeatTeamSize,
  teamFormatPlayerCap,
  teamModePlayerCap,
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

describe('teamFormatPlayerCap — velgeren stopper der rutenettet er fullt', () => {
  it.each([
    [2, 8], // best ball, par-stableford, texas à 2
    [3, 12], // texas/ambrose/florida/shamble à 3 — bestillingen i #2009
    [4, 16],
  ])('lagstørrelse %i → %i spillere kan velges', (size, cap) => {
    expect(teamFormatPlayerCap(size)).toBe(cap);
  });

  it('taket er aldri større enn det validatoren leser', () => {
    for (const size of [2, 3, 4]) {
      expect(teamFormatPlayerCap(size)).toBeLessThanOrEqual(MAX_TEAM_FORMAT_PLAYERS);
    }
  });
});

// #2011: open self-registration stops at the same cap as the wizard — full
// teams across the whole grid. Best ball and patsome always play in pairs, so a
// lying `team_size` cannot widen the cap, and a missing one falls to the
// smallest supported size rather than the largest.
describe('teamModePlayerCap — åpen påmelding stopper der rutenettet er fullt (#2011)', () => {
  it.each([
    ['best_ball', 2, 8],
    ['patsome', 2, 8],
    ['texas_scramble', 2, 8],
    ['texas_scramble', 3, 12],
    ['texas_scramble', 4, 16],
    ['ambrose', 3, 12],
    ['florida_scramble', 3, 12],
    ['florida_scramble', 4, 16],
    ['shamble', 4, 16],
    ['texas_scramble', null, 8], // team_size missing → smallest supported size
    ['florida_scramble', null, 12],
    ['best_ball', 4, 8], // lying team_size — best ball is always pairs
    ['wolf', 1, null],
    ['stableford', 2, null],
    ['singles_matchplay', 1, null],
    ['fourball_matchplay', 2, null],
  ] as const)('%s à %s → %s', (mode, teamSize, cap) => {
    expect(teamModePlayerCap(mode, teamSize)).toBe(cap);
  });
});

// #2012: «Trekk tilfeldig» deals the players into teams of the size the
// organiser chose, and refuses whenever that would leave a leftover or need
// more teams than the grid has.
describe('registrationSeatTeamSize — plassene et lag holder av ved åpen påmelding (#2062)', () => {
  it.each([
    ['best_ball', undefined, 2],
    ['best_ball', 4, 2],
    ['patsome', null, 2],
    ['texas_scramble', 3, 3],
    ['texas_scramble', undefined, 2],
    ['texas_scramble', 5, 2],
    ['florida_scramble', 2, 3],
    ['shamble', 4, 4],
    ['wolf', 1, 1],
    ['stableford', undefined, 1],
  ] as const)('%s med team_size %s → %i', (mode, teamSize, expected) => {
    expect(registrationSeatTeamSize(mode, teamSize)).toBe(expected);
  });

  // Trap 4: the cap and the seats a team holds come from the same team size —
  // a missing or unsupported size must not make the cap tight and the seats loose.
  it.each([
    ['best_ball', undefined],
    ['patsome', 3],
    ['texas_scramble', undefined],
    ['texas_scramble', 3],
    ['florida_scramble', 2],
    ['shamble', 4],
  ] as const)('%s med team_size %s: taket er MAX_TEAMS × plassene', (mode, teamSize) => {
    expect(teamModePlayerCap(mode, teamSize)).toBe(
      Math.min(MAX_TEAMS * registrationSeatTeamSize(mode, teamSize), MAX_TEAM_FORMAT_PLAYERS),
    );
  });
});

describe('randomDrawTeamCount — trekningen følger valgt lagstørrelse (#2012)', () => {
  it.each([
    [2, 2, 1], // one pair — best ball has always allowed a single team
    [2, 8, 4],
    [2, 10, null], // divides, but five teams do not fit the grid
    [2, 12, null], // 12 picked at 3 per team, then switched to 2: six teams
    [3, 12, 4],
    [3, 10, null], // leftover player
    [3, 15, null], // five teams
    [4, 16, 4],
    [4, 12, 3],
    [1, 4, null], // solo has no teams
    [3, 0, null], // nobody picked
  ])('à %i med %i spillere → %s lag', (teamSize, n, expected) => {
    expect(randomDrawTeamCount(teamSize, n)).toBe(expected);
  });

  // AGENTS.md trap 4: the draw may never accept a scramble roster that the
  // format's own count rule rejects.
  it('godtar aldri en scramble-tropp som fitsTeamFormat avviser', () => {
    let checked = 0;
    for (const mode of ['texas_scramble', 'ambrose', 'florida_scramble', 'shamble'] as const) {
      for (const size of teamSizesForMode(mode)) {
        for (let n = 1; n <= 17; n++) {
          const teams = randomDrawTeamCount(size, n);
          if (teams !== null && teams >= MIN_TEAMS) {
            checked++;
            expect(fitsTeamFormat(mode, n), `${mode} à ${size}, n=${n}`).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

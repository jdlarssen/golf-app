import { describe, it, expect } from 'vitest';

import {
  MAX_TEAM_FORMAT_PLAYERS,
  MAX_TEAM_NUMBER,
  MIN_TEAMS,
  TEAM_FORMAT_PLAYER_CAP,
  defaultFlightForTeam,
  fitAssignmentsToGrid,
  fitsTeamFormat,
  maxTeamsForSize,
  organizerPlayerCap,
  randomDrawTeamCount,
  registrationSeatTeamSize,
  teamFormatPlayerCap,
  teamModePlayerCap,
  teamGridShape,
  teamGridSize,
  teamNumberRange,
  teamSizesForMode,
} from './teamFormatLimits';
import { registrationPlayerCap } from '@/lib/wizard/fitsPlayerCount';
import no from '@/messages/no.json';
import en from '@/messages/en.json';

// #2148: the cap is a player cap. The number of teams follows from the team
// size, and every reader — grid, validators, open registration — derives its
// numbers from `TEAM_FORMAT_PLAYER_CAP` (AGENTS.md trap 4).
describe('teamFormatLimits — ett spillertak (#2148)', () => {
  it('taket er 40 spillere, og validatorene leser det samme tallet', () => {
    expect(TEAM_FORMAT_PLAYER_CAP).toBe(40);
    expect(MAX_TEAM_FORMAT_PLAYERS).toBe(TEAM_FORMAT_PLAYER_CAP);
  });

  it.each([
    [2, 20],
    [3, 13],
    [4, 10],
  ])('lag à %i → %i lag', (size, teams) => {
    expect(maxTeamsForSize(size)).toBe(teams);
  });

  it('høyeste lagnummer er antall par', () => {
    expect(MAX_TEAM_NUMBER).toBe(20);
    expect(MAX_TEAM_NUMBER).toBe(maxTeamsForSize(2));
  });

  it('rutenettets største lagnummer er maxTeamsForSize for hver lagstørrelse', () => {
    for (const size of [2, 3, 4]) {
      expect(teamGridSize(1000, size)).toBe(maxTeamsForSize(size));
    }
  });
});

describe('teamGridSize — rutenettet vokser med valgte spillere', () => {
  it.each([
    [0, 2, 2],
    [1, 2, 2],
    [4, 2, 2],
    [5, 2, 3],
    [12, 2, 6],
    [40, 2, 20],
    [41, 2, 20],
    [10, 3, 4],
    [39, 3, 13],
    [40, 4, 10],
  ])('%i valgt à %i → %i lagkort', (selected, size, expected) => {
    expect(teamGridSize(selected, size)).toBe(expected);
  });
});

describe('teamNumberRange', () => {
  it('1..count', () => {
    expect(teamNumberRange(3)).toEqual([1, 2, 3]);
    expect(teamNumberRange(0)).toEqual([]);
    expect(teamNumberRange(MAX_TEAM_NUMBER)).toHaveLength(20);
  });
});

describe('defaultFlightForTeam — to par per startgruppe', () => {
  it('lag 1–6 → flight 1, 1, 2, 2, 3, 3', () => {
    expect([1, 2, 3, 4, 5, 6].map(defaultFlightForTeam)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('lag 20 → flight 10', () => {
    expect(defaultFlightForTeam(20)).toBe(10);
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
    [10, true], // 5 lag à 2 (#2148)
    [12, true], // 4 lag à 3
    [15, true], // 5 lag à 3
    [16, true], // 4 lag à 4
    [17, false], // går ikke opp
    [39, true], // 13 lag à 3
    [40, true], // 20 par / 10 lag à 4
    [41, false], // går ikke opp
    [42, false], // over taket (21 par / 14 lag à 3)
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
    [17, false], // går ikke opp
    [20, true], // 5 lag à 4
    [39, true], // 13 lag à 3
    [40, true], // 10 lag à 4
    [42, false], // 14 lag à 3 — over taket
    [44, false], // 11 lag à 4 — over taket
  ])('n=%i → %s', (n, expected) => {
    expect(fitsTeamFormat('florida_scramble', n)).toBe(expected);
    expect(fitsTeamFormat('shamble', n)).toBe(expected);
  });

  it('2-mannslag finnes ikke i florida/shamble', () => {
    expect(fitsTeamFormat('florida_scramble', 4)).toBe(false);
    expect(fitsTeamFormat('shamble', 10)).toBe(false);
  });
});

describe('teamFormatPlayerCap — velgeren stopper der rutenettet er fullt', () => {
  it.each([
    [2, 40], // best ball, par-stableford, texas à 2 — 20 par
    [3, 39], // 13 lag à 3
    [4, 40], // 10 lag à 4
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
    ['best_ball', 2, 40],
    ['patsome', 2, 40],
    ['texas_scramble', 2, 40],
    ['texas_scramble', 3, 39],
    ['texas_scramble', 4, 40],
    ['ambrose', 3, 39],
    ['florida_scramble', 3, 39],
    ['florida_scramble', 4, 40],
    ['shamble', 3, 39],
    ['shamble', 4, 40],
    ['texas_scramble', null, 40], // team_size missing → smallest supported size
    ['florida_scramble', null, 39],
    ['best_ball', 4, 40], // lying team_size — best ball is always pairs
    ['patsome', 3, 40],
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
  ] as const)('%s med team_size %s: taket er fulle lag à plassene', (mode, teamSize) => {
    const seats = registrationSeatTeamSize(mode, teamSize);
    expect(teamModePlayerCap(mode, teamSize)).toBe(maxTeamsForSize(seats) * seats);
  });
});

describe('randomDrawTeamCount — trekningen følger valgt lagstørrelse (#2012)', () => {
  it.each([
    [2, 2, 1], // one pair — best ball has always allowed a single team
    [2, 8, 4],
    [2, 10, 5], // five pairs (#2148)
    [2, 40, 20],
    [2, 42, null], // 21 pairs — over the cap
    [3, 12, 4],
    [3, 10, null], // leftover player
    [3, 15, 5],
    [3, 39, 13],
    [4, 16, 4],
    [4, 12, 3],
    [4, 40, 10],
    [4, 44, null], // eleven teams — over the cap
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
        for (let n = 1; n <= TEAM_FORMAT_PLAYER_CAP + 4; n++) {
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

// #2059: the organiser adds players and guests on the roster pages, open
// self-registration adds them through the signup link. Both must stop at the
// same number, or «fullt» means two things (AGENTS.md trap 4).
describe('organizerPlayerCap — arrangøren og påmeldingen stopper på samme tall (#2059)', () => {
  const TEAM_MODES = [
    ['texas_scramble', [2, 3, 4]],
    ['ambrose', [2, 3, 4]],
    ['florida_scramble', [3, 4]],
    ['shamble', [3, 4]],
    ['best_ball', [2]],
    ['patsome', [2]],
  ] as const;

  it.each(TEAM_MODES.flatMap(([mode, sizes]) => sizes.map((size) => [mode, size] as const)))(
    '%s à %i',
    (mode, size) => {
      const organizer = organizerPlayerCap(mode, { team_size: size });
      expect(organizer).not.toBeNull();
      expect(organizer).toBe(registrationPlayerCap(mode, { team_size: size }));
    },
  );

  it('uten mode_config faller begge til samme tak', () => {
    for (const [mode] of TEAM_MODES) {
      expect(organizerPlayerCap(mode, null), mode).toBe(registrationPlayerCap(mode, null));
    }
  });

  it('formater uten lag har ikke noe arrangørtak her', () => {
    expect(organizerPlayerCap('stableford', null)).toBeNull();
    expect(organizerPlayerCap('singles_matchplay', { team_size: 1 })).toBeNull();
  });
});

// #2075: the wizard's team descriptions must promise the grid it renders.
// #2148: the number of teams depends on the team size, so the texts take it as
// a parameter — a hard-coded count would drift the next time the cap moves.
describe('teamsDesc-tekstene lover like mange lag som rutenettet (#2075, #2148)', () => {
  const catalogs = [
    ['no', no.wizard.sections.teams],
    ['en', en.wizard.sections.teams],
  ] as const;

  it.each(catalogs)('%s', (_locale, teams) => {
    const keys = Object.keys(teams).filter(
      (k) => k.startsWith('teamsDesc') && k !== 'teamsDescTeamMatchplay',
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const text = teams[key as keyof typeof teams];
      expect(text, key).toContain('{maxTeams}');
      expect(text, key).not.toMatch(/\b(4|fire|four)\s+(lag|teams|par|pairs)\b/i);
    }
  });
});

/** Every assigned, selected player has a slot the grid draws (#2079). */
function everyAssignedPlayerVisible(
  teamByPlayer: Record<string, number>,
  selectedPlayerIds: readonly string[],
  shape: { slotsPerTeam: number; teamCount: number },
): boolean {
  const seen = new Map<number, number>();
  return selectedPlayerIds.every((pid) => {
    const team = teamByPlayer[pid];
    if (team === undefined) return true;
    const index = seen.get(team) ?? 0;
    seen.set(team, index + 1);
    return team <= shape.teamCount && index < shape.slotsPerTeam;
  });
}

/** `count` players `p1..pN` dealt in order into teams of `size`. */
function dealt(count: number, size: number) {
  const ids = Array.from({ length: count }, (_, i) => `p${i + 1}`);
  const teams: Record<string, number> = {};
  ids.forEach((pid, i) => {
    teams[pid] = Math.floor(i / size) + 1;
  });
  return { ids, teams };
}

function highestTeam(teams: Record<string, number>): number {
  return Math.max(0, ...Object.values(teams));
}

describe('teamGridShape — plasser og lagkort i rutenettet (#2079)', () => {
  it.each([
    ['texas_scramble', 2, 12, 2, 6],
    ['texas_scramble', 3, 12, 3, 4],
    ['texas_scramble', 4, 40, 4, 10],
    ['ambrose', 2, 4, 2, 2],
    ['ambrose', 3, 39, 3, 13],
    ['ambrose', 4, 16, 4, 4],
    ['florida_scramble', 3, 9, 3, 3],
    ['florida_scramble', 4, 16, 4, 4],
    ['shamble', 3, 12, 3, 4],
    ['shamble', 4, 8, 4, 2],
    ['best_ball', 2, 12, 2, 6],
    ['patsome', 2, 8, 2, 4],
    ['stableford', 2, 6, 2, 3],
    ['modified_stableford', 2, 40, 2, 20],
  ] as const)('%s à %i med %i valgt → %i plasser, %i lagkort', (mode, size, selected, slots, teams) => {
    expect(teamGridShape(mode, size, selected)).toEqual({ slotsPerTeam: slots, teamCount: teams });
  });

  it.each([
    'fourball_matchplay',
    'foursomes_matchplay',
    'greensome_matchplay',
    'chapman_matchplay',
    'gruesome_matchplay',
  ] as const)('%s har alltid to sider à 2', (mode) => {
    expect(teamGridShape(mode, 2, 12, 6)).toEqual({ slotsPerTeam: 2, teamCount: 2 });
  });

  it('et lag som alt har spillere vises selv om rutenettet ellers ville krympet (#2148)', () => {
    expect(teamGridShape('texas_scramble', 4, 12, 6)).toEqual({ slotsPerTeam: 4, teamCount: 6 });
  });
});

describe('fitAssignmentsToGrid — ingen fordelt spiller blir usynlig (#2079)', () => {
  it.each([
    // [label, mode, count, fromSize, toSize, kept]
    ['12 à 3 → par', 'texas_scramble', 12, 3, 2, 8],
    ['16 à 4 → à 3', 'texas_scramble', 16, 4, 3, 12],
    ['12 à 4 → par', 'ambrose', 12, 4, 2, 6],
    ['12 i seks par → à 4 (lagene med spillere står)', 'texas_scramble', 12, 2, 4, 12],
    ['Texas à 3 → best ball', 'best_ball', 12, 3, 2, 8],
    ['Texas à 2, fire lag → fourball (to sider)', 'fourball_matchplay', 8, 2, 2, 4],
  ] as const)('%s → %i beholdt', (_label, mode, count, fromSize, toSize, kept) => {
    const { ids, teams } = dealt(count, fromSize);
    const shape = teamGridShape(mode, toSize, ids.length, highestTeam(teams));
    const next = fitAssignmentsToGrid(teams, ids, shape);

    expect(Object.keys(next)).toHaveLength(kept);
    expect(everyAssignedPlayerVisible(next, ids, shape)).toBe(true);
    // Players who still fit keep the team they had.
    for (const [pid, team] of Object.entries(next)) {
      expect(teams[pid]).toBe(team);
    }
  });

  it('12 à 3 → par løser den tredje spilleren i hvert lag', () => {
    const { ids, teams } = dealt(12, 3);
    const next = fitAssignmentsToGrid(teams, ids, teamGridShape('texas_scramble', 2, 12, 4));
    expect(ids.filter((pid) => next[pid] === undefined)).toEqual(['p3', 'p6', 'p9', 'p12']);
  });

  it('alt passer → samme objekt tilbake', () => {
    const { ids, teams } = dealt(8, 2);
    const shape = teamGridShape('texas_scramble', 4, 8, highestTeam(teams));
    expect(fitAssignmentsToGrid(teams, ids, shape)).toBe(teams);
  });

  it('tomt kart → samme tomme kart', () => {
    const empty: Record<string, number> = {};
    expect(fitAssignmentsToGrid(empty, ['p1', 'p2'], teamGridShape('texas_scramble', 2, 2))).toBe(empty);
  });
});

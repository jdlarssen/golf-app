// #2262: hodet på scorekortet — «Byneset North · Gul tee · Stableford ·
// banehandicap 15».
//
// Handicapdelen er det som prøves: hodet skal vise tallet NETTO- og POENG-raden
// faktisk er regnet med, så tallene på kortet aldri motsier hodet.
import type { BundleGame } from '../data/gameBundle';
import {
  handicapPartText,
  scorecardHandicapPart,
  scorecardHeaderLine,
} from './scorecardHeader';

type Game = Pick<BundleGame, 'gameMode' | 'modeConfig'>;

const STABLEFORD: Game = {
  gameMode: 'stableford',
  modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
};
const FOURBALL_85: Game = {
  gameMode: 'fourball_matchplay',
  modeConfig: { kind: 'fourball_matchplay', team_size: 2, teams_count: 2, allowance_pct: 85 },
};
const SCRAMBLE: Game = {
  gameMode: 'texas_scramble',
  modeConfig: { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 25 },
};
const GREENSOME: Game = {
  gameMode: 'greensome_matchplay',
  modeConfig: { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 },
};

function part(
  game: Game,
  overrides: Partial<Parameters<typeof scorecardHandicapPart>[0]> = {},
) {
  return scorecardHandicapPart({
    game,
    courseHandicap: 15,
    teamMode: false,
    teamHandicap: null,
    revealActive: false,
    ...overrides,
  });
}

describe('scorecardHandicapPart', () => {
  it('stableford: banehandicap, for den er lik spillehandicapen', () => {
    expect(part(STABLEFORD)).toEqual({ kind: 'course', value: 15 });
  });

  it('fourball 85 %: spillehandicap, tallet slagene er fordelt fra', () => {
    expect(part(FOURBALL_85, { courseHandicap: 20 })).toEqual({ kind: 'playing', value: 17 });
  });

  it('scramble-lagkort: lagshandicap fra motoren', () => {
    expect(part(SCRAMBLE, { teamMode: true, teamHandicap: 10 })).toEqual({ kind: 'team', value: 10 });
  });

  it.each([
    { label: 'reveal-spill som pågår', game: STABLEFORD, overrides: { revealActive: true } },
    { label: 'ukjent banehandicap', game: STABLEFORD, overrides: { courseHandicap: null } },
    {
      label: 'config for et annet format',
      game: { gameMode: 'stableford', modeConfig: { kind: 'skins', team_size: 1 } },
      overrides: {},
    },
    { label: 'scramble uten tall fra motoren', game: SCRAMBLE, overrides: { teamMode: true } },
    {
      label: 'alternate shot-lagkort (slag per hull, ikke ett tall)',
      game: GREENSOME,
      overrides: { teamMode: true, teamHandicap: 12 },
    },
  ])('ingen handicapdel: $label', ({ game, overrides }) => {
    expect(part(game, overrides)).toBeNull();
  });
});

describe('handicapPartText', () => {
  it.each([
    { part: { kind: 'course', value: 15 }, text: 'banehandicap 15' },
    { part: { kind: 'playing', value: 17 }, text: 'spillehandicap 17' },
    { part: { kind: 'team', value: 3 }, text: 'lagshandicap 3' },
    { part: { kind: 'course', value: -2 }, text: 'banehandicap +2' },
    { part: { kind: 'course', value: 0 }, text: 'banehandicap 0' },
  ] as const)('$text', ({ part: value, text }) => {
    expect(handicapPartText(value)).toBe(text);
  });
});

describe('scorecardHeaderLine', () => {
  // #2385: som designet, uten kjønn i parentes.
  it('setter sammen bane, tee, format og handicap', () => {
    expect(
      scorecardHeaderLine({
        courseName: 'Byneset North',
        teeBoxName: 'Gul',
        gameMode: 'stableford',
        handicapPart: { kind: 'course', value: 15 },
      }),
    ).toBe('Byneset North · Gul tee · Stableford · banehandicap 15');
  });

  it('hopper over det som mangler', () => {
    expect(
      scorecardHeaderLine({
        courseName: null,
        teeBoxName: null,
        gameMode: 'solo_strokeplay',
        handicapPart: null,
      }),
    ).toBe('Slagspill');
  });
});

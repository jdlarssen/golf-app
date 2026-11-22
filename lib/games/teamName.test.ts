import { describe, expect, it } from 'vitest';
import { TEAM_NAME_MAX, TEAM_NAME_MIN } from '@/lib/games/registration';
import { suggestTeamName } from './teamName';

/** Type A (#2840): the team name the app's form starts with. */

describe('suggestTeamName', () => {
  it.each([
    ['Martin', 'Martins lag'],
    ['  Kari ', 'Karis lag'],
    ['Jonas', "Jonas' lag"],
    ['Max', "Max' lag"],
    ['Inez', "Inez' lag"],
    ['MARCUS', "MARCUS' lag"],
    ['Ås', "Ås' lag"],
  ])('%s → %s', (firstName, expected) => {
    expect(suggestTeamName(firstName)).toBe(expected);
  });

  it.each(['', '   '])('no name (%j) → «Laget mitt»', (firstName) => {
    expect(suggestTeamName(firstName)).toBe('Laget mitt');
  });

  it('a long name is cut so the suggestion fits the team-name limit', () => {
    const name = suggestTeamName('A'.repeat(80));
    expect(name.length).toBe(TEAM_NAME_MAX);
    expect(name).toBe(`${'A'.repeat(TEAM_NAME_MAX - 5)}s lag`);
  });

  it('a cut that ends on an s keeps the apostrophe rule', () => {
    const name = suggestTeamName(`${'A'.repeat(TEAM_NAME_MAX - 6)}s${'B'.repeat(20)}`);
    expect(name).toBe(`${'A'.repeat(TEAM_NAME_MAX - 6)}s' lag`);
  });

  it('every suggestion is a valid team name', () => {
    for (const n of ['', 'O', 'Jo', 'Martin', 'x'.repeat(200)]) {
      const s = suggestTeamName(n);
      expect(s.length).toBeGreaterThanOrEqual(TEAM_NAME_MIN);
      expect(s.length).toBeLessThanOrEqual(TEAM_NAME_MAX);
    }
  });
});

describe('suggestTeamName in English', () => {
  it.each([
    ['Martin', "Martin's team"],
    ['Jonas', "Jonas' team"],
    ['Max', "Max' team"],
  ])('%s → %s', (firstName, expected) => {
    expect(suggestTeamName(firstName, 'en')).toBe(expected);
  });

  it('no name → «My team»', () => {
    expect(suggestTeamName('  ', 'en')).toBe('My team');
  });

  it('a long name is cut so the suggestion fits the team-name limit', () => {
    const name = suggestTeamName('A'.repeat(80), 'en');
    expect(name.length).toBe(TEAM_NAME_MAX);
    expect(name.endsWith("A's team")).toBe(true);
  });

  it('every English suggestion is a valid team name', () => {
    for (const n of ['', 'O', 'Jo', 'Martin', 'x'.repeat(200), `${'A'.repeat(40)}s`]) {
      const s = suggestTeamName(n, 'en');
      expect(s.length).toBeGreaterThanOrEqual(TEAM_NAME_MIN);
      expect(s.length).toBeLessThanOrEqual(TEAM_NAME_MAX);
    }
  });

  it('any other locale keeps the Norwegian suggestion', () => {
    expect(suggestTeamName('Martin', 'no')).toBe('Martins lag');
  });
});

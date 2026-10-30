import { describe, expect, it } from 'vitest';
import type { MissingForPublishCode } from '../useGameFormState';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { GuestOnlyVerdict } from '@/lib/games/guestOnlyRoster';
import {
  formatRowParts,
  playersRowParts,
  playersSummary,
  readyChecklist,
  sourceKeyFor,
  teeOffIso,
  type ReadyRow,
} from './readyChecklistRules';

// Type A (docs/test-discipline.md): the «Klar?» checklist is a projection of
// the publish gate in useGameFormState (#2282). These tests pin which row each
// missing-code lands on, where «Endre» leads, and when Spillere turns amber.

const BASE = {
  codes: [] as MissingForPublishCode[],
  messages: [] as string[],
  teeOffPastMessage: null as string | null,
  intent: 'kompis' as const,
  expectedPlayerCount: 4 as number | undefined,
  selectedCount: 4,
  lockGameMode: false,
  gameMode: 'stableford' as GameMode,
  guestOnly: 'none' as GuestOnlyVerdict,
};

function row(rows: ReadyRow[], key: ReadyRow['key']): ReadyRow {
  const found = rows.find((r) => r.key === key);
  if (!found) throw new Error(`no row ${key}`);
  return found;
}

describe('readyChecklist — rows and targets', () => {
  it('gives the four rows in order, all in order when nothing is missing', () => {
    const rows = readyChecklist(BASE);
    expect(rows.map((r) => r.key)).toEqual(['course', 'format', 'teeOff', 'players']);
    expect(rows.map((r) => r.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(rows.map((r) => r.target)).toEqual([3, 2, 3, 4]);
  });

  it.each<[MissingForPublishCode, ReadyRow['key'], ReadyRow['target']]>([
    ['course', 'course', 3],
    ['tee_box', 'course', 3],
    ['tee_off', 'teeOff', 3],
    ['players', 'players', 4],
    ['allowance', 'format', 'advanced'],
    // #2439: the club is chosen on step 2, above the format list.
    ['club', 'format', 2],
  ])('code %s blocks the %s row, «Endre» goes to %s', (code, key, target) => {
    const rows = readyChecklist({ ...BASE, codes: [code], messages: [`msg-${code}`] });
    const hit = row(rows, key);
    expect(hit.status).toBe('block');
    expect(hit.messages).toEqual([`msg-${code}`]);
    expect(hit.target).toBe(target);
    expect(rows.filter((r) => r.status === 'block')).toHaveLength(1);
  });

  it('collects every message for a row, in the gate order', () => {
    const rows = readyChecklist({
      ...BASE,
      codes: ['course', 'tee_box', 'tee_off'],
      messages: ['bane', 'tee', 'tid'],
    });
    expect(row(rows, 'course').messages).toEqual(['bane', 'tee']);
    expect(row(rows, 'teeOff').messages).toEqual(['tid']);
  });

  it('a tee-off in the past blocks Tee-off with its own message', () => {
    const rows = readyChecklist({ ...BASE, teeOffPastMessage: 'Tee-off kan ikke være i fortiden.' });
    const teeOff = row(rows, 'teeOff');
    expect(teeOff.status).toBe('block');
    expect(teeOff.messages).toEqual(['Tee-off kan ikke være i fortiden.']);
    expect(teeOff.target).toBe(3);
  });

  it('a locked format (cup) has no «Endre» on Format', () => {
    const rows = readyChecklist({ ...BASE, lockGameMode: true });
    expect(row(rows, 'format').target).toBeNull();
  });

  it('a missing club wins over a broken allowance: «Endre» goes to the club on step 2 (#2439)', () => {
    const rows = readyChecklist({
      ...BASE,
      codes: ['club', 'allowance'],
      messages: ['klubb', 'ugyldig andel'],
    });
    expect(row(rows, 'format')).toMatchObject({
      status: 'block',
      messages: ['klubb', 'ugyldig andel'],
      target: 2,
    });
  });

  it('a locked format with an allowance code still leads to the advanced settings', () => {
    const rows = readyChecklist({
      ...BASE,
      lockGameMode: true,
      codes: ['allowance'],
      messages: ['ugyldig andel'],
    });
    expect(row(rows, 'format')).toMatchObject({ status: 'block', target: 'advanced' });
  });

  // #2570: shamble's percentage sits under «Tellemåte» on step 2, not in the
  // advanced settings.
  it('shamble with a broken allowance leads to step 2', () => {
    const rows = readyChecklist({
      ...BASE,
      gameMode: 'shamble',
      codes: ['allowance'],
      messages: ['ugyldig andel'],
    });
    expect(row(rows, 'format')).toMatchObject({ status: 'block', target: 2 });
  });
});

// #2570: a round with only guests. The gate (useGameFormState) pushes a
// 'players' code when guestOnlyRoster says block, whatever the signup mode
// (the owner's choice C).
describe('readyChecklist — only guests (#2570)', () => {
  it('all guests: the gate\'s code makes the row red and flags it', () => {
    const rows = readyChecklist({
      ...BASE,
      guestOnly: 'block',
      codes: ['players'],
      messages: ['en spiller med konto'],
    });
    expect(row(rows, 'players')).toMatchObject({
      status: 'block',
      messages: ['en spiller med konto'],
      guestsOnly: true,
    });
  });

  it('one registered player among the guests (none): no guest flag', () => {
    const rows = readyChecklist({ ...BASE, guestOnly: 'none' });
    expect(row(rows, 'players')).toMatchObject({ status: 'ok', guestsOnly: false });
  });

  it('red from another players reason keeps both messages', () => {
    const rows = readyChecklist({
      ...BASE,
      guestOnly: 'block',
      codes: ['players', 'players'],
      messages: ['1 spiller til', 'en spiller med konto'],
    });
    expect(row(rows, 'players')).toMatchObject({
      status: 'block',
      messages: ['1 spiller til', 'en spiller med konto'],
      guestsOnly: true,
    });
  });

  it('only the players row carries the flag', () => {
    const rows = readyChecklist({
      ...BASE,
      guestOnly: 'block',
      codes: ['players'],
      messages: ['en spiller med konto'],
    });
    expect(rows.filter((r) => r.guestsOnly)).toHaveLength(1);
  });
});

describe('teeOffIso', () => {
  it.each([[''], ['ikke en dato'], ['2026-13-40T25:99']])('gives null for %j', (value) => {
    expect(teeOffIso(value)).toBeNull();
  });

  it('reads the field as Oslo time (summer and winter)', () => {
    expect(teeOffIso('2026-10-03T09:20')).toBe('2026-10-03T07:20:00.000Z');
    expect(teeOffIso('2026-11-07T09:20')).toBe('2026-11-07T08:20:00.000Z');
  });
});

const PLAYERS = {
  count: 5,
  isSolo: false,
  isMatchplay: false,
  requiresTeams: false,
  side1: 0,
  side2: 0,
  teamsCount: 0,
  isBestBall: false,
  isParStableford: false,
  isScramble: false,
  teamSize: 1,
  fullTeamsCount: 0,
  shortTeamsCount: 0,
  shortTeamAllowed: false,
};

describe('playersSummary', () => {
  // Wolf, Nassau and Skins reach playersSummary the same way: individual
  // formats outside the solo flag, so requiresTeams is false and no teams exist.
  it('formats without teams (Wolf, Nassau, Skins) give only the count, never «ikke fordelt»', () => {
    expect(playersSummary(PLAYERS)).toEqual({ key: 'playersPlural', values: { count: 5 } });
    expect(playersSummary({ ...PLAYERS, count: 1 })).toEqual({
      key: 'playersSolo',
      values: { count: 1 },
    });
  });

  it.each<[string, Partial<typeof PLAYERS>, ReturnType<typeof playersSummary>]>([
    ['solo', { isSolo: true, count: 3 }, { key: 'playersPlural', values: { count: 3 } }],
    ['matchplay 1 v 1', { isMatchplay: true, side1: 1, side2: 1, count: 2 }, { key: 'players1v1', values: {} }],
    ['matchplay not split', { isMatchplay: true, side1: 2, side2: 0, count: 2 }, { key: 'playersUnassignedMatchplay', values: {} }],
    ['teams, nobody placed', { requiresTeams: true, teamSize: 2, count: 4 }, { key: 'playersUnassigned', values: { count: 4 } }],
    ['best ball', { requiresTeams: true, teamSize: 2, isBestBall: true, teamsCount: 2, count: 4 }, { key: 'teamsBestBall', values: { teams: 2 } }],
    ['par stableford', { requiresTeams: true, teamSize: 2, isParStableford: true, teamsCount: 3, count: 6 }, { key: 'teamsParStableford', values: { teams: 3 } }],
    ['scramble', { requiresTeams: true, teamSize: 4, isScramble: true, teamsCount: 2, count: 8 }, { key: 'teamsScramble', values: { teams: 2, size: 4 } }],
    // #2569: 4/4/3 is «2 lag à 4 og ett à 3», not «3 lag à 4».
    ['scramble 4/4/3', { requiresTeams: true, teamSize: 4, isScramble: true, teamsCount: 3, count: 11, fullTeamsCount: 2, shortTeamsCount: 1, shortTeamAllowed: true }, { key: 'teamsScrambleUneven', values: { full: 2, size: 4, short: 1, shortSize: 3 } }],
    // A team one short where the format has no such size (Texas à 2, 2/2/1) is not «kort».
    ['scramble 2/2/1 à 2', { requiresTeams: true, teamSize: 2, isScramble: true, teamsCount: 3, count: 5, fullTeamsCount: 2, shortTeamsCount: 1, shortTeamAllowed: false }, { key: 'teamsScramble', values: { teams: 3, size: 2 } }],
    // A team outside the rule (4/4/2) keeps the plain line; the missing list says what is wrong.
    ['scramble 4/4/2', { requiresTeams: true, teamSize: 4, isScramble: true, teamsCount: 3, count: 10, fullTeamsCount: 2, shortTeamsCount: 0 }, { key: 'teamsScramble', values: { teams: 3, size: 4 } }],
    ['other team format', { requiresTeams: true, teamSize: 2, teamsCount: 2, count: 4 }, { key: 'playersPlural', values: { count: 4 } }],
  ])('%s', (_label, overrides, expected) => {
    expect(playersSummary({ ...PLAYERS, ...overrides })).toEqual(expected);
  });
});

describe('formatRowParts', () => {
  it.each<[string, Parameters<typeof formatRowParts>[0], ReturnType<typeof formatRowParts>]>([
    ['stableford 85 %', { gameMode: 'stableford', teamSize: 1, hcpAllowance: 85 }, { teamSize: null, allowance: { kind: 'pct', pct: 85 } }],
    ['slagspill brutto', { gameMode: 'solo_strokeplay', teamSize: 1, hcpAllowance: 0 }, { teamSize: null, allowance: { kind: 'gross' } }],
    ['best ball in pairs', { gameMode: 'best_ball', teamSize: 2, hcpAllowance: 85 }, { teamSize: 2, allowance: { kind: 'pct', pct: 85 } }],
    ['texas, own percentage', { gameMode: 'texas_scramble', teamSize: 4, hcpAllowance: 100 }, { teamSize: 4, allowance: null }],
    ['skins, own percentage', { gameMode: 'skins', teamSize: 1, hcpAllowance: 100 }, { teamSize: null, allowance: null }],
    // #2570: shamble's share is set under «Tellemåte»; the row names none.
    ['shamble, field on step 2', { gameMode: 'shamble', teamSize: 4, hcpAllowance: 80 }, { teamSize: 4, allowance: null }],
  ])('%s', (_label, input, expected) => {
    expect(formatRowParts(input)).toEqual(expected);
  });
});

describe('sourceKeyFor', () => {
  it('maps each registration mode to its checklist key', () => {
    expect(sourceKeyFor('invite_only')).toBe('invite');
    expect(sourceKeyFor('manual_approval')).toBe('approval');
    expect(sourceKeyFor('open')).toBe('open');
  });
});

// #2447: the Spillere row names how the players come, last.
describe('playersRowParts', () => {
  const OK = { status: 'ok' as const, selectedCount: 4, value: '4 spillere', pendingNote: null, source: 'Privat' };

  it.each<[string, Parameters<typeof playersRowParts>[0], string[]]>([
    ['players and a choice: the choice goes last', OK, ['4 spillere', 'Privat']],
    ['club tournament: no choice, as before', { ...OK, source: null }, ['4 spillere']],
    ['nobody on the list: only the choice, never «0 spillere»', { ...OK, selectedCount: 0, value: '0 spillere', source: 'Åpen påmelding' }, ['Åpen påmelding']],
    ['nobody on the list, club tournament: the plain value', { ...OK, selectedCount: 0, value: '0 spillere', source: null }, ['0 spillere']],
    ['profile note after the count, the choice after both (#2441)', { ...OK, pendingNote: '1 venter på profil' }, ['4 spillere', '1 venter på profil', 'Privat']],
    ['warn: the note first, then the sentence, then the choice', { ...OK, status: 'warn', value: '2 av 4. Du kan legge til flere senere.', selectedCount: 2, pendingNote: '1 venter på profil' }, ['1 venter på profil', '2 av 4. Du kan legge til flere senere.', 'Privat']],
  ])('%s', (_label, input, expected) => {
    expect(playersRowParts(input)).toEqual(expected);
  });
});

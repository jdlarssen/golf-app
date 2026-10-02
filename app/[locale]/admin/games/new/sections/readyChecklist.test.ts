import { describe, expect, it } from 'vitest';
import type { MissingForPublishCode } from '../useGameFormState';
import {
  formatRowParts,
  playersSummary,
  readyChecklist,
  teeOffIso,
  type ReadyRow,
} from './readyChecklist';

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

  it('a locked format with an allowance code still leads to the advanced settings', () => {
    const rows = readyChecklist({
      ...BASE,
      lockGameMode: true,
      codes: ['allowance'],
      messages: ['ugyldig andel'],
    });
    expect(row(rows, 'format')).toMatchObject({ status: 'block', target: 'advanced' });
  });
});

describe('readyChecklist — the amber Spillere row', () => {
  it.each<[string, Partial<typeof BASE>, ReadyRow['status']]>([
    ['kompis, 3 of 4', { selectedCount: 3 }, 'warn'],
    ['kompis, 0 of 4', { selectedCount: 0 }, 'warn'],
    ['kompis, 4 of 4', { selectedCount: 4 }, 'ok'],
    ['kompis, 5 of 4', { selectedCount: 5 }, 'ok'],
    ['kompis without a count', { selectedCount: 3, expectedPlayerCount: undefined }, 'ok'],
    ['klubb, 3 of 4', { selectedCount: 3, intent: 'klubb' as never }, 'ok'],
    ['no intent, 3 of 4', { selectedCount: 3, intent: undefined as never }, 'ok'],
  ])('%s → %s', (_label, overrides, status) => {
    expect(row(readyChecklist({ ...BASE, ...overrides }), 'players').status).toBe(status);
  });

  it('red wins over amber', () => {
    const rows = readyChecklist({
      ...BASE,
      selectedCount: 0,
      codes: ['players'],
      messages: ['Velg minst én spiller'],
    });
    expect(row(rows, 'players')).toMatchObject({
      status: 'block',
      messages: ['Velg minst én spiller'],
    });
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
};

describe('playersSummary', () => {
  it.each(['Wolf', 'Nassau', 'Skins'])('%s (no teams) gives only the count, never «ikke fordelt»', () => {
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
  ])('%s', (_label, input, expected) => {
    expect(formatRowParts(input)).toEqual(expected);
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildCupRoster,
  formatSideLabel,
  userOf,
  type CupNamedPlayerRow,
  type CupUserRel,
} from './cupRoster';

// Type-A unit-test for roster-/navne-byggingen trukket ut av getCupSnapshot
// (#1522). To kontrakter låses her: navne-preferansen (kallenavn > navn >
// unknownLabel) og REKKEFØLGEN i rosteret — UI-en lister spillerne i den
// rekkefølgen kampene kom, og første treff per bruker vinner.

const UNKNOWN = 'Ukjent spiller';

function player(
  user_id: string,
  team_number: number | null,
  users: CupUserRel | CupUserRel[] | null = { name: user_id, nickname: null },
): CupNamedPlayerRow {
  return { user_id, team_number, users };
}

describe('userOf — Supabase-joinens array-eller-objekt-form', () => {
  it.each<[string, CupUserRel | CupUserRel[] | null | undefined, CupUserRel | null]>([
    ['objekt-form', { name: 'Per', nickname: null }, { name: 'Per', nickname: null }],
    ['array-form tar første', [{ name: 'Per', nickname: null }], { name: 'Per', nickname: null }],
    ['tom array', [], null],
    ['null', null, null],
    ['undefined', undefined, null],
  ])('%s', (_desc, rel, expected) => {
    expect(userOf(rel)).toEqual(expected);
  });
});

describe('formatSideLabel (#217)', () => {
  it.each<[string, CupNamedPlayerRow[], string]>([
    ['tom side → unknownLabel', [], UNKNOWN],
    ['singles → ett navn', [player('u1', 1, { name: 'Per', nickname: null })], 'Per'],
    [
      'kallenavn slår navn',
      [player('u1', 1, { name: 'Per Hansen', nickname: 'Pelle' })],
      'Pelle',
    ],
    [
      'blankt kallenavn faller til navn',
      [player('u1', 1, { name: 'Per', nickname: '   ' })],
      'Per',
    ],
    [
      'navnløs spiller → unknownLabel',
      [player('u1', 1, { name: null, nickname: null })],
      UNKNOWN,
    ],
    ['manglende users-join → unknownLabel', [player('u1', 1, null)], UNKNOWN],
    [
      'lag-format joiner med skråstrek i radrekkefølge',
      [
        player('u1', 1, { name: 'Per', nickname: null }),
        player('u2', 1, { name: 'Kari', nickname: null }),
      ],
      'Per/Kari',
    ],
    [
      'tre spillere joines også',
      [
        player('u1', 1, { name: 'Per', nickname: null }),
        player('u2', 1, { name: null, nickname: null }),
        player('u3', 1, { name: 'Kari', nickname: 'Kaia' }),
      ],
      `Per/${UNKNOWN}/Kaia`,
    ],
  ])('%s', (_desc, sidePlayers, expected) => {
    expect(formatSideLabel(sidePlayers, UNKNOWN)).toBe(expected);
  });
});

describe('buildCupRoster', () => {
  it('grupperer distinkte spillere på team_number', () => {
    const roster = buildCupRoster([
      [
        player('a1', 1, { name: 'Per', nickname: 'Pelle' }),
        player('b1', 2, { name: 'Kari', nickname: null }),
      ],
    ]);
    expect(roster).toEqual({
      team1: [{ userId: 'a1', name: 'Per', nickname: 'Pelle' }],
      team2: [{ userId: 'b1', name: 'Kari', nickname: null }],
    });
  });

  it('bevarer kamp-rekkefølgen og radrekkefølgen innen hver kamp', () => {
    const roster = buildCupRoster([
      [player('a2', 1), player('a1', 1)],
      [player('a3', 1)],
    ]);
    expect(roster.team1.map((p) => p.userId)).toEqual(['a2', 'a1', 'a3']);
  });

  it('en spiller i flere kamper står én gang, fra sin FØRSTE kamp', () => {
    const roster = buildCupRoster([
      [player('a1', 1, { name: 'Første', nickname: null })],
      [player('a1', 1, { name: 'Andre', nickname: null })],
    ]);
    expect(roster.team1).toEqual([{ userId: 'a1', name: 'Første', nickname: null }]);
  });

  it.each<[string, number | null]>([
    ['team_number null', null],
    ['team_number 3 (finnes ikke i en cup)', 3],
  ])('%s havner i ingen av lagene', (_desc, teamNumber) => {
    const roster = buildCupRoster([[player('x1', teamNumber)]]);
    expect(roster).toEqual({ team1: [], team2: [] });
  });

  it('tom input → tomme lag', () => {
    expect(buildCupRoster([])).toEqual({ team1: [], team2: [] });
  });

  it('leser navn gjennom array-formen av users-joinen', () => {
    const roster = buildCupRoster([[player('a1', 1, [{ name: 'Per', nickname: 'Pelle' }])]]);
    expect(roster.team1).toEqual([{ userId: 'a1', name: 'Per', nickname: 'Pelle' }]);
  });

  it('spiller uten users-join får null-navn (ikke krasj)', () => {
    const roster = buildCupRoster([[player('a1', 1, null)]]);
    expect(roster.team1).toEqual([{ userId: 'a1', name: null, nickname: null }]);
  });
});

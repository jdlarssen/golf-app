import { describe, it, expect } from 'vitest';
import {
  buildCupRoster,
  formatSideLabel,
  userOf,
  type CupNamedPlayerRow,
  type CupRosterGame,
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
  return { user_id, team_number, users, withdrawn_at: null };
}

/** Én kamp i rosterrekkefølgen. Ikke startet med mindre annet står. */
function match(
  players: CupNamedPlayerRow[],
  status: CupRosterGame['status'] = 'scheduled',
): CupRosterGame {
  return { status, players };
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
      match([
        player('a1', 1, { name: 'Per', nickname: 'Pelle' }),
        player('b1', 2, { name: 'Kari', nickname: null }),
      ]),
    ]);
    expect(roster).toEqual({
      team1: [{ userId: 'a1', name: 'Per', nickname: 'Pelle', withdrawn: false }],
      team2: [{ userId: 'b1', name: 'Kari', nickname: null, withdrawn: false }],
    });
  });

  it('bevarer kamp-rekkefølgen og radrekkefølgen innen hver kamp', () => {
    const roster = buildCupRoster([
      match([player('a2', 1), player('a1', 1)]),
      match([player('a3', 1)]),
    ]);
    expect(roster.team1.map((p) => p.userId)).toEqual(['a2', 'a1', 'a3']);
  });

  it('en spiller i flere kamper står én gang, fra sin FØRSTE kamp', () => {
    const roster = buildCupRoster([
      match([player('a1', 1, { name: 'Første', nickname: null })]),
      match([player('a1', 1, { name: 'Andre', nickname: null })]),
    ]);
    expect(roster.team1).toEqual([
      { userId: 'a1', name: 'Første', nickname: null, withdrawn: false },
    ]);
  });

  it.each<[string, number | null]>([
    ['team_number null', null],
    ['team_number 3 (finnes ikke i en cup)', 3],
  ])('%s havner i ingen av lagene', (_desc, teamNumber) => {
    const roster = buildCupRoster([match([player('x1', teamNumber)])]);
    expect(roster).toEqual({ team1: [], team2: [] });
  });

  it('tom input → tomme lag', () => {
    expect(buildCupRoster([])).toEqual({ team1: [], team2: [] });
  });

  it('leser navn gjennom array-formen av users-joinen', () => {
    const roster = buildCupRoster([match([player('a1', 1, [{ name: 'Per', nickname: 'Pelle' }])])]);
    expect(roster.team1).toEqual([
      { userId: 'a1', name: 'Per', nickname: 'Pelle', withdrawn: false },
    ]);
  });

  it('spiller uten users-join får null-navn (ikke krasj)', () => {
    const roster = buildCupRoster([match([player('a1', 1, null)])]);
    expect(roster.team1).toEqual([
      { userId: 'a1', name: null, nickname: null, withdrawn: false },
    ]);
  });
});

// #1814: den trukne blir stående på laget sitt, merket «Trukket» (E5). Merket
// settes av enhver trukket rad i en kamp som ENNÅ IKKE HAR STARTET — et trekk
// flagger bare de kampene, og den første kampen i rekkefølgen kan godt være
// ferdigspilt. Startede kamper teller ikke: et mykt trekk midtveis (#386) er
// ikke å trekke seg fra cupen, og arrangørsiden leser de samme radene når den
// velger mellom «Angre trekk» og «Trekk fra cupen».
describe('buildCupRoster — «Trukket»-merket (#1814)', () => {
  function withdrawnPlayer(user_id: string, team_number: number): CupNamedPlayerRow {
    return {
      user_id,
      team_number,
      users: { name: user_id, nickname: null },
      withdrawn_at: '2026-09-10T07:00:00.000Z',
    };
  }

  it('er false når ingen rader er trukket', () => {
    const roster = buildCupRoster([match([player('a1', 1)])]);
    expect(roster.team1[0].withdrawn).toBe(false);
  });

  it('er true når spillerens eneste rad er trukket', () => {
    const roster = buildCupRoster([match([withdrawnPlayer('a1', 1)])]);
    expect(roster.team1[0].withdrawn).toBe(true);
  });

  it('er true selv om den FØRSTE kampen er urørt og en senere er trukket', () => {
    const roster = buildCupRoster([
      match([player('a1', 1)]),
      match([withdrawnPlayer('a1', 1)]),
    ]);
    expect(roster.team1).toHaveLength(1);
    expect(roster.team1[0].withdrawn).toBe(true);
  });

  it('smitter ikke over på lagkameratene', () => {
    const roster = buildCupRoster([
      match([withdrawnPlayer('a1', 1), player('a2', 1), player('b1', 2)]),
    ]);
    expect(roster.team1.map((p) => p.withdrawn)).toEqual([true, false]);
    expect(roster.team2[0].withdrawn).toBe(false);
  });

  it('flagger ikke en trukket rad uten lag', () => {
    const roster = buildCupRoster([match([withdrawnPlayer('x1', 3)])]);
    expect(roster).toEqual({ team1: [], team2: [] });
  });

  it.each<['active' | 'finished']>([['active'], ['finished']])(
    'teller ikke et mykt trekk i en kamp som er %s',
    (status) => {
      const roster = buildCupRoster([match([withdrawnPlayer('a1', 1)], status)]);
      expect(roster.team1[0].withdrawn).toBe(false);
    },
  );

  it('teller et trekk i en kamp som ennå står i utkast', () => {
    const roster = buildCupRoster([match([withdrawnPlayer('a1', 1)], 'draft')]);
    expect(roster.team1[0].withdrawn).toBe(true);
  });

  it('et trekk i en pågående kamp skygger ikke for et i en kommende', () => {
    const roster = buildCupRoster([
      match([withdrawnPlayer('a1', 1)], 'active'),
      match([withdrawnPlayer('a1', 1)]),
    ]);
    expect(roster.team1[0].withdrawn).toBe(true);
  });
});

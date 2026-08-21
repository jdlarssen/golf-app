import { describe, it, expect } from 'vitest';
import { buildSideAwardDetails, type CupSideAwardWinnerRow } from './sideAwardDetails';
import type { CupRoster, CupSideAwardSnapshot } from './getCupSnapshot';

const ROSTER: CupRoster = {
  team1: [
    { userId: 'p1', name: 'Per Person', nickname: 'Per' },
    { userId: 'p2', name: 'Pål Person', nickname: null },
  ],
  team2: [
    { userId: 'k1', name: 'Knut Kongsberg', nickname: null },
    { userId: 'k2', name: null, nickname: null },
  ],
};

function ctp(overrides: Partial<Extract<CupSideAwardSnapshot, { kind: 'ctp' | 'ld' }>> = {}) {
  return {
    id: 'a1',
    kind: 'ctp' as const,
    holeNumber: 7,
    points: 0.5,
    slot: 1,
    slotCount: 1,
    winnerUserId: null,
    winnerTeam: null,
    noWinner: false,
    ...overrides,
  };
}

function gir(overrides: Partial<Extract<CupSideAwardSnapshot, { kind: 'gir' }>> = {}) {
  return {
    id: 'g1',
    kind: 'gir' as const,
    holeNumber: 12,
    points: 0.5,
    maxPerTeam: 4,
    team1Count: null as number | null,
    team2Count: null as number | null,
    ...overrides,
  };
}

function firstWinnerRow(awards: CupSideAwardSnapshot[]): CupSideAwardWinnerRow {
  const row = buildSideAwardDetails({ sideAwards: awards, roster: ROSTER, unknownLabel: 'Ukjent' })[0]
    .rows[0];
  if (row.kind === 'gir') throw new Error('expected a ctp/ld row');
  return row;
}

describe('buildSideAwardDetails — ctp/ld outcomes', () => {
  it.each<[string, Partial<Extract<CupSideAwardSnapshot, { kind: 'ctp' | 'ld' }>>, CupSideAwardWinnerRow['outcome'], string | null, 1 | 2 | null]>([
    ['winner on team 1', { winnerUserId: 'p1', winnerTeam: 1 }, 'won', 'Per', 1],
    ['winner on team 2', { winnerUserId: 'k1', winnerTeam: 2 }, 'won', 'Knut Kongsberg', 2],
    // #1530: «nobody won» is a finished answer, not a missing registration.
    ['answered no winner', { noWinner: true }, 'noWinner', null, null],
    ['not registered yet', {}, 'unregistered', null, null],
    // Defensive: a winner id outside the roster keeps the unknown label and
    // gets no team attribution — never a crash (computeCupPlayerPoints does
    // the same).
    ['winner outside roster', { winnerUserId: 'ghost', winnerTeam: null }, 'won', 'Ukjent', null],
    // Roster player with neither name nor nickname falls back to unknownLabel.
    ['winner without name', { winnerUserId: 'k2', winnerTeam: 2 }, 'won', 'Ukjent', 2],
  ])('%s', (_label, overrides, outcome, winnerName, winnerTeam) => {
    const row = firstWinnerRow([ctp(overrides)]);
    expect(row.outcome).toBe(outcome);
    expect(row.winnerName).toBe(winnerName);
    expect(row.winnerTeam).toBe(winnerTeam);
  });

  it.each<[number, boolean]>([
    [1, false],
    [2, true],
    [3, true],
  ])('slotCount %i → showSlot %s', (slotCount, showSlot) => {
    expect(firstWinnerRow([ctp({ slotCount })]).showSlot).toBe(showSlot);
  });

  it('carries kind, hole, points and slot through untouched', () => {
    const row = firstWinnerRow([ctp({ id: 'x', kind: 'ld', holeNumber: 3, points: 1, slot: 2, slotCount: 3 })]);
    expect(row).toMatchObject({ id: 'x', kind: 'ld', holeNumber: 3, points: 1, slot: 2, slotCount: 3 });
  });
});

describe('buildSideAwardDetails — gir rows', () => {
  it.each<[string, number | null, number | null, boolean, number, number]>([
    // label, team1Count, team2Count, registered, team1Points, team2Points
    ['both counts set', 3, 1, true, 1.5, 0.5],
    ['registered zero counts', 0, 0, true, 0, 0],
    ['one zero one set', 0, 2, true, 0, 1],
    ['team1 not registered', null, 2, false, 0, 1],
    ['neither registered', null, null, false, 0, 0],
  ])('%s', (_label, team1Count, team2Count, registered, team1Points, team2Points) => {
    const row = buildSideAwardDetails({
      sideAwards: [gir({ team1Count, team2Count })],
      roster: ROSTER,
      unknownLabel: 'Ukjent',
    })[0].rows[0];
    if (row.kind !== 'gir') throw new Error('expected a gir row');
    expect(row.registered).toBe(registered);
    expect(row.maxPerTeam).toBe(4);
    expect(row.teams[0]).toEqual({ team: 1, count: team1Count, points: team1Points });
    expect(row.teams[1]).toEqual({ team: 2, count: team2Count, points: team2Points });
  });
});

describe('buildSideAwardDetails — grouping', () => {
  it('returns an empty list for a cup without side awards', () => {
    expect(buildSideAwardDetails({ sideAwards: [], roster: ROSTER, unknownLabel: 'Ukjent' })).toEqual([]);
  });

  it('groups per hole, holes ascending, rows in snapshot order within a hole', () => {
    // Snapshot order is kind → hole → slot, so a cup with two holes arrives
    // interleaved across holes; the grouping must not reorder within a hole.
    const groups = buildSideAwardDetails({
      sideAwards: [
        ctp({ id: 'c12a', holeNumber: 12, slot: 1, slotCount: 2, winnerUserId: 'p1', winnerTeam: 1 }),
        ctp({ id: 'c12b', holeNumber: 12, slot: 2, slotCount: 2 }),
        gir({ id: 'g7', holeNumber: 7, team1Count: 1, team2Count: 1 }),
        ctp({ id: 'l7', kind: 'ld', holeNumber: 7 }),
      ],
      roster: ROSTER,
      unknownLabel: 'Ukjent',
    });

    expect(groups.map((g) => g.holeNumber)).toEqual([7, 12]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['g7', 'l7']);
    expect(groups[1].rows.map((r) => r.id)).toEqual(['c12a', 'c12b']);
  });
});

import { describe, it, expect } from 'vitest';
import {
  mergeCupIds,
  cupLedgerHref,
  cupLedgerResult,
  getMyCupIds,
  type CupLedgerRow,
} from './myCups';

/**
 * Type A (pure logic) for the cup-relation union that makes `/admin/cup` a
 * lasting door into cups you played (#1463). The three sources overlap by
 * design — a split cup day gives one player three `game_players` rows AND a
 * `tournament_participants` row for the same cup — so dedupe is the whole
 * point of the merge.
 */

const row = (over: Partial<CupLedgerRow> = {}): CupLedgerRow => ({
  id: 'c1',
  name: 'Kompiscupen',
  status: 'finished',
  team_1_name: 'Blå',
  team_2_name: 'Rød',
  points_to_win: 7,
  created_at: '2026-08-01T10:00:00Z',
  created_by: 'me',
  group_id: null,
  winner_team: 1,
  ...over,
});

/**
 * Table-keyed Supabase stub: `getMyCupIds` fires its three reads through
 * `Promise.all`, so a FIFO queue would make the test depend on scheduling
 * order. Keyed by table name it stays order-independent.
 */
function buildTableMock(byTable: Record<string, unknown[]>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ table, method: 'from', args: [] });
        const builder = {
          select: () => builder,
          eq: (...args: unknown[]) => {
            calls.push({ table, method: 'eq', args });
            return builder;
          },
          not: (...args: unknown[]) => {
            calls.push({ table, method: 'not', args });
            return builder;
          },
          returns: () => builder,
          then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: byTable[table] ?? [], error: null }),
        };
        return builder;
      },
    },
  };
}

describe('mergeCupIds', () => {
  it('returns an empty list when no source has rows', () => {
    expect(mergeCupIds([[], [], []])).toEqual([]);
  });

  it('keeps a single source untouched, in first-seen order', () => {
    expect(mergeCupIds([['a', 'b', 'c']])).toEqual(['a', 'b', 'c']);
  });

  it('dedupes the same cup across sources and keeps the first sighting', () => {
    expect(mergeCupIds([['a', 'b'], ['b', 'c'], ['a', 'c', 'd']])).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('collapses a split cup day (3 games, same cup) to one id', () => {
    expect(mergeCupIds([['cup-1', 'cup-1', 'cup-1']])).toEqual(['cup-1']);
  });

  it('drops null/undefined ids — a game outside a cup carries none', () => {
    expect(mergeCupIds([['a', null, undefined, 'a', 'b']])).toEqual(['a', 'b']);
  });
});

describe('getMyCupIds', () => {
  it('unions created ∪ roster ∪ played and dedupes overlaps', async () => {
    const { client, calls } = buildTableMock({
      tournaments: [{ id: 'created-1' }],
      tournament_participants: [
        { tournament_id: 'roster-1' },
        { tournament_id: 'both-1' },
      ],
      game_players: [
        { games: { tournament_id: 'both-1' } },
        { games: { tournament_id: 'both-1' } },
        { games: { tournament_id: 'played-1' } },
      ],
    });

    const ids = await getMyCupIds(
      client as unknown as Parameters<typeof getMyCupIds>[0],
      'me',
    );

    expect(ids).toEqual(['created-1', 'roster-1', 'both-1', 'played-1']);
    expect(calls.filter((c) => c.method === 'eq')).toEqual([
      { table: 'tournaments', method: 'eq', args: ['created_by', 'me'] },
      { table: 'tournament_participants', method: 'eq', args: ['user_id', 'me'] },
      { table: 'game_players', method: 'eq', args: ['user_id', 'me'] },
    ]);
  });

  it('ignores game rows outside a cup (games.tournament_id null)', async () => {
    const { client } = buildTableMock({
      tournaments: [],
      tournament_participants: [],
      game_players: [
        { games: { tournament_id: null } },
        { games: { tournament_id: 'cup-1' } },
      ],
    });

    await expect(
      getMyCupIds(client as unknown as Parameters<typeof getMyCupIds>[0], 'me'),
    ).resolves.toEqual(['cup-1']);
  });

  it('returns an empty list for a player with no cup relation', async () => {
    const { client } = buildTableMock({});
    await expect(
      getMyCupIds(client as unknown as Parameters<typeof getMyCupIds>[0], 'me'),
    ).resolves.toEqual([]);
  });
});

describe('cupLedgerHref', () => {
  it.each([
    {
      case: 'admin sees every cup as a manage row',
      cup: row({ created_by: 'someone-else' }),
      isAdmin: true,
      expected: '/admin/cup/c1',
    },
    {
      case: 'own personal cup → manage page (unchanged)',
      cup: row({ created_by: 'me', group_id: null }),
      isAdmin: false,
      expected: '/admin/cup/c1',
    },
    {
      case: 'own club cup → public cup page (club cups are managed on the club page)',
      cup: row({ created_by: 'me', group_id: 'club-1' }),
      isAdmin: false,
      expected: '/cup/c1',
    },
    {
      case: 'a cup I only played → public cup page',
      cup: row({ created_by: 'someone-else' }),
      isAdmin: false,
      expected: '/cup/c1',
    },
  ])('$case', ({ cup, isAdmin, expected }) => {
    expect(cupLedgerHref(cup, { userId: 'me', isAdmin })).toBe(expected);
  });
});

describe('cupLedgerResult', () => {
  it('names team 1 as the winner', () => {
    expect(cupLedgerResult(row({ winner_team: 1 }))).toEqual({
      kind: 'winner',
      team: 'Blå',
    });
  });

  it('names team 2 as the winner', () => {
    expect(cupLedgerResult(row({ winner_team: 2 }))).toEqual({
      kind: 'winner',
      team: 'Rød',
    });
  });

  it('reports a finished cup without a winner as tied', () => {
    expect(cupLedgerResult(row({ winner_team: null }))).toEqual({ kind: 'tied' });
  });

  it.each(['draft', 'active'] as const)(
    'stays silent while the cup is %s — the status chip carries it',
    (status) => {
      expect(cupLedgerResult(row({ status, winner_team: null }))).toBeNull();
    },
  );
});

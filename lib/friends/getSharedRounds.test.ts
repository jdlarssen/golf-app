// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';
import type { ResultSummary } from '@/lib/scoring/resultSummary';

/**
 * Type A (#2381): the friend page's list of shared rounds. The double records
 * filters, so `respond` applies them to a small `game_players` table here:
 * that way `getFriendStats` and `getSharedRounds` read the SAME rows through
 * their own filters, and the test proves they agree (felle 4).
 */

const ME = 'meg';
const KARI = 'kari';

type Row = {
  game_id: string;
  user_id: string;
  team_number: number | null;
  result_summary: ResultSummary | null;
  withdrawn_at: string | null;
  games: {
    id: string;
    name: string;
    scheduled_tee_off_at: string | null;
    ended_at: string | null;
    game_mode: string;
    mode_config: Record<string, unknown>;
    league_round_id: string | null;
    status: string;
    source_game_id: string | null;
  };
};

const place = (rank: number, isTeam = false): ResultSummary => ({ kind: 'placement', rank, fieldSize: 4, isTeam });

function game(id: string, over: Partial<Row['games']> = {}): Row['games'] {
  return {
    id,
    name: `Spill ${id}`,
    scheduled_tee_off_at: null,
    ended_at: null,
    game_mode: 'solo_strokeplay',
    mode_config: { kind: 'solo_strokeplay' },
    league_round_id: null,
    status: 'finished',
    source_game_id: null,
    ...over,
  };
}

function pair(
  g: Row['games'],
  me: Partial<Row>,
  kari: Partial<Row>,
): Row[] {
  const base = { team_number: null, result_summary: null, withdrawn_at: null, games: g, game_id: g.id };
  return [
    { ...base, user_id: ME, ...me },
    { ...base, user_id: KARI, ...kari },
  ];
}

let table: Row[] = [];
/** The read to fail, by its select. */
let failOn: ((columns: string) => boolean) | null = null;

function value(row: Row, column: string): unknown {
  if (column.startsWith('games.')) return row.games[column.slice('games.'.length) as keyof Row['games']];
  return row[column as keyof Row];
}

function matches(row: Row, op: QueryOp): boolean {
  return op.filters.every((f) => {
    const v = value(row, f.column);
    if (f.op === 'eq') return v === f.value;
    if (f.op === 'is') return v === f.value;
    if (f.op === 'in') return (f.value as unknown[]).includes(v);
    throw new Error(`uventet filter ${f.op}`);
  });
}

const fake = createAdminClientMock({
  respond: (op) => {
    if (op.table !== 'game_players') throw new Error(`uventet tabell ${op.table}`);
    if (failOn && op.columns !== null && failOn(op.columns)) return { data: null, error: { message: 'boom' } };
    const rows = table.filter((row) => matches(row, op));
    const [from, to] = op.range ?? [0, rows.length - 1];
    return { data: rows.slice(from, to + 1) };
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

import { getFriendStats } from './getFriendStats';
import { getSharedRounds } from './getSharedRounds';

beforeEach(() => {
  fake.reset();
  failOn = null;
  table = [
    // Counted: you ahead, newest by tee-off.
    ...pair(game('g1', { name: 'Onsdagsgolfen', scheduled_tee_off_at: '2026-09-23T15:00:00Z' }), { result_summary: place(1) }, { result_summary: place(3) }),
    // Counted: same team in a Texas scramble.
    ...pair(
      game('g2', {
        name: 'Lagmøtet',
        ended_at: '2026-08-10T16:00:00Z',
        game_mode: 'texas_scramble',
        mode_config: { kind: 'texas_scramble', team_size: 2 },
      }),
      { team_number: 1, result_summary: place(1, true) },
      { team_number: 1, result_summary: place(1, true) },
    ),
    // Counted: a league flight, no badge.
    ...pair(game('g3', { name: 'Vinterligaen', ended_at: '2026-10-01T12:00:00Z', league_round_id: 'runde-1' }), { result_summary: place(1) }, { result_summary: place(2) }),
    // Not counted: Kari withdrew.
    ...pair(game('g4', { ended_at: '2026-07-01T12:00:00Z' }), {}, { withdrawn_at: '2026-07-01T09:00:00Z' }),
    // Not counted: you withdrew.
    ...pair(game('g5', { ended_at: '2026-07-02T12:00:00Z' }), { withdrawn_at: '2026-07-02T09:00:00Z' }, {}),
    // Not counted: not finished.
    ...pair(game('g6', { status: 'active' }), {}, {}),
    // Not counted: a derived cup single.
    ...pair(game('g7', { source_game_id: 'cup-1' }), {}, {}),
    // Not counted: Kari was not in it.
    { team_number: null, result_summary: place(1), withdrawn_at: null, games: game('g8'), game_id: 'g8', user_id: ME },
  ];
});

describe('getSharedRounds', () => {
  it('lists the rounds you both finished, newest first, with the badge', async () => {
    const rounds = await getSharedRounds(ME, KARI);
    expect(rounds).toEqual([
      { gameId: 'g3', name: 'Vinterligaen', playedAt: '2026-10-01T12:00:00Z', modeLabel: 'Slagspill', badge: null },
      { gameId: 'g1', name: 'Onsdagsgolfen', playedAt: '2026-09-23T15:00:00Z', modeLabel: 'Slagspill', badge: 'you_ahead' },
      { gameId: 'g2', name: 'Lagmøtet', playedAt: '2026-08-10T16:00:00Z', modeLabel: 'Texas scramble', badge: 'same_team' },
    ]);
  });

  it('counts the same rounds as «N runder sammen»', async () => {
    const stats = await getFriendStats(ME, [KARI]);
    const rounds = await getSharedRounds(ME, KARI);
    expect(stats.get(KARI)?.roundsTogether).toBe(3);
    expect(rounds).toHaveLength(stats.get(KARI)!.roundsTogether);
    expect(rounds[0].name).toBe(stats.get(KARI)?.lastGameName);
  });

  it('sends neither player\'s rank, team or summary', async () => {
    const rounds = await getSharedRounds(ME, KARI);
    for (const round of rounds) {
      expect(Object.keys(round).sort()).toEqual(['badge', 'gameId', 'modeLabel', 'name', 'playedAt']);
    }
  });

  it('reads the other player\'s rows in slices of at most 50 games', async () => {
    table = Array.from({ length: 120 }, (_, i) =>
      pair(game(`n${i}`, { ended_at: '2026-06-01T12:00:00Z' }), { result_summary: place(1) }, { result_summary: place(2) }),
    ).flat();
    const rounds = await getSharedRounds(ME, KARI);
    const reads = fake.ops.filter((op) => op.columns === 'game_id, team_number, result_summary');
    expect(reads.map((op) => (op.filters.find((f) => f.op === 'in')?.value as string[]).length)).toEqual([50, 50, 20]);
    expect(reads.every((op) => op.filters.some((f) => f.op === 'eq' && f.column === 'user_id' && f.value === KARI))).toBe(true);
    expect(rounds).toHaveLength(120);
  });

  it('reads nothing more without a finished game of your own', async () => {
    table = [];
    expect(await getSharedRounds(ME, KARI)).toEqual([]);
    expect(fake.ops).toHaveLength(1);
  });

  it('throws when a read fails, so it never looks like no rounds', async () => {
    failOn = (columns) => columns === 'game_id, team_number, result_summary';
    await expect(getSharedRounds(ME, KARI)).rejects.toThrow(/getSharedRounds their rows/);
    failOn = (columns) => columns.includes('games!inner');
    await expect(getSharedRounds(ME, KARI)).rejects.toThrow(/getSharedRounds my games/);
  });
});

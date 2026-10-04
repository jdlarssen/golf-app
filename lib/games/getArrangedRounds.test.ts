import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { PAGE_SIZE } from '@/lib/supabase/selectAllRows';
import type { ArrangedGame, ArrangedRosterRow } from './arrangedGames';
import { arrangedGame, arrangedRosterRow } from './__fixtures__/arrangedGame';

const readCreatorStartBlock = vi.fn();
vi.mock('./readCreatorStartBlock', () => ({
  readCreatorStartBlock: (id: string) => readCreatorStartBlock(id),
}));

const { getArrangedRounds } = await import('./getArrangedRounds');

const game = (id: string, status: ArrangedGame['status'], tee: string | null = null) =>
  arrangedGame({ id, status, scheduled_tee_off_at: tee });

/**
 * A fake PostgREST client: `games` answers in one go, `game_players` serves
 * `.range()` slices capped at the server's max rows, like the real one.
 */
function fakeClient(
  games: ArrangedGame[],
  roster: ArrangedRosterRow[],
  rosterError: { message: string } | null = null,
) {
  const calls = { gamesFilters: [] as unknown[][], rosterIn: [] as unknown[], ranges: [] as number[][] };
  const gamesQuery = {
    select: () => gamesQuery,
    eq: (...args: unknown[]) => (calls.gamesFilters.push(['eq', ...args]), gamesQuery),
    is: (...args: unknown[]) => (calls.gamesFilters.push(['is', ...args]), gamesQuery),
    order: () => gamesQuery,
    returns: () => Promise.resolve({ data: games, error: null }),
  };
  const rosterQuery = () => {
    let ids: string[] = [];
    const q = {
      select: () => q,
      in: (_col: string, values: string[]) => ((ids = values), calls.rosterIn.push(values), q),
      order: () => q,
      range: (from: number, to: number) => {
        calls.ranges.push([from, to]);
        const rows = roster.filter((r) => ids.includes(r.game_id));
        const data = rows.slice(from, Math.min(to + 1, from + PAGE_SIZE));
        return {
          returns: () =>
            Promise.resolve(rosterError ? { data: null, error: rosterError } : { data, error: null }),
        };
      },
    };
    return q;
  };
  const client = {
    from: (table: string) => (table === 'games' ? gamesQuery : rosterQuery()),
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

const rosterOf = (gameId: string, n: number) =>
  Array.from({ length: n }, () => arrangedRosterRow(gameId));

beforeEach(() => {
  readCreatorStartBlock.mockReset();
  readCreatorStartBlock.mockResolvedValue(null);
});

describe('getArrangedRounds', () => {
  it('reads only the viewer’s own standalone games', async () => {
    const { client, calls } = fakeClient([], []);
    await getArrangedRounds(client, 'u1');
    expect(calls.gamesFilters).toEqual([
      ['eq', 'created_by', 'u1'],
      ['is', 'tournament_id', null],
      ['is', 'league_round_id', null],
    ]);
  });

  it('pages the roster read past the 1 000-row cap (#2227)', async () => {
    const games = [game('a', 'active'), game('s', 'scheduled', '2026-10-08T15:30:00Z')];
    const { client, calls } = fakeClient(games, [...rosterOf('a', 900), ...rosterOf('s', 600)]);

    const read = await getArrangedRounds(client, 'u1');

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.rosterByGame.get('a')).toHaveLength(900);
    expect(read.rosterByGame.get('s')).toHaveLength(600);
    expect(calls.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('reads the roster for active and scheduled rounds only', async () => {
    const games = [game('a', 'active'), game('d', 'draft'), game('f', 'finished'), game('s', 'scheduled')];
    const { client, calls } = fakeClient(games, []);
    await getArrangedRounds(client, 'u1');
    expect(calls.rosterIn).toEqual([['a', 's']]);
  });

  it('reads the start block only for the shown scheduled rounds with a tee-off', async () => {
    const games = [
      game('third', 'scheduled', '2026-10-20T09:00:00Z'),
      game('first', 'scheduled', '2026-10-08T09:00:00Z'),
      game('no-time', 'scheduled'),
      game('second', 'scheduled', '2026-10-10T09:00:00Z'),
    ];
    readCreatorStartBlock.mockImplementation(async (id: string) =>
      id === 'first' ? { reason: 'unassigned_flights' } : null,
    );
    const { client } = fakeClient(games, []);

    const read = await getArrangedRounds(client, 'u1', { upcomingLimit: 2 });

    expect(readCreatorStartBlock.mock.calls.map(([id]) => id)).toEqual(['first', 'second']);
    expect(read.ok && [...read.startBlocks]).toEqual([
      ['first', { reason: 'unassigned_flights' }],
      ['second', null],
    ]);
  });

  it('reads no roster and no start block for a plain list', async () => {
    const games = [game('a', 'active'), game('s', 'scheduled', '2026-10-08T15:30:00Z')];
    const { client, calls } = fakeClient(games, rosterOf('a', 3));
    const read = await getArrangedRounds(client, 'u1', { listOnly: true });
    expect(read.ok && read.games).toHaveLength(2);
    expect(calls.rosterIn).toEqual([]);
    expect(readCreatorStartBlock).not.toHaveBeenCalled();
  });

  it('gives { ok: false } when the roster read fails, not zero deliveries (#2490)', async () => {
    const { client } = fakeClient([game('a', 'active')], [], { message: 'roster down' });
    const read = await getArrangedRounds(client, 'u1');
    expect(read.ok).toBe(false);
  });

  it('gives { ok: false } when the games read fails, not an empty list (#2490)', async () => {
    const failing = {
      from: () => ({
        select: () => failing.from(),
        eq: () => failing.from(),
        is: () => failing.from(),
        order: () => failing.from(),
        returns: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
      }),
    };
    const read = await getArrangedRounds(failing as unknown as SupabaseClient<Database>, 'u1');
    expect(read).toEqual({ ok: false, error: { message: 'boom' } });
  });
});

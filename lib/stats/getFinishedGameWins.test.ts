// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2894): who the Toppliste's «Seire» and «Runder» count. The tally has its own
 * suite (`clubStats.test.ts`); here the point is the read: a guest and a deleted account
 * («Slettet bruker») are left off, and everyone else's numbers stay the same.
 */

let tables: Record<string, unknown[]>;
const fake = createAdminClientMock({
  respond: (op: QueryOp): QueryResponse => {
    if (op.kind !== 'select') throw new Error(`uventet ${op.kind}`);
    return { data: tables[op.table] ?? [] };
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));

import { getFinishedGameWins } from './getFinishedGameWins';

const game = (id: string) => ({ id, course_id: 'c-1', game_mode: 'strokeplay', mode_config: null, hole_segment: null, source_game_id: null, league_round_id: null });
const place = (rank: number) => ({ kind: 'placement', rank, fieldSize: 3, isTeam: false });
const live = (name: string) => ({ name, nickname: null, is_guest: false, deleted_at: null });
const player = (gameId: string, userId: string, rank: number, users: object) => ({ game_id: gameId, user_id: userId, withdrawn_at: null, result_summary: place(rank), users });

const DELETED = { name: 'Slettet bruker', nickname: null, is_guest: false, deleted_at: '2026-10-01T00:00:00Z' };

beforeEach(() => {
  fake.reset();
  tables = {
    games: [game('g-1'), game('g-2')],
    game_players: [
      player('g-1', 'u-anne', 1, live('Anne Berg')),
      player('g-1', 'u-del', 2, DELETED),
      player('g-1', 'u-per', 3, live('Per Knutsen')),
      player('g-2', 'u-del', 1, DELETED),
      player('g-2', 'u-per', 2, live('Per Knutsen')),
    ],
  };
});

describe('getFinishedGameWins', () => {
  it('leaves a deleted account out of wins, rounds and names; the others are unchanged', async () => {
    const result = await getFinishedGameWins({ seasonYear: 2026 });

    expect(new Map(result.winnerCounts)).toEqual(new Map([['u-anne', 1]]));
    expect(new Map(result.participationCounts)).toEqual(new Map([['u-anne', 1], ['u-per', 2]]));
    expect(result.userNames.map(([id]) => id).sort()).toEqual(['u-anne', 'u-per']);
  });

  it('asks the users join for deleted_at as well as is_guest', async () => {
    await getFinishedGameWins({ seasonYear: 2026 });

    const read = fake.ops.find((op) => op.table === 'game_players');
    expect(read?.columns).toContain('is_guest, deleted_at');
  });
});

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2894): who the Toppliste's «Birdies» and the «Sjeldne slag» card count. The
 * tallies have their own suites; here the point is the read: a deleted account («Slettet
 * bruker») is left off both, and everyone else's numbers stay the same.
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

import { getSeasonStrokes } from './getSeasonStrokes';

const hole = (n: number, par: number) => ({ course_id: 'c-1', hole_number: n, par_mens: par, par_ladies: par, par_juniors: par, stroke_index: n });
const player = (userId: string, deleted: boolean) => ({
  game_id: 'g-1',
  user_id: userId,
  tee_gender: 'mens',
  withdrawn_at: null,
  users: { is_guest: false, deleted_at: deleted ? '2026-10-01T00:00:00Z' : null },
});

beforeEach(() => {
  fake.reset();
  tables = {
    games: [{ id: 'g-1', game_mode: 'strokeplay', course_id: 'c-1', source_game_id: null, scheduled_tee_off_at: '2026-06-12T08:00:00Z', ended_at: '2026-06-12T13:00:00Z', courses: { name: 'Bogstad' } }],
    game_players: [player('u-per', false), player('u-del', true)],
    scores: [
      { game_id: 'g-1', user_id: 'u-per', hole_number: 1, strokes: 3 },
      { game_id: 'g-1', user_id: 'u-per', hole_number: 2, strokes: 3 },
      { game_id: 'g-1', user_id: 'u-del', hole_number: 1, strokes: 3 },
      { game_id: 'g-1', user_id: 'u-del', hole_number: 3, strokes: 1 },
    ],
    course_holes: [hole(1, 4), hole(2, 5), hole(3, 3)],
  };
});

describe('getSeasonStrokes', () => {
  it('leaves a deleted account out of birdies and rare shots; the others are unchanged', async () => {
    const result = await getSeasonStrokes({ seasonYear: 2026 });

    expect(result.birdies).toEqual([['u-per', 1]]);
    expect(result.moments.map((m) => [m.kind, m.userId, m.hole])).toEqual([['eagle', 'u-per', 2]]);
  });

  it('asks the users join for deleted_at as well as is_guest', async () => {
    await getSeasonStrokes({ seasonYear: 2026 });

    const read = fake.ops.find((op) => op.table === 'game_players');
    expect(read?.columns).toContain('is_guest, deleted_at');
  });
});

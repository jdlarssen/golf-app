// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2894 PR 2): the all-years read behind Æreslista. The tally has its own suite
 * (`rareMoments.test.ts`); here the point is what is read (only low scores, finished
 * games, no season window) and that eagle and uncounted games stay out.
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

import { getRareShotsAllTime, RARE_SHOT_MAX_STROKES } from './getRareShotsAllTime';

const hole = (n: number, par: number) => ({
  course_id: 'c-bogstad',
  hole_number: n,
  par_mens: par,
  par_ladies: par,
  par_juniors: par,
  stroke_index: n,
});
const game = (id: string, mode: string, ended: string) => ({
  id,
  game_mode: mode,
  course_id: 'c-bogstad',
  source_game_id: null,
  scheduled_tee_off_at: ended,
  ended_at: ended,
  courses: { name: 'Bogstad' },
});
const player = (gameId: string, userId: string) => ({
  game_id: gameId,
  user_id: userId,
  tee_gender: 'mens',
  withdrawn_at: null,
  users: { is_guest: false, name: userId === 'u-marte' ? 'Marte Larsen' : 'Per Knutsen', nickname: null },
});

beforeEach(() => {
  fake.reset();
  tables = {
    games: [game('g-2024', 'stableford', '2024-08-17T12:00:00Z'), game('g-2026', 'strokeplay', '2026-09-21T12:00:00Z'), game('g-scr', 'texas_scramble', '2026-09-22T12:00:00Z')],
    game_players: [player('g-2024', 'u-per'), player('g-2026', 'u-marte'), player('g-scr', 'u-per')],
    scores: [
      { game_id: 'g-2024', user_id: 'u-per', hole_number: 4, strokes: 2 },
      { game_id: 'g-2026', user_id: 'u-marte', hole_number: 7, strokes: 1 },
      { game_id: 'g-2026', user_id: 'u-marte', hole_number: 12, strokes: 3 },
    ],
    course_holes: [hole(4, 5), hole(7, 3), hole(12, 5)],
  };
});

describe('getRareShotsAllTime', () => {
  it('finds hole-in-one and albatross across years, not eagle', async () => {
    const result = await getRareShotsAllTime();

    expect(result.moments.map((m) => [m.kind, m.userId, m.hole, m.playedOn]).sort()).toEqual([
      ['albatross', 'u-per', 4, '2024-08-17'],
      ['hole_in_one', 'u-marte', 7, '2026-09-21'],
    ]);
    expect(new Map(result.names).get('u-marte')).toBe('Marte Larsen');
  });

  it('reads finished games of every year, and only scores of at most three strokes', async () => {
    await getRareShotsAllTime();

    const games = fake.ops.find((op) => op.table === 'games');
    expect(games?.filters).toEqual([{ op: 'eq', column: 'status', value: 'finished' }]);
    const scores = fake.ops.find((op) => op.table === 'scores');
    expect(scores?.filters).toContainEqual({ op: 'lte', column: 'strokes', value: RARE_SHOT_MAX_STROKES });
    // A scramble does not count (countsForBirdies), so its scores are never read.
    const scoreGameIds = fake.ops
      .filter((op) => op.table === 'scores')
      .flatMap((op) => op.filters.filter((f) => f.op === 'in').flatMap((f) => f.value as string[]));
    expect(scoreGameIds).not.toContain('g-scr');
  });

  it('with no finished game reads nothing more', async () => {
    tables.games = [];

    expect(await getRareShotsAllTime()).toEqual({ moments: [], names: [], nicknames: [] });
    expect(fake.ops.map((op) => op.table)).toEqual(['games']);
  });
});

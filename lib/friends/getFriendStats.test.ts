// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2267): the reads behind «N runder sammen». PostgREST sends `.in()`
 * lists in the URL and fails past roughly 200 uuids (#2214), so no list may
 * carry more than 100 ids, and the co-player read, which has two lists in one
 * URL, at most 150 together. A player who withdrew counts no round.
 */

const ME = 'meg';
const others = Array.from({ length: 150 }, (_, i) => `u${i}`);
const games = Array.from({ length: 150 }, (_, i) => ({
  game_id: `g${i}`,
  games: { id: `g${i}`, name: `Spill ${i}`, scheduled_tee_off_at: null, ended_at: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z` },
}));

/** The first page of each co-player read: one per pair of slices. */
const coReads = () =>
  fake.ops.filter((op) => op.columns === 'game_id, user_id' && op.range?.[0] === 0);

const inList = (op: QueryOp, column: string) =>
  (op.filters.find((f) => f.op === 'in' && f.column === column)?.value as string[] | undefined) ?? [];

const fake = createAdminClientMock({
  respond: (op) => {
    if (op.table !== 'game_players') throw new Error(`uventet tabell ${op.table}`);
    if (op.columns?.includes('games!inner')) return { data: games };
    // Every other player was in every game: each co-player row the slice asks for.
    const rows = inList(op, 'game_id').flatMap((game_id) =>
      inList(op, 'user_id').map((user_id) => ({ game_id, user_id })),
    );
    const [from, to] = op.range ?? [0, rows.length - 1];
    return { data: rows.slice(from, to + 1) };
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

import { getFriendStats } from './getFriendStats';

beforeEach(() => fake.reset());

describe('getFriendStats', () => {
  it('splits the lists, keeps every URL small and merges the slices', async () => {
    const stats = await getFriendStats(ME, others);

    expect(coReads().length).toBeGreaterThan(1);
    for (const op of fake.ops.filter((o) => o.columns === 'game_id, user_id')) {
      expect(inList(op, 'game_id').length).toBeLessThanOrEqual(50);
      expect(inList(op, 'user_id').length).toBeLessThanOrEqual(100);
      expect(inList(op, 'game_id').length + inList(op, 'user_id').length).toBeLessThanOrEqual(150);
    }
    // Every pair of slices was asked once: all games × all others.
    const pairs = coReads().flatMap((op) =>
      inList(op, 'game_id').flatMap((g) => inList(op, 'user_id').map((u) => `${g}/${u}`)),
    );
    expect(new Set(pairs).size).toBe(150 * 150);
    expect(pairs.length).toBe(150 * 150);

    expect(stats.size).toBe(150);
    expect(stats.get('u0')?.roundsTogether).toBe(150);
    expect(stats.get('u149')?.roundsTogether).toBe(150);
  });

  it('reads my games once and leaves out withdrawn rows on both sides', async () => {
    await getFriendStats(ME, others);
    const mine = fake.ops.filter((op) => op.columns?.includes('games!inner'));
    expect(mine).toHaveLength(1);
    for (const op of fake.ops) {
      expect(op.filters).toContainEqual({ op: 'is', column: 'withdrawn_at', value: null });
    }
  });

  it('gives the same result as one read for a few ids', async () => {
    const stats = await getFriendStats(ME, ['u1', 'u2', 'u1']);
    expect(coReads()).toHaveLength(3); // 150 games in slices of 50, one slice of others
    expect(coReads().every((op) => inList(op, 'user_id').length === 2)).toBe(true);
    expect([...stats.keys()].sort()).toEqual(['u1', 'u2']);
  });
});

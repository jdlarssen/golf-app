import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { createFakeDb } from './testing/fakeDb';

/**
 * Type A per docs/test-discipline.md (#2227). The catch-up runs on mount,
 * focus, `online` and rejoin. In a 150-player game RLS lets every player read
 * ≈2 700 score rows, so the run must merge them in one Dexie transaction and,
 * after the first run, read only what changed.
 */

const fake = createFakeDb();
vi.mock('./db', () => ({ localDb: fake.localDb, scoreKey: fake.scoreKey }));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => supabaseMock }));
vi.mock('./currentUser', () => ({ currentDeviceUserId: async () => 'u0' }));

const MIN = 60_000;
const WATERMARK = '2026-09-27T10:00:00.000Z';
const LAST_FULL = Date.parse('2026-09-27T10:01:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  fake.reset();
});

describe('planCatchUp', () => {
  it.each([
    {
      label: 'no state yet: full read',
      state: undefined,
      now: LAST_FULL,
      plan: { kind: 'full' },
    },
    {
      label: 'the last full read found no rows: full read',
      state: { watermarkIso: null, lastFullAt: LAST_FULL },
      now: LAST_FULL + 5 * MIN,
      plan: { kind: 'full' },
    },
    {
      label: '5 min after a full read: changes since watermark minus 2 min',
      state: { watermarkIso: WATERMARK, lastFullAt: LAST_FULL },
      now: LAST_FULL + 5 * MIN,
      plan: { kind: 'delta', sinceIso: '2026-09-27T09:58:00.000Z' },
    },
    {
      label: '15 min after a full read: full read again',
      state: { watermarkIso: WATERMARK, lastFullAt: LAST_FULL },
      now: LAST_FULL + 15 * MIN,
      plan: { kind: 'full' },
    },
  ])('$label', async ({ state, now, plan }) => {
    const { planCatchUp } = await import('./catchUp');
    expect(planCatchUp(state, now)).toEqual(plan);
  });
});

describe('nextCatchUpState', () => {
  const prev = { watermarkIso: WATERMARK, lastFullAt: LAST_FULL };
  const now = LAST_FULL + 5 * MIN;

  it.each([
    {
      label: 'an empty read leaves the watermark alone',
      plan: { kind: 'delta' as const, sinceIso: '2026-09-27T09:58:00.000Z' },
      rows: [],
      next: prev,
    },
    {
      label: 'the newest updated_at becomes the watermark (PostgREST offsets compared as instants)',
      plan: { kind: 'delta' as const, sinceIso: '2026-09-27T09:58:00.000Z' },
      rows: [
        { updated_at: '2026-09-27T09:59:00+00:00' },
        { updated_at: '2026-09-27T10:03:30.5+00:00' },
      ],
      next: { watermarkIso: '2026-09-27T10:03:30.500Z', lastFullAt: LAST_FULL },
    },
    {
      label: 'a full read also moves lastFullAt',
      plan: { kind: 'full' as const },
      rows: [{ updated_at: '2026-09-27T09:00:00+00:00' }],
      next: { watermarkIso: WATERMARK, lastFullAt: now },
    },
  ])('$label', async ({ plan, rows, next }) => {
    const { nextCatchUpState } = await import('./catchUp');
    expect(nextCatchUpState(prev, plan, rows, now)).toEqual(next);
  });
});

describe('catchUpGameScores', () => {
  // 150 players × 18 holes, one second apart, the last at 09:45:00.
  const rows = Array.from({ length: 2700 }, (_, i) => {
    const user = `u${Math.floor(i / 18)}`;
    return {
      game_id: 'g1',
      user_id: user,
      hole_number: (i % 18) + 1,
      strokes: 4,
      putts: null,
      entered_by: user,
      client_updated_at: '2026-09-27T09:00:00.000Z',
      updated_at: new Date(Date.parse('2026-09-27T09:00:01.000Z') + i * 1000).toISOString(),
    };
  });

  it('merges a full read in one transaction, then reads only what changed', async () => {
    supabaseMock = buildSupabaseMock([
      // First run: three pages.
      { data: rows.slice(0, 1000) },
      { data: rows.slice(1000, 2000) },
      { data: rows.slice(2000) },
      // Second run: nothing changed.
      { data: [] },
    ]);
    const { catchUpGameScores } = await import('./catchUp');

    await catchUpGameScores('g1');
    expect({
      stored: fake.scores.size,
      transactions: fake.localDb.transaction.mock.calls.length,
    }).toEqual({ stored: 2700, transactions: 1 });
    expect(supabaseMock.__fromCalls.filter((c) => c.method === 'gte')).toEqual([]);

    await catchUpGameScores('g1');
    expect(supabaseMock.__fromCalls.filter((c) => c.method === 'gte')).toEqual([
      // Newest row 09:45:00 minus the 2 min overlap.
      { table: 'scores', method: 'gte', args: ['updated_at', '2026-09-27T09:43:00.000Z'] },
    ]);
  });
});

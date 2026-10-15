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
vi.mock('./db', () => ({
  localDb: fake.localDb,
  scoreKey: fake.scoreKey,
  teeShotKey: fake.teeShotKey,
}));

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

// #2580: realtime only delivers changes, so a new device or a PWA that wakes
// up reads the game's tee shots in full and merges them last-write-wins.
describe('catchUpGameTeeShots', () => {
  const row = (hole: number, teeShotBy: string, clientUpdatedAt: string) => ({
    game_id: 'g1',
    team_number: 1,
    hole_number: hole,
    tee_shot_by: teeShotBy,
    entered_by: 'u2',
    client_updated_at: clientUpdatedAt,
    updated_at: clientUpdatedAt,
  });

  it('merges newer server rows and leaves a row that waits in the queue alone', async () => {
    const local = (hole: number, teeShotBy: string, clientUpdatedAt: string) => ({
      id: `g1:1:${hole}`,
      gameId: 'g1',
      teamNumber: 1,
      holeNumber: hole,
      teeShotBy,
      enteredBy: 'u0',
      clientUpdatedAt,
      serverUpdatedAt: null,
    });
    // Hole 1: older locally → the server wins. Hole 2: newer locally → kept.
    // Hole 3: waits in the queue → never overwritten.
    fake.teeShots.set('g1:1:1', local(1, 'marte', '2026-10-14T09:00:00.000Z'));
    fake.teeShots.set('g1:1:2', local(2, 'jonas', '2026-10-14T11:00:00.000Z'));
    fake.teeShots.set('g1:1:3', local(3, 'per', '2026-10-14T09:00:00.000Z'));
    fake.teeShotQueue.set('g1:1:3', {
      id: 'g1:1:3',
      teeShotId: 'g1:1:3',
      attemptCount: 0,
      lastError: null,
      createdAt: '2026-10-14T09:00:00.000Z',
    });
    supabaseMock = buildSupabaseMock([
      {
        data: [
          row(1, 'sigrid', '2026-10-14T10:00:00+00:00'),
          row(2, 'sigrid', '2026-10-14T10:00:00+00:00'),
          row(3, 'sigrid', '2026-10-14T10:00:00+00:00'),
          row(4, 'sigrid', '2026-10-14T10:00:00+00:00'),
        ],
      },
    ]);
    const { catchUpGameTeeShots } = await import('./catchUp');

    await catchUpGameTeeShots('g1');

    expect(supabaseMock.__fromCalls[0]).toMatchObject({ table: 'team_tee_shots' });
    expect([1, 2, 3, 4].map((h) => fake.teeShots.get(`g1:1:${h}`)?.teeShotBy)).toEqual([
      'sigrid',
      'jonas',
      'per',
      'sigrid',
    ]);
  });
});

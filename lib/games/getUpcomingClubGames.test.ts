import { beforeEach, describe, expect, it, vi } from 'vitest';

// The service-role client is the system boundary. A recording builder: every
// call is logged, and awaiting the query resolves `rows`. Its own mock, not a
// shared one: the unit here IS the query shape (which filters, which window),
// and PostgREST does not care in which order the builder calls come, so the
// tests check which calls are there, never their order.
const calls: unknown[][] = [];
let rows: unknown[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => {
    const b: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'in', 'eq', 'is', 'neq', 'gte', 'order', 'limit', 'not', 'overrideTypes']) {
      b[m] = (...args: unknown[]) => (calls.push([m, ...args]), b);
    }
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
    return b;
  },
}));

const { getUpcomingClubGames } = await import('./getUpcomingClubGames');

const names = () => calls.map((c) => c[0]);

beforeEach(() => {
  calls.length = 0;
  rows = [{ id: 'g1' }];
});

describe('getUpcomingClubGames', () => {
  it('reads the scheduled rounds in the given clubs, earliest tee-off first (no time last), 50 at most', async () => {
    const res = await getUpcomingClubGames(['c1', 'c2']);
    expect(res).toEqual({ data: [{ id: 'g1' }], error: null });
    expect(calls).toEqual(
      expect.arrayContaining([
        ['from', 'games'],
        ['in', 'group_id', ['c1', 'c2']],
        ['eq', 'status', 'scheduled'],
        ['order', 'scheduled_tee_off_at', { ascending: true, nullsFirst: false }],
        ['limit', 50],
      ]),
    );
  });

  it('without options: no signup or tee-off filter, no organiser or id exclusion', async () => {
    await getUpcomingClubGames(['c1']);
    expect(names()).not.toContain('is');
    expect(names()).not.toContain('gte');
    expect(names()).not.toContain('neq');
    expect(names()).not.toContain('not');
  });

  it('openSignupsOnly filters closed signups in the query itself, so the 50-row window is not spent on them', async () => {
    await getUpcomingClubGames(['c1'], { openSignupsOnly: true });
    expect(calls.filter((c) => c[0] === 'is')).toEqual([['is', 'signups_closed_at', null]]);
    expect(calls.filter((c) => c[0] === 'limit')).toEqual([['limit', 50]]);
  });

  it.each([
    ['excludeCreatedBy', { excludeCreatedBy: 'u1' }, ['neq', 'created_by', 'u1']],
    ['excludeIds', { excludeIds: ['a', 'b'] }, ['not', 'id', 'in', '(a,b)']],
    ['teeOffFrom', { teeOffFrom: '2026-10-05T10:00:00.000Z' }, ['gte', 'scheduled_tee_off_at', '2026-10-05T10:00:00.000Z']],
  ] as const)('%s', async (_label, opts, expected) => {
    await getUpcomingClubGames(['c1'], opts);
    expect(calls).toContainEqual(expected);
  });

  it('limit replaces the 50-row window', async () => {
    await getUpcomingClubGames(['c1'], { limit: 1 });
    expect(calls.filter((c) => c[0] === 'limit')).toEqual([['limit', 1]]);
  });
});

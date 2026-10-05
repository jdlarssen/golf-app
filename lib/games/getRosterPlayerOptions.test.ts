import { beforeEach, describe, expect, it, vi } from 'vitest';

// #2210 / #2269: an organiser who does not play sees none of the roster under
// users-RLS, so both branches of /games/[id]/rediger add the draft's own
// players to the picker. The service-role read is the system boundary here.
const inCalls: string[][] = [];
const USERS: Record<string, string> = { c: 'Carl', d: 'Dina' };
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => {
      let ids: string[] = [];
      const q = {
        select: () => q,
        in: (_col: string, values: string[]) => ((ids = values), inCalls.push(values), q),
        returns: () =>
          Promise.resolve({
            data: ids.map((id) => ({
              id,
              name: USERS[id],
              nickname: null,
              hcp_index: '12.4',
              profile_completed_at: '2026-09-01T10:00:00Z',
              gender: 'mens',
              level: 'normal',
              is_guest: false,
            })),
            error: null,
          }),
      };
      return q;
    },
  }),
}));

const { withRosterPlayerOptions } = await import('./getRosterPlayerOptions');

beforeEach(() => {
  inCalls.length = 0;
});

describe('withRosterPlayerOptions', () => {
  it('adds the roster players the caller cannot see, after its own options and without duplicates', async () => {
    const own = [
      { id: 'a', name: 'Anne' },
      { id: 'b', name: 'Bjørn' },
    ];
    const merged = await withRosterPlayerOptions(own, ['b', 'c', 'd']);
    expect(merged.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    // Only the missing ids are read with the service role.
    expect(inCalls).toEqual([['c', 'd']]);
    expect(merged[2]).toMatchObject({ id: 'c', name: 'Carl', hcp_index: 12.4 });
  });

  it('reads nothing when every roster player is already an option', async () => {
    const own = [{ id: 'a', name: 'Anne' }];
    expect((await withRosterPlayerOptions(own, ['a'])).map((p) => p.id)).toEqual(['a']);
    expect(inCalls).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const friendIds = vi.fn<() => string[]>();
const coPlayerIds = vi.fn<() => string[]>();
const usersRows = vi.fn<() => { data: Row[] | null; error: unknown }>();
const inArg = vi.fn();

vi.mock('@/lib/friends/getFriendIds', () => ({
  getFriendIds: () => Promise.resolve(friendIds()),
}));
vi.mock('./getCoPlayerIds', () => ({
  getCoPlayerIds: () => Promise.resolve(coPlayerIds()),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: (...args: unknown[]) => {
          inArg(...args);
          return { returns: () => Promise.resolve(usersRows()) };
        },
      }),
    }),
  }),
}));

import { getTeamCandidates } from './getTeamCandidates';

beforeEach(() => {
  vi.clearAllMocks();
  usersRows.mockReturnValue({ data: [], error: null });
});

describe('getTeamCandidates (venner ∪ co-players, #408)', () => {
  it('unions friends and co-players, dedupes, and queries that id set', async () => {
    friendIds.mockReturnValue(['f1', 'shared']);
    coPlayerIds.mockReturnValue(['c1', 'shared']);
    usersRows.mockReturnValue({
      data: [
        { id: 'f1', name: 'Bea', nickname: null, email: 'b@x.no' },
        { id: 'c1', name: 'Ola', nickname: null, email: 'o@x.no' },
        { id: 'shared', name: 'Mia', nickname: null, email: 'm@x.no' },
      ],
      error: null,
    });

    const res = await getTeamCandidates('me');

    const queried = inArg.mock.calls[0][1] as string[];
    expect([...queried].sort()).toEqual(['c1', 'f1', 'shared']);
    expect(res.map((u) => u.id).sort()).toEqual(['c1', 'f1', 'shared']);
  });

  it('includes a friend with no shared game (the core #408 promise)', async () => {
    friendIds.mockReturnValue(['friend-only']);
    coPlayerIds.mockReturnValue([]);
    usersRows.mockReturnValue({
      data: [{ id: 'friend-only', name: 'Kari', nickname: null, email: 'k@x.no' }],
      error: null,
    });

    const res = await getTeamCandidates('me');
    expect(res.map((u) => u.id)).toEqual(['friend-only']);
  });

  it('returns empty without querying when there are no candidates', async () => {
    friendIds.mockReturnValue([]);
    coPlayerIds.mockReturnValue([]);

    const res = await getTeamCandidates('me');
    expect(res).toEqual([]);
    expect(inArg).not.toHaveBeenCalled();
  });

  it('drops profiles without an email and sorts by name (nb)', async () => {
    friendIds.mockReturnValue(['a', 'b', 'noemail']);
    coPlayerIds.mockReturnValue([]);
    usersRows.mockReturnValue({
      data: [
        { id: 'b', name: 'Øyvind', nickname: null, email: 'o@x.no' },
        { id: 'a', name: 'Anne', nickname: null, email: 'a@x.no' },
        { id: 'noemail', name: 'Ghost', nickname: null, email: '' },
      ],
      error: null,
    });

    const res = await getTeamCandidates('me');
    expect(res.map((u) => u.name)).toEqual(['Anne', 'Øyvind']);
  });
});

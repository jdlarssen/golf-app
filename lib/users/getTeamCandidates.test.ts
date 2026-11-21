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
          // #1012: .is('deleted_at', null)-leddet i kjeden
          return { is: () => ({ returns: () => Promise.resolve(usersRows()) }) };
        },
      }),
    }),
  }),
}));

// 0251: whose guest it is. The real helper, on top of a lookup the test owns.
const foreignGuestIds = vi.fn<() => Promise<Set<string>>>(async () => new Set());
vi.mock('@/lib/games/guestOwnership', async () => {
  return {
    withoutForeignGuests: async <T extends { id: string; isGuest?: boolean }>(
      _actor: string,
      rows: T[],
    ) => {
      const foreign = await foreignGuestIds();
      return rows.filter((r) => !foreign.has(r.id));
    },
  };
});

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

describe('guests (0251)', () => {
  it('offers the guest you may use and leaves out another organiser\'s', async () => {
    friendIds.mockReturnValue([]);
    coPlayerIds.mockReturnValue(['g-mine', 'g-theirs', 'c1']);
    usersRows.mockReturnValue({
      data: [
        { id: 'g-mine', name: 'Gjest A', nickname: null, email: 'gjest-a@example.test', is_guest: true },
        { id: 'g-theirs', name: 'Gjest B', nickname: null, email: 'gjest-b@example.test', is_guest: true },
        { id: 'c1', name: 'Ola', nickname: null, email: 'ola@example.test', is_guest: false },
      ],
      error: null,
    });
    foreignGuestIds.mockResolvedValueOnce(new Set(['g-theirs']));

    const res = await getTeamCandidates('me');

    expect(res.map((u) => u.id)).toEqual(['g-mine', 'c1']);
  });
});

describe('addresses stay on the server (#2207)', () => {
  it('candidates carry the masked address and no email key', async () => {
    friendIds.mockReturnValue(['a']);
    coPlayerIds.mockReturnValue([]);
    usersRows.mockReturnValue({
      data: [{ id: 'a', name: null, nickname: null, email: 'ola.nordmann@example.test', is_guest: false }],
      error: null,
    });

    const [candidate] = await getTeamCandidates('me');

    expect(candidate).toMatchObject({ id: 'a', maskedEmail: 'ol•••@example.test' });
    expect('email' in candidate!).toBe(false);
  });
});

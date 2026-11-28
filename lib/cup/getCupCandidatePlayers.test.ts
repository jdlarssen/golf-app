import { describe, it, expect, vi } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

// The admin branch never reaches these sources; mocked so the module loads
// without the admin client.
vi.mock('@/lib/clubs/getClubMemberOptionsForClub', () => ({
  getClubMemberOptionsForClub: vi.fn(),
}));
vi.mock('@/lib/friends/getFriendPlayerOptions', () => ({
  getFriendPlayerOptions: vi.fn(),
}));
vi.mock('@/lib/moderation/blockedPairs', () => ({
  getBlockedPairIds: vi.fn(async () => new Set(['blokkert'])),
}));

import { getCupCandidatePlayers } from './getCupCandidatePlayers';
import { getClubMemberOptionsForClub } from '@/lib/clubs/getClubMemberOptionsForClub';

/**
 * #2323: a deleted account keeps its `users` row (0131 anonymises it to
 * «Slettet bruker» and sets `deleted_at`), and 2 of 3 on staging still have
 * `profile_completed_at`. The global admin's list for a personal cup must
 * filter on `deleted_at`, or the account is a selectable cup player.
 */
describe('getCupCandidatePlayers, personal cup as global admin (#2323)', () => {
  it('reads users without deleted accounts', async () => {
    const client = buildSupabaseMock([{ data: [], error: null }]);

    await getCupCandidatePlayers(client as never, {
      groupId: null,
      userId: 'admin-1',
      isAdmin: true,
      unknownLabel: 'Ukjent',
    });

    expect(client.__fromCalls).toContainEqual({
      table: 'users',
      method: 'is',
      args: ['deleted_at', null],
    });
  });
});

describe('getCupCandidatePlayers, club cup (#3019)', () => {
  it('leaves out a member the caller has a block with', async () => {
    vi.mocked(getClubMemberOptionsForClub).mockResolvedValueOnce([
      { id: 'venn', name: 'Kari', nickname: null, hcp_index: 10, gender: null, pending: false },
      { id: 'blokkert', name: 'Ola', nickname: null, hcp_index: 12, gender: null, pending: false },
    ] as never);

    const players = await getCupCandidatePlayers(buildSupabaseMock([]) as never, {
      groupId: 'klubb-1',
      userId: 'arrangor',
      isAdmin: false,
      unknownLabel: 'Ukjent',
    });

    expect(players.map((p) => p.id)).toEqual(['venn']);
  });
});

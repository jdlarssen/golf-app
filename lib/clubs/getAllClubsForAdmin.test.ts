// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (audit 2026-11-20): the admin club list. A failed read is not «no
 * clubs» or «0 members»: it throws, and /admin/klubber shows its error screen.
 */

let respond: (op: QueryOp) => QueryResponse = () => ({ data: [] });
const fake = createAdminClientMock({ respond: (op) => respond(op) });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

import { getAllClubsForAdmin } from './getAllClubsForAdmin';

const GROUPS = [
  { id: 'g1', name: 'Bjørkly GK', short_id: 'BJK', member_cap: 40, valid_until: null },
];
const MEMBERS = [
  { group_id: 'g1', role: 'owner', user_id: 'u1', users: { name: 'Kari Nord', nickname: null } },
  { group_id: 'g1', role: 'member', user_id: 'u2', users: { name: 'Ola Sør', nickname: null } },
];

beforeEach(() => {
  fake.reset();
  respond = (op) => {
    if (op.table === 'groups') return { data: GROUPS };
    // Members come in pages of 1 000 (selectAllRows).
    const [from] = op.range ?? [0, 999];
    return { data: from === 0 ? MEMBERS : [] };
  };
});

describe('getAllClubsForAdmin', () => {
  it('counts members and names the owners', async () => {
    const rows = await getAllClubsForAdmin();
    expect(rows).toEqual([
      expect.objectContaining({ id: 'g1', memberCount: 2, ownerNames: ['Kari Nord'] }),
    ]);
  });

  it.each(['groups', 'group_members'])('a failed %s read throws instead of a short list', async (table) => {
    const base = respond;
    respond = (op) => (op.table === table ? { data: null, error: { message: 'read failed' } } : base(op));
    await expect(getAllClubsForAdmin()).rejects.toThrow();
  });
});

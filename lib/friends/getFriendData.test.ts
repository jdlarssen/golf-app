// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2267): the name lookup on the friends page. Friends, requests and
 * suggestions can pass 100 people at club scale, and PostgREST fails past
 * roughly 200 uuids in one `.in()` (#2214), so the lookup goes in slices.
 */

const ME = 'meg';
const coPlayers = Array.from({ length: 150 }, (_, i) => `u${i}`);

let failUsers = false;
const fake = createAdminClientMock({
  respond: (op: QueryOp) => {
    if (op.table === 'friendships') {
      return { data: [{ id: 'f1', requester_id: ME, addressee_id: 'u0', status: 'accepted' }] };
    }
    if (op.table === 'users') {
      if (failUsers) return { data: null, error: { message: 'nede' } };
      const ids = op.filters.find((f) => f.op === 'in')?.value as string[];
      return { data: ids.map((id) => ({ id, name: `Navn ${id}`, nickname: null, email: `${id}@example.test` })) };
    }
    throw new Error(`uventet tabell ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/users/getCoPlayerIds', () => ({ getCoPlayerIds: async () => coPlayers }));

import { getFriendData } from './getFriendData';

beforeEach(() => {
  fake.reset();
  failUsers = false;
});

describe('getFriendData', () => {
  it('looks the names up in slices of at most 100 and finds everyone', async () => {
    const data = await getFriendData(ME);
    const lookups = fake.ops.filter((op) => op.table === 'users');
    expect(lookups.length).toBeGreaterThan(1);
    for (const op of lookups) {
      const ids = op.filters.find((f) => f.op === 'in')?.value as string[];
      expect(ids.length).toBeLessThanOrEqual(100);
    }
    expect(data.friends.map((u) => u.id)).toEqual(['u0']);
    expect(data.suggestions).toHaveLength(149);
  });

  it('a failed lookup gives empty lists, as before', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failUsers = true;
    const data = await getFriendData(ME);
    expect(data.friends).toEqual([]);
    expect(data.suggestions).toEqual([]);
  });
});

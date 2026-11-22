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

/** The lookup of the slice that starts at the 101st person fails. */
let failSecondSlice = false;
/** Co-players whose account was deleted (anonymize_user sets deleted_at). */
let deletedIds = new Set<string>();
const fake = createAdminClientMock({
  respond: (op: QueryOp) => {
    if (op.table === 'friendships') {
      return { data: [{ id: 'f1', requester_id: ME, addressee_id: 'u0', status: 'accepted' }] };
    }
    if (op.table === 'users') {
      const ids = op.filters.find((f) => f.op === 'in')?.value as string[];
      if (failSecondSlice && ids[0] === 'u100') return { data: null, error: { message: 'nede' } };
      return {
        data: ids.map((id) =>
          deletedIds.has(id)
            ? { id, name: 'Slettet bruker', nickname: null, email: `slettet+${id}@deleted.tornygolf.no`, deleted_at: '2026-11-01T10:00:00Z' }
            : { id, name: `Navn ${id}`, nickname: null, email: `${id}@example.test`, deleted_at: null },
        ),
      };
    }
    throw new Error(`uventet tabell ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/users/getCoPlayerIds', () => ({ getCoPlayerIds: async () => coPlayers }));

import { getFriendData } from './getFriendData';

beforeEach(() => {
  fake.reset();
  failSecondSlice = false;
  deletedIds = new Set();
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

  it('one failed slice leaves no names, not half a list', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    failSecondSlice = true;
    const data = await getFriendData(ME);
    expect(data.friends).toEqual([]);
    expect(data.suggestions).toEqual([]);
    expect(log).toHaveBeenCalledWith('[getFriendData] user lookup failed', expect.anything());
  });

  // Audit 2026-11-20: a deleted account you once played with is no
  // suggestion. Its row stays (game_players keeps it) as «Slettet bruker».
  it('leaves deleted accounts out of the suggestions', async () => {
    deletedIds = new Set(['u7', 'u8']);
    const data = await getFriendData(ME);
    const ids = data.suggestions.map((u) => u.id);
    expect(ids).not.toContain('u7');
    expect(ids).not.toContain('u8');
    expect(data.suggestions).toHaveLength(147);
    expect(data.suggestions.some((u) => u.name === 'Slettet bruker')).toBe(false);
  });
});

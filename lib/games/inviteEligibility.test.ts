// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClientMock, type QueryOp } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (audit 2026-11-20): the deleted-account filter sends the whole
 * eligible set in one `.in()`. PostgREST fails past roughly 200 uuids in the
 * URL (#2214), and the failure shrank the set to empty, so every invite was
 * refused. The lookup now goes in slices.
 */

const coPlayers = Array.from({ length: 250 }, (_, i) => `u${i}`);
let failSlice = false;
const fake = createAdminClientMock({
  respond: (op: QueryOp) => {
    if (op.table === 'users') {
      const ids = op.filters.find((f) => f.op === 'in')?.value as string[];
      if (failSlice && ids.includes('u200')) return { data: null, error: { message: 'nede' } };
      // u3 is a deleted account: the `deleted_at is null` filter drops it.
      return { data: ids.filter((id) => id !== 'u3').map((id) => ({ id })) };
    }
    throw new Error(`uventet tabell ${op.table}`);
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/users/getCoPlayerIds', () => ({ getCoPlayerIds: async () => coPlayers }));
vi.mock('@/lib/friends/getFriendIds', () => ({ getFriendIds: async () => ['venn-1'] }));
let blocked: Set<string> | Error = new Set();
vi.mock('@/lib/moderation/blockedPairs', () => ({
  getBlockedPairIds: async () => {
    if (blocked instanceof Error) throw blocked;
    return blocked;
  },
}));

import { getInviteEligibleIds } from './inviteEligibility';

beforeEach(() => {
  fake.reset();
  failSlice = false;
  blocked = new Set();
});

describe('getInviteEligibleIds — the deleted-account filter', () => {
  it('looks the set up in slices of at most 100 ids and keeps everyone eligible', async () => {
    const ids = await getInviteEligibleIds('arrangor', null);

    const lookups = fake.ops.filter((op) => op.table === 'users');
    expect(lookups.length).toBeGreaterThan(1);
    for (const op of lookups) {
      expect((op.filters.find((f) => f.op === 'in')?.value as string[]).length).toBeLessThanOrEqual(100);
      expect(op.filters).toContainEqual(expect.objectContaining({ column: 'deleted_at', value: null }));
    }
    expect(ids.size).toBe(250); // 250 co-players + 1 friend − 1 deleted
    expect(ids.has('venn-1')).toBe(true);
    expect(ids.has('u249')).toBe(true);
    expect(ids.has('u3')).toBe(false);
  });

  it('a failed slice still fails safe: an empty set, so the invite is refused', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    failSlice = true;

    expect((await getInviteEligibleIds('arrangor', null)).size).toBe(0);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('getInviteEligibleIds — blocks (#3019)', () => {
  it('drops everyone the creator has a block with', async () => {
    blocked = new Set(['u7', 'venn-1']);
    const ids = await getInviteEligibleIds('arrangor', null);
    expect(ids.has('u7')).toBe(false);
    expect(ids.has('venn-1')).toBe(false);
    expect(ids.has('u8')).toBe(true);
  });

  it('a failed block lookup fails safe: an empty set', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    blocked = new Error('nede');
    expect((await getInviteEligibleIds('arrangor', null)).size).toBe(0);
    log.mockRestore();
  });
});

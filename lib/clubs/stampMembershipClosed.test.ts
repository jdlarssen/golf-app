import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * The leave/removal stamp behind the owner's «Etter 7 dager»: one upsert on
 * (group_id, user_id) to status withdrawn with decided_at and the actor; a
 * write that hit no row, or failed, answers false so the caller stops.
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));

import { stampMembershipClosed } from './stampMembershipClosed';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('stampMembershipClosed', () => {
  it('upserts the closed row on (group, user)', async () => {
    adminMock = buildSupabaseMock([{ data: [{ id: 'req-1' }], error: null }]);
    expect(await stampMembershipClosed('g-1', 'u-2', 'u-1')).toBe(true);
    const upsert = adminMock.__fromCalls.find((c) => c.method === 'upsert');
    expect(upsert?.table).toBe('group_join_requests');
    expect(upsert?.args[0]).toMatchObject({
      group_id: 'g-1',
      user_id: 'u-2',
      status: 'withdrawn',
      decided_by_user_id: 'u-1',
    });
    expect(typeof (upsert?.args[0] as { decided_at: unknown }).decided_at).toBe('string');
    expect(upsert?.args[1]).toEqual({ onConflict: 'group_id,user_id' });
  });

  it.each([
    ['0 rows', { data: [], error: null }],
    ['an error', { data: null, error: { message: 'nede' } }],
  ])('%s → false', async (_label, result) => {
    adminMock = buildSupabaseMock([result]);
    expect(await stampMembershipClosed('g-1', 'u-2', 'u-1')).toBe(false);
  });
});

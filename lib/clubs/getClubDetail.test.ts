import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * getClubDetail — pending-join-request visibility (#798).
 *
 * The bug: the `group_join_requests` embed `users(...)` was ambiguous (2 FKs to
 * users) and returned PGRST201, but `requestsRes.data ?? []` swallowed the
 * error silently, so club owners/admins saw ZERO pending requests and could not
 * approve/reject anyone. The fix adds the FK hint AND surfaces the error.
 *
 * These tests pin the two halves: the mapping returns the requests, and a query
 * error is logged (never swallowed silently) while the page still degrades
 * rather than 500-ing. The hint itself is enforced repo-wide by
 * lib/supabase/embedAmbiguity.test.ts.
 */

type Result = { data: unknown; error: unknown };

/** Chainable PostgREST-shaped builder that resolves (and is thenable) to `result`. */
function makeBuilder(result: Result) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    maybeSingle: async () => result,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

let adminResults: Record<string, Result>;

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) =>
      makeBuilder(adminResults[table] ?? { data: [], error: null }),
  }),
}));

import { getClubDetail } from './getClubDetail';

const CLUB_ID = 'club-1';
const USER_ID = 'me';

/** Request-scoped client: the caller is an owner of the club. */
function ownerClient(): SupabaseClient {
  return {
    from: () => makeBuilder({ data: { role: 'owner' }, error: null }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  adminResults = {
    groups: {
      data: { id: CLUB_ID, name: 'Klubben', short_id: 'abc', member_cap: null, valid_until: null },
      error: null,
    },
    group_members: {
      data: [
        { user_id: 'me', role: 'owner', joined_at: '2026-01-01', users: { name: 'Eier', nickname: null } },
      ],
      error: null,
    },
    group_join_requests: { data: [], error: null },
    club_invitations: { data: [], error: null },
  };
});

describe('getClubDetail', () => {
  it('returns pending join requests for an owner/admin (#798)', async () => {
    adminResults.group_join_requests = {
      data: [
        {
          id: 'req-1',
          created_at: '2026-06-20',
          user_id: 'u2',
          message: 'slipp meg inn',
          users: { name: 'Kari Nordmann', nickname: 'Kari' },
        },
      ],
      error: null,
    };

    const detail = await getClubDetail(ownerClient(), CLUB_ID, USER_ID);

    expect(detail?.pendingRequests).toEqual([
      { id: 'req-1', requesterName: 'Kari', requestedAt: '2026-06-20', message: 'slipp meg inn' },
    ]);
  });

  it('logs (does not silently swallow) a join-requests query error (#798)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminResults.group_join_requests = {
      data: null,
      error: { code: 'PGRST201', message: 'more than one relationship was found' },
    };

    const detail = await getClubDetail(ownerClient(), CLUB_ID, USER_ID);

    // Degrades to empty (no 500) but the error is now observable in the logs.
    expect(detail?.pendingRequests).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[getClubDetail] join-requests query failed',
      expect.objectContaining({
        clubId: CLUB_ID,
        error: expect.objectContaining({ code: 'PGRST201' }),
      }),
    );
    errorSpy.mockRestore();
  });
});

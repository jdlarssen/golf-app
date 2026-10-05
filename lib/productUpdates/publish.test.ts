import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * #2201: news about Tørny goes to signed-up, live accounts only. A guest or an
 * anonymised account can never read the row, so it never gets one.
 *
 * Query order on the admin client:
 *   [0] product_updates.insert(...).select('id').single()
 *   [1] users.select('id')...range(0, 999).returns()  (one short page ends it)
 */

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const notifyMock = vi.fn(async () => ({ shouldAlsoSendMail: false }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...(args as [])),
}));

const UPDATE_ID = '00000000-0000-0000-0000-0000000000aa';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('publishProductUpdate', () => {
  it('reads recipients without guests and deleted accounts, and notifies each', async () => {
    adminMock = buildSupabaseMock([
      { data: { id: UPDATE_ID }, error: null },
      { data: [{ id: 'u1' }, { id: 'u2' }], error: null },
    ]);
    const { publishProductUpdate } = await import('./publish');

    const result = await publishProductUpdate({
      title: 'Nytt',
      body: 'Tekst',
      createdByUserId: 'admin-1',
    });

    const userCalls = adminMock.__fromCalls.filter((c) => c.table === 'users');
    expect(userCalls).toContainEqual(expect.objectContaining({ method: 'eq', args: ['is_guest', false] }));
    expect(userCalls).toContainEqual(expect.objectContaining({ method: 'is', args: ['deleted_at', null] }));
    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ id: UPDATE_ID, recipientCount: 2, failedCount: 0 });
  });
});

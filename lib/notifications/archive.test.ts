import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
// archive bruker cookies-klienten (RLS via notifications_update_own), i
// motsetning til markRead som må være cookies-fri for after()-kallerne.
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * #1665: de to arkiverings-modusene har ulikt 0-rads-regime. PostgREST melder
 * ikke feil for en UPDATE som traff ingenting (AGENTS.md felle 2), så ett
 * enkelt varsel må telle rader selv — ellers ser en RLS-blokkert arkivering
 * vellykket ut og kortet forsvinner fra lista uten å være arkivert.
 */
describe('archiveNotifications', () => {
  it('ett varsel som treffer 0 rader → false, ingen revalidate', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    const { archiveNotifications } = await import('./archive');

    const ok = await archiveNotifications({ userId: 'u1', notificationId: 'n-1' });

    expect(ok).toBe(false);
    expect(revalidateTagMock).not.toHaveBeenCalled();
    // `.select('id')` er det som gjør radantallet synlig i det hele tatt.
    expect(supabaseMock.__fromCalls).toContainEqual(
      expect.objectContaining({ method: 'select', args: ['id'] }),
    );
    consoleErr.mockRestore();
  });

  it('ett varsel som treffer 1 rad → true + revalidateTag', async () => {
    supabaseMock = buildSupabaseMock([{ data: [{ id: 'n-1' }], error: null }]);
    const { archiveNotifications } = await import('./archive');

    const ok = await archiveNotifications({ userId: 'u1', notificationId: 'n-1' });

    expect(ok).toBe(true);
    expect(revalidateTagMock).toHaveBeenCalledWith('notifications-u1', 'max');
  });

  it('«Tøm leste» som treffer 0 rader → true (ingenting lest er lov)', async () => {
    supabaseMock = buildSupabaseMock([{ data: [], error: null }]);
    const { archiveNotifications } = await import('./archive');

    const ok = await archiveNotifications({ userId: 'u1' });

    expect(ok).toBe(true);
    expect(revalidateTagMock).toHaveBeenCalledWith('notifications-u1', 'max');
  });
});

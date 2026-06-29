import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Co-located test for markIdeaBuilt — #984 closed loop.
 *
 * Focus: marking an idea built updates the row (status='bygd') and fires the
 * idea_built in-app notification to the submitter; an off-app submitter also
 * gets the fallback mail. Admin-only RLS on the UPDATE is verified live against
 * staging (a non-admin PATCH matches 0 rows).
 */

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: vi.fn(async () => {}) }));

const notifyMock = vi.fn(
  async (..._args: unknown[]): Promise<{ shouldAlsoSendMail: boolean }> => ({
    shouldAlsoSendMail: false,
  }),
);
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

const builtMailMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/mail/ideaBuiltNotification', () => ({
  sendIdeaBuiltNotification: (...args: unknown[]) => builtMailMock(...args),
}));

vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));

const submitterId = '252e1a6f-660c-41a7-a289-5a16aaa4e4a1';

async function run(id: string) {
  const { markIdeaBuilt } = await import('./actions');
  const fd = new FormData();
  if (id) fd.set('id', id);
  await markIdeaBuilt(fd);
}

beforeEach(() => {
  vi.clearAllMocks();
  notifyMock.mockResolvedValue({ shouldAlsoSendMail: false });
});

describe('markIdeaBuilt', () => {
  it('marks the row built and notifies the submitter in-app', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [{ user_id: submitterId }], error: null }, // update .select('user_id')
    ]);

    await run('idea-9');

    const update = supabaseMock.__fromCalls.find(
      (c) => c.table === 'idea_submissions' && c.method === 'update',
    );
    expect((update?.args[0] as { status?: string }).status).toBe('bygd');
    expect(notifyMock).toHaveBeenCalledWith({
      userId: submitterId,
      kind: 'idea_built',
      payload: { submission_id: 'idea-9' },
    });
    expect(builtMailMock).not.toHaveBeenCalled();
  });

  it('also sends the fallback mail when the submitter is off-app', async () => {
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    supabaseMock = buildSupabaseMock([
      { data: [{ user_id: submitterId }], error: null }, // update
      { data: { email: 'spiller@torny.no', name: 'Per', locale: 'no' }, error: null }, // user lookup
    ]);

    await run('idea-9');

    expect(builtMailMock).toHaveBeenCalledTimes(1);
    expect((builtMailMock.mock.calls[0][0] as { to: string }).to).toBe('spiller@torny.no');
  });

  it('does nothing without an id', async () => {
    supabaseMock = buildSupabaseMock([]);

    await run('');

    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

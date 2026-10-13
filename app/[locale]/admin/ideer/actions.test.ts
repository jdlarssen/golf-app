import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

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
// #2207: the submitter's e-post is read with the admin client (behind the
// requireAdmin gate) — users.email is not readable through a user session.
let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));

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

// #2568: the action redirects back to the list, with ?error= on bad input.
const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));

const submitterId = '252e1a6f-660c-41a7-a289-5a16aaa4e4a1';
const SUMMARY = 'Ryder Cup-oppsettet er klart';

/** Runs the action; returns the redirect target, or undefined without one. */
async function run(
  id: string,
  fields: { summary?: string; link?: string } = {},
): Promise<string | undefined> {
  const { markIdeaBuilt } = await import('./actions');
  const fd = new FormData();
  if (id) fd.set('id', id);
  fd.set('summary', fields.summary ?? SUMMARY);
  fd.set('link', fields.link ?? '');
  try {
    await markIdeaBuilt(fd);
    return undefined;
  } catch (err) {
    if (err instanceof RedirectError) return err.url;
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock = buildSupabaseMock([]);
  notifyMock.mockResolvedValue({ shouldAlsoSendMail: false });
});

describe('markIdeaBuilt', () => {
  it('marks the row built and notifies the submitter in-app', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [{ user_id: submitterId }], error: null }, // update .select('user_id')
    ]);

    expect(await run('idea-9')).toBe('/admin/ideer');

    const update = supabaseMock.__fromCalls.find(
      (c) => c.table === 'idea_submissions' && c.method === 'update',
    );
    expect((update?.args[0] as { status?: string }).status).toBe('bygd');
    expect(notifyMock).toHaveBeenCalledWith({
      userId: submitterId,
      kind: 'idea_built',
      payload: { submission_id: 'idea-9', summary: SUMMARY },
    });
    expect(builtMailMock).not.toHaveBeenCalled();
  });

  it('also sends the fallback mail when the submitter is off-app', async () => {
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    supabaseMock = buildSupabaseMock([
      { data: [{ user_id: submitterId }], error: null }, // update
    ]);
    adminMock = buildSupabaseMock([
      { data: { email: 'spiller@example.test', name: 'Per', locale: 'no' }, error: null }, // user lookup
    ]);

    expect(await run('idea-9')).toBe('/admin/ideer');

    expect(builtMailMock).toHaveBeenCalledTimes(1);
    expect(builtMailMock).toHaveBeenCalledWith({
      to: 'spiller@example.test',
      name: 'Per',
      locale: 'no',
      summary: SUMMARY,
      link: null,
    });
    expect(supabaseMock.__fromCalls.some((c) => c.table === 'users')).toBe(false);
  });

  it('does nothing without an id', async () => {
    supabaseMock = buildSupabaseMock([]);

    await run('');

    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  // #2568: the line and link reach the card and the mail.
  it('passes the line and link on to the notification and the mail', async () => {
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: true });
    supabaseMock = buildSupabaseMock([
      { data: [{ user_id: submitterId }], error: null }, // update
    ]);
    adminMock = buildSupabaseMock([
      { data: { email: 'spiller@example.test', name: 'Per', locale: 'no' }, error: null },
    ]);

    const target = await run('idea-9', { summary: `  ${SUMMARY}  `, link: ' /spillformater ' });

    expect(notifyMock).toHaveBeenCalledWith({
      userId: submitterId,
      kind: 'idea_built',
      payload: { submission_id: 'idea-9', summary: SUMMARY, link: '/spillformater' },
    });
    expect(builtMailMock).toHaveBeenCalledWith({
      to: 'spiller@example.test',
      name: 'Per',
      locale: 'no',
      summary: SUMMARY,
      link: '/spillformater',
    });
    expect(target).toBe('/admin/ideer');
  });

  it.each([
    [{ summary: '   ' }, 'summary_required'],
    [{ link: '//x.no' }, 'link_must_be_internal'],
    [{ link: '/en/cup' }, 'link_has_locale'],
  ] as const)('bad input %j → ?error=%s, the row is left alone', async (fields, code) => {
    supabaseMock = buildSupabaseMock([]);

    expect(await run('idea-9', fields)).toBe(`/admin/ideer?error=${code}`);

    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(builtMailMock).not.toHaveBeenCalled();
  });
});

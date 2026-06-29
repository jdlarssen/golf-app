import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Co-located test for submitIdea — #984 (Foreslå en idé).
 *
 * Focus (the insert contract + gating; RLS itself is verified live against
 * staging via role/JWT simulation, not mockable here):
 * - empty / oversized text → redirect with ?error=empty, NO insert
 * - unauthenticated → redirect /login
 * - happy path → inserts {user_id, text} into idea_submissions, redirects ?sent=1
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'no' }));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

const mailMock = vi.fn(async () => {});
vi.mock('@/lib/mail/ideaSubmittedNotification', () => ({
  sendIdeaSubmittedNotification: (...args: unknown[]) => mailMock(...args),
}));

const userId = '252e1a6f-660c-41a7-a289-5a16aaa4e4a1';

function setAuth(user: { id: string } | null) {
  supabaseMock.auth.getUser = vi.fn(async () => ({ data: { user } })) as unknown as
    typeof supabaseMock.auth.getUser;
}

function lastRedirect(): string | undefined {
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  if (arg == null) return undefined;
  return typeof arg === 'string' ? arg : arg.href;
}

async function run(fd: FormData) {
  const { submitIdea } = await import('./actions');
  try {
    await submitIdea(fd);
  } catch (err) {
    if (!(err instanceof RedirectError)) throw err;
  }
}

function form(text: string): FormData {
  const fd = new FormData();
  fd.set('text', text);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('submitIdea', () => {
  it('rejects empty text without touching the database', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth({ id: userId });

    await run(form('   '));

    expect(lastRedirect()).toBe('/foreslaa-ide?error=empty');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('rejects text over 2000 chars', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth({ id: userId });

    await run(form('x'.repeat(2001)));

    expect(lastRedirect()).toBe('/foreslaa-ide?error=empty');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated users to /login', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth(null);

    await run(form('En god idé'));

    expect(lastRedirect()).toBe('/login');
  });

  it('inserts the idea with the caller user_id and redirects to the sent state', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [{ id: 'idea-1' }], error: null }, // insert .select('id')
      { data: { name: 'Per Spiller' }, error: null }, // submitter name
      {
        data: [{ id: 'admin-1', email: 'admin@torny.no', name: 'Jørgen', locale: 'no' }],
        error: null,
      }, // admins
    ]);
    setAuth({ id: userId });

    await run(form('  Putt-statistikk per hull  '));

    const insert = supabaseMock.__fromCalls.find(
      (c) => c.table === 'idea_submissions' && c.method === 'insert',
    );
    expect(insert?.args[0]).toEqual({ user_id: userId, text: 'Putt-statistikk per hull' });
    expect(mailMock).toHaveBeenCalledTimes(1);
    expect(lastRedirect()).toBe('/foreslaa-ide?sent=1');
  });

  it('still reaches the sent state when the admin mail fails (best-effort)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [{ id: 'idea-1' }], error: null },
      { data: { name: 'Per' }, error: null },
      { data: [{ id: 'admin-1', email: 'admin@torny.no', name: 'Jørgen', locale: 'no' }], error: null },
    ]);
    setAuth({ id: userId });
    mailMock.mockRejectedValueOnce(new Error('resend down'));

    await run(form('En idé'));

    expect(lastRedirect()).toBe('/foreslaa-ide?sent=1');
  });
});

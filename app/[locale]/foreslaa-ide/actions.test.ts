import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

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

// #2207: the admins' addresses come from the admin client (getPrivateUserFields)
// for the ids the submitter's own read returned.
let adminEmailRows: Array<{ id: string; email: string; friend_code: string }> = [];
const adminFake = createAdminClientMock({
  respond: (op) => (op.table === 'users' ? { data: adminEmailRows } : { data: null }),
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminFake.client }));

const mailMock = vi.fn(async (..._args: unknown[]) => {});
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
  adminFake.reset();
  adminEmailRows = [{ id: 'admin-1', email: 'admin@example.test', friend_code: 'k0de' }];
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

  // #2277: «Si fra» on a course page opens the box with «Om banen X: » in the
  // field. Sending that untouched is an empty idea, and the error keeps ?bane.
  it('treats the untouched course prefill as empty and keeps bane on the error redirect', async () => {
    supabaseMock = buildSupabaseMock([]);
    setAuth({ id: userId });
    const fd = form('Om banen Stiklestad Golfbane: ');
    fd.set('prefill', 'Om banen Stiklestad Golfbane: ');
    fd.set('bane', 'stiklestad-golfbane');

    await run(fd);

    expect(lastRedirect()).toBe('/foreslaa-ide?bane=stiklestad-golfbane&error=empty');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('sends the prefill once the golfer has written after it', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [{ id: 'idea-1' }], error: null },
      { data: { name: 'Per' }, error: null },
      { data: [{ id: 'admin-1', name: 'Jørgen', locale: 'no' }], error: null },
    ]);
    setAuth({ id: userId });
    const fd = form('Om banen Stiklestad Golfbane: hull 7 er par 4');
    fd.set('prefill', 'Om banen Stiklestad Golfbane: ');
    fd.set('bane', 'stiklestad-golfbane');

    await run(fd);

    const insert = supabaseMock.__fromCalls.find(
      (c) => c.table === 'idea_submissions' && c.method === 'insert',
    );
    expect(insert?.args[0]).toEqual({
      user_id: userId,
      text: 'Om banen Stiklestad Golfbane: hull 7 er par 4',
    });
    expect(lastRedirect()).toBe('/foreslaa-ide?sent=1');
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
        data: [{ id: 'admin-1', name: 'Jørgen', locale: 'no' }],
        error: null,
      }, // admins the submitter's own client sees
    ]);
    setAuth({ id: userId });

    await run(form('  Putt-statistikk per hull  '));

    const insert = supabaseMock.__fromCalls.find(
      (c) => c.table === 'idea_submissions' && c.method === 'insert',
    );
    expect(insert?.args[0]).toEqual({ user_id: userId, text: 'Putt-statistikk per hull' });
    expect(mailMock).toHaveBeenCalledTimes(1);
    expect(mailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@example.test' }));
    expect(lastRedirect()).toBe('/foreslaa-ide?sent=1');
  });

  it('never selects users.email on the submitter\'s client; addresses only for the rows it returned (#2207)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [{ id: 'idea-1' }], error: null },
      { data: { name: 'Per' }, error: null },
      { data: [{ id: 'admin-1', name: 'Jørgen', locale: 'no' }], error: null },
    ]);
    setAuth({ id: userId });

    await run(form('En idé'));

    const userSelects = supabaseMock.__fromCalls
      .filter((c) => c.table === 'users' && c.method === 'select')
      .map((c) => String(c.args[0]));
    expect(userSelects.some((cols) => /email/.test(cols))).toBe(false);
    expect(adminFake.ops).toEqual([
      expect.objectContaining({
        table: 'users',
        filters: [{ op: 'in', column: 'id', value: ['admin-1'] }],
      }),
    ]);
  });

  it('still reaches the sent state when the admin mail fails (best-effort)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: [{ id: 'idea-1' }], error: null },
      { data: { name: 'Per' }, error: null },
      { data: [{ id: 'admin-1', name: 'Jørgen', locale: 'no' }], error: null },
    ]);
    setAuth({ id: userId });
    mailMock.mockRejectedValueOnce(new Error('resend down'));

    await run(form('En idé'));

    expect(lastRedirect()).toBe('/foreslaa-ide?sent=1');
  });
});

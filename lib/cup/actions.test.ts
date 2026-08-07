import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * #1397: createTournamentDraft signalled every error via `redirect('?error=…')`,
 * which unmounted the still-filled CupSetup form and wiped the organizer's input
 * (the #1379 figure, kept out of that PR for scope). The fix returns validation
 * and insert failures as an action result (`{ error: code }`) consumed by
 * useActionState — the form stays mounted. Only the success redirect (and the
 * auth-gate redirects) still throw NEXT_REDIRECT.
 *
 * This suite locks the regression contract — "return instead of redirect on
 * failure" — not the validation rules themselves (each code's condition is
 * exercised elsewhere): a representative slice of validation codes, the insert
 * failure, and that success still redirects.
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({
  revalidatePath: vi.fn(),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));
// Frittstående cup → getRoleContext reads the users row on the request-scoped
// client only; the admin client (klubb path) is never reached here, so it needs
// no mock — getAdminClient is lazy and only throws if actually called.

function setUser(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, email: `${id}@x.no` } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** Valid standalone cup form; per-case overrides break one field. */
function cupForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('name', 'Ryder Cup');
  fd.set('team_1_name', 'Europa');
  fd.set('team_2_name', 'USA');
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

describe('createTournamentDraft — validation returns { error }, no insert (#1397)', () => {
  const cases: Array<[string, Record<string, string>]> = [
    ['cup_name', { name: '' }],
    ['cup_team_dup', { team_1_name: 'Lag', team_2_name: 'lag' }],
    ['cup_win_points', { win_points: '0' }],
  ];

  it.each(cases)(
    'returns { error: %s } and issues no tournaments insert',
    async (code, overrides) => {
      supabaseMock = buildSupabaseMock([]);
      setUser('creator-1');

      const { createTournamentDraft } = await import('./actions');
      expect(await createTournamentDraft(cupForm(overrides))).toEqual({
        error: code,
      });

      // Validation runs before getServerClient, so the DB is never touched.
      const ins = supabaseMock.__fromCalls.find(
        (c) => c.table === 'tournaments' && c.method === 'insert',
      );
      expect(ins, 'no tournaments insert on validation failure').toBeUndefined();
      // A failure must never redirect (that is the whole regression).
      expect(redirectMock).not.toHaveBeenCalled();
    },
  );
});

describe('createTournamentDraft — insert failure returns { error } (#1397)', () => {
  it('returns { error: cup_insert_failed } when the tournaments insert fails', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // getRoleContext → users.single
      { data: null, error: { message: 'boom' } }, // tournaments.insert().select('id').single
    ]);
    setUser('creator-1');

    const { createTournamentDraft } = await import('./actions');
    expect(await createTournamentDraft(cupForm())).toEqual({
      error: 'cup_insert_failed',
    });

    const ins = supabaseMock.__fromCalls.find(
      (c) => c.table === 'tournaments' && c.method === 'insert',
    );
    expect(ins, 'tournaments insert was issued').toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('createTournamentDraft — success still redirects (#1397)', () => {
  it('throws NEXT_REDIRECT to the new cup on a successful insert', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // getRoleContext → users.single
      { data: { id: 'T1' }, error: null }, // tournaments.insert().select('id').single
    ]);
    setUser('creator-1');

    const { createTournamentDraft } = await import('./actions');
    const err = await createTournamentDraft(cupForm()).catch((e) => e);
    expect(err, 'success path redirects (throws), never returns').toBeInstanceOf(
      RedirectError,
    );
    expect((err as RedirectError).url).toBe('/admin/cup/T1?status=created');
  });
});

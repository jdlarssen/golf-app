import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

const redirectMock = makeRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
// lib/admin/auth.ts (shared auth gate) still redirects via next/navigation —
// route it to the same spy so auth-gate assertions hold.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

/**
 * Wire `auth.getUser()` to the in-test supabase mock with a stable admin
 * uuid (`admin-1`). The action's role-helper reads `userId` from this call
 * — keeping the value matches the existing assertions
 * (`createdByUserId: 'admin-1'`, `sentByUserId: 'admin-1'`).
 */
function setAdminUser(id = 'admin-1') {
  supabaseMock.auth.getUser = vi.fn(async () => ({
    data: { user: { id, email: 'admin@example.com' } },
    error: null,
  }));
}

const publishMock = vi.fn();
vi.mock('@/lib/productUpdates/publish', () => ({
  publishProductUpdate: (input: unknown) => publishMock(input),
}));

const editMock = vi.fn();
vi.mock('@/lib/productUpdates/edit', () => ({
  editProductUpdate: (input: unknown) => editMock(input),
}));

const sendDigestMock = vi.fn();
vi.mock('@/lib/productUpdates/digest', () => ({
  sendDigestForPeriod: (opts: unknown) => sendDigestMock(opts),
}));

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: admin-only access. Role-helper reads `is_admin` + `email` +
  // `name` from the users-row; only `is_admin` actually gates here, the
  // rest are harmless extras the helper ignores at the callsite.
  supabaseMock = buildSupabaseMock([
    { data: { is_admin: true, email: null, name: 'Admin' }, error: null },
  ]);
  setAdminUser();
});

describe('publishProductUpdateAction', () => {
  it('redirecter til / når bruker ikke er admin', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, email: null, name: null }, error: null },
    ]);
    setAdminUser();
    const { publishProductUpdateAction } = await import('./actions');

    await expect(
      publishProductUpdateAction(fd({ title: 'X', body: 'Y' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });

  it('redirecter med ?error=title_required når tittel mangler', async () => {
    const { publishProductUpdateAction } = await import('./actions');

    await expect(
      publishProductUpdateAction(fd({ title: '   ', body: 'Y' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toContain('error=title_required');
  });

  it('redirecter med ?error=body_required når brødtekst mangler', async () => {
    const { publishProductUpdateAction } = await import('./actions');

    await expect(
      publishProductUpdateAction(fd({ title: 'X', body: '' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toContain('error=body_required');
  });

  it('redirecter med ?error=link_must_be_internal når lenke ikke starter med /', async () => {
    const { publishProductUpdateAction } = await import('./actions');

    await expect(
      publishProductUpdateAction(
        fd({ title: 'X', body: 'Y', link: 'https://evil.example.com' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toContain('error=link_must_be_internal');
  });

  it('redirecter med ?error=cta_without_link når cta uten link', async () => {
    const { publishProductUpdateAction } = await import('./actions');

    await expect(
      publishProductUpdateAction(
        fd({ title: 'X', body: 'Y', cta_label: 'Prøv det' }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toContain('error=cta_without_link');
  });

  it('happy path: kaller publishProductUpdate og redirecter med ?published=1', async () => {
    publishMock.mockResolvedValueOnce({
      id: 'pu-1',
      recipientCount: 5,
      failedCount: 0,
    });
    const { publishProductUpdateAction } = await import('./actions');

    await expect(
      publishProductUpdateAction(
        fd({
          title: 'Texas scramble er ute!',
          body: 'Ny modus tilgjengelig.',
          link: '/admin/games/new',
          cta_label: 'Prøv det',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(publishMock).toHaveBeenCalledWith({
      title: 'Texas scramble er ute!',
      body: 'Ny modus tilgjengelig.',
      link: '/admin/games/new',
      cta_label: 'Prøv det',
      createdByUserId: 'admin-1',
    });
    expect(lastRedirect()).toBe('/admin/lanseringer?published=1&recipients=5');
  });
});

describe('editProductUpdateAction', () => {
  it('redirecter til / når bruker ikke er admin', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, email: null, name: null }, error: null },
    ]);
    setAdminUser();
    const { editProductUpdateAction } = await import('./actions');

    await expect(
      editProductUpdateAction(fd({ id: 'pu-1', title: 'X', body: 'Y' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
    expect(editMock).not.toHaveBeenCalled();
  });

  it('redirecter med ?error=edit_failed når id mangler', async () => {
    const { editProductUpdateAction } = await import('./actions');

    await expect(
      editProductUpdateAction(fd({ title: 'X', body: 'Y' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/lanseringer?error=edit_failed');
    expect(editMock).not.toHaveBeenCalled();
  });

  it('redirecter tilbake til rediger-siden med validerings-feilkode', async () => {
    const { editProductUpdateAction } = await import('./actions');

    await expect(
      editProductUpdateAction(fd({ id: 'pu-1', title: '  ', body: 'Y' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(
      '/admin/lanseringer/pu-1/rediger?error=title_required',
    );
    expect(editMock).not.toHaveBeenCalled();
  });

  it('happy path: kaller editProductUpdate og redirecter med ?edited=1', async () => {
    editMock.mockResolvedValueOnce({ notificationCount: 17 });
    const { editProductUpdateAction } = await import('./actions');

    await expect(
      editProductUpdateAction(
        fd({
          id: 'pu-9',
          title: 'Rettet tittel',
          body: 'Rettet tekst.',
          link: '/foreslaa-ide',
          cta_label: 'Foreslå',
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(editMock).toHaveBeenCalledWith({
      id: 'pu-9',
      title: 'Rettet tittel',
      body: 'Rettet tekst.',
      link: '/foreslaa-ide',
      cta_label: 'Foreslå',
    });
    expect(lastRedirect()).toBe('/admin/lanseringer?edited=1&notifs=17');
  });
});

describe('sendDigestNowAction', () => {
  it('redirecter til / når bruker ikke er admin', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, email: null, name: null }, error: null },
    ]);
    setAdminUser();
    const { sendDigestNowAction } = await import('./actions');

    await expect(sendDigestNowAction()).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });

  it('redirecter med ?digest=already_sent når perioden allerede er sendt', async () => {
    sendDigestMock.mockResolvedValueOnce({
      kind: 'already_sent',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      periodLabel: 'april 2026',
    });
    const { sendDigestNowAction } = await import('./actions');

    await expect(sendDigestNowAction()).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/lanseringer?digest=already_sent');
  });

  it('redirecter med ?digest=no_updates når ingen oppdateringer i periode', async () => {
    sendDigestMock.mockResolvedValueOnce({
      kind: 'no_updates',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      periodLabel: 'april 2026',
    });
    const { sendDigestNowAction } = await import('./actions');

    await expect(sendDigestNowAction()).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/lanseringer?digest=no_updates');
  });

  it('happy path: sendt → redirecter med recipients + updates-counters', async () => {
    sendDigestMock.mockResolvedValueOnce({
      kind: 'sent',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      periodLabel: 'april 2026',
      recipientCount: 12,
      updateCount: 3,
    });
    const { sendDigestNowAction } = await import('./actions');

    await expect(sendDigestNowAction()).rejects.toBeInstanceOf(RedirectError);
    expect(sendDigestMock).toHaveBeenCalledWith({ sentByUserId: 'admin-1' });
    expect(lastRedirect()).toBe(
      '/admin/lanseringer?digest=sent&recipients=12&updates=3',
    );
  });
});

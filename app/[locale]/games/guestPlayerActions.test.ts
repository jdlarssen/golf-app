import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * `addGuestToGame` — the capacity gate (#2059). A guest counts as a player
 * against the format cap, and the cap is the one the signup link reads
 * (`teamModePlayerCap` via `organizerPlayerCap`), counted over active players.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

const createGuestPlayerMock = vi.fn<(...args: unknown[]) => Promise<unknown>>(
  async () => ({ ok: true }),
);
vi.mock('@/lib/games/createGuestPlayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/games/createGuestPlayer')>();
  return {
    ...actual,
    createGuestPlayer: (...args: unknown[]) => createGuestPlayerMock(...args),
  };
});

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => buildSupabaseMock([]),
}));

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const GAME_ID = '33333333-3333-3333-3333-333333333333';

const ADMIN_ROLE_READ = {
  data: { is_admin: true, email: 'admin@example.test', name: 'Jørgen' },
  error: null,
};

function authedAsAdmin(): void {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: ADMIN_ID, email: 'admin@example.test' } },
  });
}

function gameRow(game_mode: string, mode_config: Record<string, unknown>) {
  return {
    data: { id: GAME_ID, status: 'draft', game_mode, mode_config },
    error: null,
  };
}

function guestForm(): FormData {
  const fd = new FormData();
  fd.set('guest_name', 'Gjest Gjestesen');
  fd.set('guest_hcp', '18');
  fd.set('guest_tee', 'M');
  return fd;
}

function lastRedirect(): string | undefined {
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  if (!arg) return undefined;
  return typeof arg === 'string' ? arg : arg.href;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addGuestToGame — format-taket (#2059)', () => {
  it('patsome med 8 aktive → game_full, ingen gjest opprettes', async () => {
    supabaseMock = buildSupabaseMock([
      ADMIN_ROLE_READ,
      gameRow('patsome', { team_size: 2 }),
      { data: [], error: null, count: 8 } as never,
    ]);
    authedAsAdmin();

    const { addGuestToGame } = await import('./guestPlayerActions');
    await expect(addGuestToGame(GAME_ID, guestForm())).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?error=game_full`);
    expect(createGuestPlayerMock).not.toHaveBeenCalled();
    expect(
      supabaseMock.__fromCalls
        .filter((c) => c.table === 'game_players' && c.method === 'is')
        .map((c) => c.args),
    ).toContainEqual(['withdrawn_at', null]);
  });

  it('stableford har ikke noe tak her → gjesten legges til', async () => {
    supabaseMock = buildSupabaseMock([
      ADMIN_ROLE_READ,
      gameRow('stableford', {}),
    ]);
    authedAsAdmin();

    const { addGuestToGame } = await import('./guestPlayerActions');
    await expect(addGuestToGame(GAME_ID, guestForm())).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(createGuestPlayerMock).toHaveBeenCalledTimes(1);
    expect(lastRedirect()).toBe(`/admin/games/${GAME_ID}?status=guest_added`);
  });
});

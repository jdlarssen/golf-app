import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for the delete-game server action (#428).
 *
 * deleteGame is gated on requireAdminOrCreator. An admin may delete a game in
 * ANY state; a creator only draft/scheduled (eier-beslutning — active/finished
 * belong to all participants). Redirects branch on isAdmin.
 *
 * Query-sekvens:
 *   1. auth.getUser                       // loadRole
 *   2. users.select(is_admin,email,name)  // loadRole
 *   3. games.select(created_by)           // requireAdminOrCreator — ONLY when not admin
 *   4. games.select(id,name,status,prizes) // deleteGame
 *   5. games.delete                        // only if allowed
 *
 * #1052: etter vellykket delete ryddes sponsorlogo-objects best-effort via
 * service-role-klienten (admin eier ikke andres objects) — mocket under.
 */

const redirectMock = makeRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(typeof arg === 'string' ? arg : arg.href),
}));
// lib/admin/auth.ts (shared auth gate, out of i18n scope) still redirects via
// next/navigation — route it to the same spy so auth-gate assertions hold.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

const storageRemoveMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    storage: { from: () => ({ remove: storageRemoveMock }) },
  }),
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

function signIn(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id } },
  });
}

function fd(gameId: string): FormData {
  const data = new FormData();
  data.set('gameId', gameId);
  return data;
}

function deleteCalls() {
  return supabaseMock.__fromCalls.filter((c) => c.method === 'delete');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleteGame — admin', () => {
  it('sletter et avsluttet spill og lander i Sekretariatet med deleted-banner', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      {
        data: { id: 'game-1', name: 'Vinter-cup', status: 'finished' },
        error: null,
      }, // games.select(id,name,status)
      { data: null, error: null }, // games.delete
    ]);
    signIn('admin-1');

    const { deleteGame } = await import('./actions');
    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe(
      '/admin/games?status=deleted&name=Vinter-cup',
    );
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
    expect(deleteCalls()).toHaveLength(1);
    // Ingen logo-paths i prizes → ingen storage-opprydding.
    expect(storageRemoveMock).not.toHaveBeenCalled();
  });

  it('rydder sponsorlogo-objects best-effort etter vellykket delete (#1052)', async () => {
    storageRemoveMock.mockResolvedValue({ data: null, error: null });
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'finished',
          prizes: [
            {
              category: 'placement',
              position: 1,
              description: 'Gavekort',
              sponsor: 'Klubbshoppen',
              sponsorLogoPath: 'uid/a.webp',
            },
            {
              category: 'longest_drive',
              position: 1,
              description: 'Driver',
              sponsor: null,
              sponsorLogoPath: 'uid/b.webp',
            },
            {
              category: 'closest_to_pin',
              position: 1,
              description: 'Baller',
              sponsor: 'Baren',
              sponsorLogoPath: null,
            },
          ],
        },
        error: null,
      }, // games.select(id,name,status,prizes)
      { data: null, error: null }, // games.delete
    ]);
    signIn('admin-1');

    const { deleteGame } = await import('./actions');
    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(storageRemoveMock).toHaveBeenCalledExactlyOnceWith([
      'uid/a.webp',
      'uid/b.webp',
    ]);
    expect(lastRedirect()).toBe('/admin/games?status=deleted&name=Vinter-cup');
  });
});

describe('deleteGame — oppretter (#428)', () => {
  it('sletter eget utkast og lander på hjem med deleted-bekreftelse', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false }, error: null }, // loadRole
      { data: { created_by: 'creator-1' }, error: null }, // gate owner-check ✓
      {
        data: { id: 'game-1', name: 'Sommer-runde', status: 'draft' },
        error: null,
      }, // games.select
      { data: null, error: null }, // games.delete
    ]);
    signIn('creator-1');

    const { deleteGame } = await import('./actions');
    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/?deleted=Sommer-runde');
    expect(deleteCalls()).toHaveLength(1);
  });

  it('blokkerer sletting av eget AVSLUTTET spill (kun admin) — ingen delete', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false }, error: null }, // loadRole
      { data: { created_by: 'creator-1' }, error: null }, // gate owner-check ✓
      {
        data: { id: 'game-1', name: 'Ferdig spill', status: 'finished' },
        error: null,
      }, // games.select
    ]);
    signIn('creator-1');

    const { deleteGame } = await import('./actions');
    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/games/game-1?error=not_deletable');
    expect(deleteCalls()).toHaveLength(0);
  });

  it('blokkerer sletting av eget PÅGÅENDE spill (kun admin) — ingen delete', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false }, error: null }, // loadRole
      { data: { created_by: 'creator-1' }, error: null }, // gate owner-check ✓
      {
        data: { id: 'game-1', name: 'Pågår nå', status: 'active' },
        error: null,
      }, // games.select
    ]);
    signIn('creator-1');

    const { deleteGame } = await import('./actions');
    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/games/game-1?error=not_deletable');
    expect(deleteCalls()).toHaveLength(0);
  });

  it('ikke-eier ikke-admin → redirect / (gate), ingen delete', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false }, error: null }, // loadRole
      { data: { created_by: 'someone-else' }, error: null }, // gate owner-check ✗
    ]);
    signIn('creator-1');

    const { deleteGame } = await import('./actions');
    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/');
    expect(deleteCalls()).toHaveLength(0);
  });
});

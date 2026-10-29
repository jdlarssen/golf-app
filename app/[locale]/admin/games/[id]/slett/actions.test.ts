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
 *   4. games.select(id,name,status,prizes,scheduled_tee_off_at,tournament_id,
 *      league_round_id,courses(name))     // deleteGame
 *   5. games.delete().select(id)          // only if allowed; 0 rows = failed (trap 2)
 *
 * #1052: etter vellykket delete ryddes sponsorlogo-objects best-effort via
 * service-role-klienten (admin eier ikke andres objects) — mocket under.
 *
 * #2481: a scheduled round (outside a cup/league) cancels with a notice. The
 * recipients are read (service role, mocked) BEFORE the delete; after it the
 * game's old notices are archived (every delete) and each recipient gets one
 * `game_cancelled` notice, plus a mail when notify says they are off-app.
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

// #2481: one log for the order of the steps that matter (read → delete → tell).
const steps: string[] = [];
const loadRecipientsMock = vi.fn();
vi.mock('@/lib/games/gameCancellation.server', () => ({
  loadCancellationRecipients: (...args: unknown[]) => {
    steps.push('recipients');
    return loadRecipientsMock(...args);
  },
}));
const notifyMock = vi.fn();
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => {
    steps.push('notify');
    return notifyMock(...args);
  },
}));
const archiveForGameMock = vi.fn();
vi.mock('@/lib/notifications/archive', () => ({
  archiveNotificationsForGame: (...args: unknown[]) => {
    steps.push('archive');
    return archiveForGameMock(...args);
  },
}));
const mailMock = vi.fn();
vi.mock('@/lib/mail/gameCancelledNotification', () => ({
  sendGameCancelledNotification: (...args: unknown[]) => mailMock(...args),
}));
const privateFieldsMock = vi.fn();
vi.mock('@/lib/users/privateUserFields', () => ({
  getPrivateUserFields: (...args: unknown[]) => privateFieldsMock(...args),
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

function signIn(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id } },
  });
}

function fd(gameId: string, message?: string): FormData {
  const data = new FormData();
  data.set('gameId', gameId);
  if (message !== undefined) data.set('message', message);
  return data;
}

function deleteCalls() {
  return supabaseMock.__fromCalls.filter((c) => c.method === 'delete');
}

const DELETED = { data: [{ id: 'game-1' }], error: null }; // games.delete().select('id')

beforeEach(() => {
  vi.clearAllMocks();
  steps.length = 0;
  archiveForGameMock.mockResolvedValue(0);
  notifyMock.mockResolvedValue({ shouldAlsoSendMail: false });
  mailMock.mockResolvedValue(undefined);
  privateFieldsMock.mockResolvedValue(new Map());
  loadRecipientsMock.mockResolvedValue([]);
});

describe('deleteGame — admin', () => {
  it('sletter et avsluttet spill og lander i Sekretariatet med deleted-banner', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      {
        data: { id: 'game-1', name: 'Vinter-cup', status: 'finished' },
        error: null,
      }, // games.select(id,name,status)
      DELETED, // games.delete
    ]);
    signIn('admin-1');

    const { deleteGame } = await import('./actions');
    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe(
      '/admin/games?status=deleted&name=Vinter-cup',
    );
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
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
      DELETED, // games.delete
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
      DELETED, // games.delete
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

describe('deleteGame — «Avlys og si fra» (#2481)', () => {
  const scheduled = {
    id: 'game-1',
    name: 'Lørdagsrunden',
    status: 'scheduled',
    prizes: [],
    scheduled_tee_off_at: '2026-10-03T07:00:00.000Z',
    tournament_id: null,
    league_round_id: null,
    courses: { name: 'Byneset North' },
  };
  const marte = { userId: 'u-marte', name: 'Marte Lie', isGuest: false, deletedAt: null, withdrawnAt: null, locale: null };
  const jonas = { userId: 'u-jonas', name: 'Jonas Berg', isGuest: false, deletedAt: null, withdrawnAt: null, locale: 'en' };

  function creatorCancels(game: Record<string, unknown> = scheduled, deleteResult: unknown = DELETED) {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, name: 'Jørgen Larssen' }, error: null }, // loadRole
      { data: { created_by: 'creator-1' }, error: null }, // gate owner-check ✓
      { data: game, error: null }, // games.select
      deleteResult as { data: unknown; error: unknown }, // games.delete
    ]);
    signIn('creator-1');
  }

  it('reads the recipients before the delete, then archives and tells each one', async () => {
    creatorCancels();
    loadRecipientsMock.mockResolvedValue([marte, jonas]);
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1', '  Banen er stengt.  '))).rejects.toBeInstanceOf(RedirectError);

    expect(loadRecipientsMock).toHaveBeenCalledWith('game-1', 'creator-1');
    expect(deleteCalls()).toHaveLength(1);
    // recipients → (delete) → archive → one notify per recipient
    expect(steps).toEqual(['recipients', 'archive', 'notify', 'notify']);
    expect(notifyMock.mock.calls.map((c) => c[0])).toEqual([
      {
        userId: 'u-marte',
        kind: 'game_cancelled',
        payload: {
          game_name: 'Lørdagsrunden',
          tee_off_at: '2026-10-03T07:00:00.000Z',
          course_name: 'Byneset North',
          organizer_name: 'Jørgen Larssen',
          message: 'Banen er stengt.',
        },
      },
      expect.objectContaining({ userId: 'u-jonas', kind: 'game_cancelled' }),
    ]);
    expect(lastRedirect()).toBe('/?cancelled=L%C3%B8rdagsrunden&told=2');
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
  });

  it('no greeting → no message in the payload', async () => {
    creatorCancels();
    loadRecipientsMock.mockResolvedValue([marte]);
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1', '   '))).rejects.toBeInstanceOf(RedirectError);

    expect(notifyMock.mock.calls[0]![0].payload).not.toHaveProperty('message');
  });

  it('mails those notify says are off-app, in their own language', async () => {
    creatorCancels();
    loadRecipientsMock.mockResolvedValue([marte, jonas]);
    notifyMock
      .mockResolvedValueOnce({ shouldAlsoSendMail: false })
      .mockResolvedValueOnce({ shouldAlsoSendMail: true });
    privateFieldsMock.mockResolvedValue(new Map([['u-jonas', { email: 'jonas@example.com', friendCode: 'x' }]]));
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1', 'Frost.'))).rejects.toBeInstanceOf(RedirectError);

    expect(privateFieldsMock).toHaveBeenCalledWith(['u-jonas']);
    expect(mailMock).toHaveBeenCalledExactlyOnceWith({
      to: 'jonas@example.com',
      playerFirstName: 'Jonas',
      gameName: 'Lørdagsrunden',
      teeOffAt: '2026-10-03T07:00:00.000Z',
      courseName: 'Byneset North',
      organizerName: 'Jørgen Larssen',
      message: 'Frost.',
      locale: 'en',
    });
  });

  it('a failed notice or mail never stops the redirect', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    creatorCancels();
    loadRecipientsMock.mockResolvedValue([marte]);
    notifyMock.mockRejectedValue(new Error('boom'));
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/?cancelled=L%C3%B8rdagsrunden&told=1');
    consoleErr.mockRestore();
  });

  it('a delete that fails sends nothing', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    creatorCancels(scheduled, { data: null, error: { message: 'boom' } });
    loadRecipientsMock.mockResolvedValue([marte]);
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1/slett?error=delete_failed');
    expect(notifyMock).not.toHaveBeenCalled();
    expect(archiveForGameMock).not.toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it('a delete RLS filtered to 0 rows is a failed delete, and sends nothing', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    creatorCancels(scheduled, { data: [], error: null });
    loadRecipientsMock.mockResolvedValue([marte]);
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1/slett?error=delete_failed');
    expect(notifyMock).not.toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it('a greeting over 300 characters deletes nothing and tells no one', async () => {
    creatorCancels();
    loadRecipientsMock.mockResolvedValue([marte]);
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1', 'x'.repeat(301)))).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1/slett?error=message_too_long');
    expect(deleteCalls()).toHaveLength(0);
    expect(loadRecipientsMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a failed recipient read keeps the game', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    creatorCancels();
    loadRecipientsMock.mockRejectedValue(new Error('read failed'));
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1/slett?error=delete_failed');
    expect(deleteCalls()).toHaveLength(0);
    consoleErr.mockRestore();
  });

  it('only the organiser on the list: deleted as before, with the plain banner', async () => {
    creatorCancels();
    loadRecipientsMock.mockResolvedValue([]);
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(RedirectError);

    expect(notifyMock).not.toHaveBeenCalled();
    expect(lastRedirect()).toBe('/?deleted=L%C3%B8rdagsrunden');
  });

  it('admin cancels: the desk banner names the round and the count', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Admin' }, error: null }, // loadRole
      { data: scheduled, error: null }, // games.select
      DELETED, // games.delete
    ]);
    signIn('admin-1');
    loadRecipientsMock.mockResolvedValue([marte]);
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1'))).rejects.toBeInstanceOf(RedirectError);

    expect(loadRecipientsMock).toHaveBeenCalledWith('game-1', 'admin-1');
    expect(lastRedirect()).toBe('/admin/games?status=cancelled&name=L%C3%B8rdagsrunden&count=1');
  });

  it.each([
    ['an active game (admin)', { ...scheduled, status: 'active' }],
    ['a cup match', { ...scheduled, tournament_id: 't-1' }],
    ['a league flight', { ...scheduled, league_round_id: 'r-1' }],
  ])('%s is deleted as before: no recipients, no notice, still archived', async (_label, game) => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true }, error: null }, // loadRole
      { data: game, error: null }, // games.select
      DELETED, // games.delete
    ]);
    signIn('admin-1');
    const { deleteGame } = await import('./actions');

    await expect(deleteGame(fd('game-1', 'Hei'))).rejects.toBeInstanceOf(RedirectError);

    expect(loadRecipientsMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(archiveForGameMock).toHaveBeenCalledWith('game-1');
    expect(lastRedirect()).toBe('/admin/games?status=deleted&name=L%C3%B8rdagsrunden');
  });
});

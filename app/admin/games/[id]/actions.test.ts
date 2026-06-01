import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for `endGame` (admin server action).
 *
 * Action query sequence:
 *   1. auth.getUser
 *   2. users.select(is_admin, name).eq.single  (admin gate)
 *   3. games.select(id, name, status, require_peer_approval, course_id, game_mode, mode_config).eq.single
 *   4. game_players.select(submitted_at, approved_at, users(...)).eq.returns
 *   5. games.update(status='finished', ended_at=...).eq  (resolves)
 *   6. logAdminEvent (mocked)
 *   7. buildGameFinishedRecipients (mocked) — bygger mottakerliste m/ mode-info
 *   8. sendGameFinishedNotification (mocked, allSettled) — én per mottaker
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const sendGameFinishedNotificationMock =
  vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ ok: true }));
vi.mock('@/lib/mail/gameFinishedNotification', () => ({
  sendGameFinishedNotification: (...args: unknown[]) =>
    sendGameFinishedNotificationMock(...args),
}));

// Mottaker-listen bygges av en dedikert helper som internt kjører mode-router
// for stableford. Stubber den her så vi kan kontrollere shape uten å mocke
// hele scoring-stack-en. Default-fixturen returnerer 2 mottakere uten mode-
// info (best-ball-default). Per-test override via `mockResolvedValueOnce`.
//
// `userId` er kritisk fra og med Phase 4 — actionen filtrerer recipients på
// `sendMailByUserId.get(r.userId)` for å gate mail mot in-app-aktive brukere.
const buildGameFinishedRecipientsMock = vi.fn<
  (...args: unknown[]) => Promise<unknown[]>
>(async () => [
  { userId: 'user-a', email: 'a@example.com', name: 'Ada Lovelace' },
  { userId: 'user-b', email: 'b@example.com', name: 'Bjørn' },
]);
vi.mock('@/lib/mail/gameFinishedRecipients', () => ({
  buildGameFinishedRecipients: (...args: unknown[]) =>
    buildGameFinishedRecipientsMock(...args),
}));

const logAdminEventMock =
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/admin/auditLog', () => ({
  logAdminEvent: (...args: unknown[]) => logAdminEventMock(...args),
}));

// Phase 4 mail-gating: notify() returnerer shouldAlsoSendMail som styrer om
// game-finished-mailen sendes til denne spilleren. Default = true så happy-
// path-testen får sin historiske 2-mail-til-Ada-og-Bjørn-oppførsel. Per-test
// override via mockResolvedValueOnce dekker off-app vs aktive scenarier.
const notifyMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>(async () => ({ shouldAlsoSendMail: true }));
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

function lastRedirect(): string | undefined {
  return redirectMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('endGame', () => {
  it('redirects to /login when no user is authenticated (auth gate)', async () => {
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { endGame } = await import('./actions');

    await expect(endGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('redirects to / when the authenticated user is not an admin (authorization)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, name: 'Ola' }, error: null }, // users
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { endGame } = await import('./actions');

    await expect(endGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });

  it('validation: redirects with ?error=not_all_submitted when a player has not submitted', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'active',
          require_peer_approval: false,
          course_id: 'course-1',
          game_mode: 'best_ball',
          mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
        },
        error: null,
      }, // games
      {
        // game_players: one player still has submitted_at = null
        data: [
          {
            submitted_at: '2026-05-18T10:00:00Z',
            approved_at: null,
            users: { email: 'a@example.com', name: 'A' },
          },
          {
            submitted_at: null, // unsubmitted
            approved_at: null,
            users: { email: 'b@example.com', name: 'B' },
          },
        ],
        error: null,
      },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { endGame } = await import('./actions');

    await expect(endGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(
      '/admin/games/game-1?error=not_all_submitted',
    );
    expect(sendGameFinishedNotificationMock).not.toHaveBeenCalled();
  });

  it('avslutt likevel (#375): with allowMissing=true, flips to finished despite an unsubmitted player and never marks them submitted', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'active',
          require_peer_approval: false,
          course_id: 'course-1',
          game_mode: 'best_ball',
          mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
        },
        error: null,
      }, // games
      {
        // user-b is a no-show (submitted_at = null) — the escape must skip them.
        data: [
          {
            user_id: 'user-a',
            submitted_at: '2026-05-18T10:00:00Z',
            approved_at: null,
            users: { email: 'a@example.com', name: 'Ada Lovelace' },
          },
          {
            user_id: 'user-b',
            submitted_at: null,
            approved_at: null,
            users: { email: 'b@example.com', name: 'Bjørn' },
          },
        ],
        error: null,
      },
      { data: null, error: null }, // games.update(status='finished')
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { endGame } = await import('./actions');

    await expect(endGame('game-1', true)).rejects.toBeInstanceOf(RedirectError);

    // It must end, not block on the no-show.
    expect(lastRedirect()).toBe('/admin/games/game-1?status=finished');
    expect(redirectMock).not.toHaveBeenCalledWith(
      '/admin/games/game-1?error=not_all_submitted',
    );
    expect(logAdminEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'game.finished',
        targetId: 'game-1',
      }),
    );
    // The action's only write is the games.update(status='finished') consumed
    // from the mock queue above; there is no game_players UPDATE anywhere in
    // endGame, so the no-show's submitted_at structurally stays null («ikke
    // fullført», not a false levering). The finished redirect proves the escape
    // didn't block — the absence of any submitted_at write proves AC3.
  });

  it('happy path: flips to finished, logs admin event, sends mail to every player', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'active',
          require_peer_approval: false,
          course_id: 'course-1',
          game_mode: 'best_ball',
          mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
        },
        error: null,
      }, // games
      {
        data: [
          {
            user_id: 'user-a',
            submitted_at: '2026-05-18T10:00:00Z',
            approved_at: null,
            users: { email: 'a@example.com', name: 'Ada Lovelace' },
          },
          {
            user_id: 'user-b',
            submitted_at: '2026-05-18T10:05:00Z',
            approved_at: null,
            users: { email: 'b@example.com', name: 'Bjørn' },
          },
        ],
        error: null,
      },
      { data: null, error: null }, // games.update(status='finished')
    ]);
    // Mottakerne kommer fra buildGameFinishedRecipients (mocket) — default-
    // fixturen returnerer 2 best-ball-mottakere med userId-felt slik at Phase
    // 4 mail-gating-filteret finner matchende notify-resultat.
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { endGame } = await import('./actions');

    await expect(endGame('game-1')).rejects.toBeInstanceOf(RedirectError);

    expect(logAdminEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'game.finished',
        targetId: 'game-1',
        payload: expect.objectContaining({ gameName: 'Vinter-cup' }),
      }),
    );

    expect(sendGameFinishedNotificationMock).toHaveBeenCalledTimes(2);
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
    expect(lastRedirect()).toBe('/admin/games/game-1?status=finished');
  });

  it('off-app gating: filtrerer game_finished-mail per spiller basert på shouldAlsoSendMail', async () => {
    // Phase 4-kontrakt: hver spiller får mail KUN hvis last_seen_at > 5 min
    // siden (= off-app). Simulert ved at user-a er aktiv (false) og user-b er
    // off-app (true) — kun Bjørn skal få mail.
    notifyMock
      .mockResolvedValueOnce({ shouldAlsoSendMail: false }) // user-a aktiv
      .mockResolvedValueOnce({ shouldAlsoSendMail: true }); // user-b off-app

    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null },
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'active',
          require_peer_approval: false,
          course_id: 'course-1',
          game_mode: 'best_ball',
          mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
        },
        error: null,
      },
      {
        data: [
          {
            user_id: 'user-a',
            submitted_at: '2026-05-18T10:00:00Z',
            approved_at: null,
            users: { email: 'a@example.com', name: 'Ada Lovelace' },
          },
          {
            user_id: 'user-b',
            submitted_at: '2026-05-18T10:05:00Z',
            approved_at: null,
            users: { email: 'b@example.com', name: 'Bjørn' },
          },
        ],
        error: null,
      },
      { data: null, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { endGame } = await import('./actions');

    await expect(endGame('game-1')).rejects.toBeInstanceOf(RedirectError);

    // Begge spillerne får in-app via notify, men kun Bjørn (off-app) får mail.
    expect(notifyMock).toHaveBeenCalledTimes(2);
    expect(sendGameFinishedNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendGameFinishedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'b@example.com' }),
    );
  });

  it('edge case (peer-approval enforcement): redirects with ?error=not_all_approved when an unapproved submission exists', async () => {
    // When require_peer_approval is true, every player must have approved_at
    // set in addition to submitted_at. This branch is the action's strictest
    // gate before the status flip.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'active',
          require_peer_approval: true, // strict
          course_id: 'course-1',
          game_mode: 'best_ball',
          mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
        },
        error: null,
      }, // games
      {
        data: [
          {
            submitted_at: '2026-05-18T10:00:00Z',
            approved_at: '2026-05-18T10:10:00Z',
            users: { email: 'a@example.com', name: 'A' },
          },
          {
            submitted_at: '2026-05-18T10:05:00Z',
            approved_at: null, // unapproved
            users: { email: 'b@example.com', name: 'B' },
          },
        ],
        error: null,
      },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { endGame } = await import('./actions');

    await expect(endGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe(
      '/admin/games/game-1?error=not_all_approved',
    );
    expect(sendGameFinishedNotificationMock).not.toHaveBeenCalled();
  });
});

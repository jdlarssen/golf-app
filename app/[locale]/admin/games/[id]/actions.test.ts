import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
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

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(arg),
}));
// lib/admin/auth.ts (shared auth gate, out of i18n scope) still redirects via
// next/navigation — route it to the same spy so auth-gate assertions hold.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
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
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  if (!arg) return undefined;
  return typeof arg === 'string' ? arg : arg.href;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── adminWithdrawPlayer ────────────────────────────────────────────────────

describe('adminWithdrawPlayer', () => {
  it('redirects to /login when unauthenticated (auth gate)', async () => {
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { adminWithdrawPlayer } = await import('./actions');

    await expect(adminWithdrawPlayer('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/login');
  });

  it('redirects to / when user is neither admin nor creator (authorization)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, name: 'Ola' }, error: null }, // users (loadRole)
      { data: { created_by: 'someone-else' }, error: null }, // games.created_by (not owner)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { adminWithdrawPlayer } = await import('./actions');

    await expect(adminWithdrawPlayer('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });

  it('creator: withdraws on own game, lands on /games/[id]/spillere', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, name: 'Kari' }, error: null }, // users (loadRole)
      { data: { created_by: 'creator-1' }, error: null }, // games.created_by (owner)
      {
        data: {
          id: 'game-1',
          name: 'Lørdagsrunde',
          status: 'active',
          game_mode: 'stableford',
        },
        error: null,
      }, // games (action body)
      { data: null, error: null }, // game_players.update (withdrawn_at)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'creator-1' } },
    });

    const { adminWithdrawPlayer } = await import('./actions');

    await expect(adminWithdrawPlayer('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/games/game-1/spillere?status=player_withdrawn');
    expect(logAdminEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'game.player_withdrawn', targetId: 'game-1' }),
    );
  });

  it('sets withdrawn_at and redirects to ?status=player_withdrawn for active in-scope game', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users (requireAdmin)
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'active',
          game_mode: 'best_ball',
        },
        error: null,
      }, // games
      { data: null, error: null }, // game_players.update (withdrawn_at)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { adminWithdrawPlayer } = await import('./actions');

    await expect(adminWithdrawPlayer('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?status=player_withdrawn');
    expect(logAdminEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'game.player_withdrawn',
        targetId: 'game-1',
      }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
  });

  it('redirects with ?error=not_active for non-active game', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'finished',
          game_mode: 'best_ball',
        },
        error: null,
      }, // games
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { adminWithdrawPlayer } = await import('./actions');

    await expect(adminWithdrawPlayer('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?error=not_active');
  });
});

// ─── adminUndoWithdraw ──────────────────────────────────────────────────────

describe('adminUndoWithdraw', () => {
  it('nulls withdrawn_at and redirects to ?status=player_reinstated', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'active',
          game_mode: 'stableford',
        },
        error: null,
      }, // games
      { data: null, error: null }, // game_players.update (null out withdrawn)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { adminUndoWithdraw } = await import('./actions');

    await expect(adminUndoWithdraw('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?status=player_reinstated');
    expect(logAdminEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'game.player_reinstated',
        targetId: 'game-1',
      }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
  });

  it('redirects with ?error=not_active when game is finished', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'finished',
          game_mode: 'stableford',
        },
        error: null,
      }, // games
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { adminUndoWithdraw } = await import('./actions');

    await expect(adminUndoWithdraw('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?error=not_active');
  });
});

// ─── adminApproveScorecard (admin + creator override, #429) ─────────────────

describe('adminApproveScorecard', () => {
  it('admin: approves a pending scorecard, lands in Sekretariatet', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users (loadRole)
      { data: { status: 'active' }, error: null }, // games.select(status)
      { data: null, error: null }, // game_players.update (approved_at)
      { data: { name: 'Vinter-cup' }, error: null }, // games.select(name) for notify
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { adminApproveScorecard } = await import('./actions');

    await expect(adminApproveScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?status=admin_approved');
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a', kind: 'scorecard_approved' }),
    );
  });

  it('creator: approves on own game, lands on /games/[id]/spillere', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, name: 'Kari' }, error: null }, // users (loadRole)
      { data: { created_by: 'creator-1' }, error: null }, // games.created_by (owner)
      { data: { status: 'active' }, error: null }, // games.select(status)
      { data: null, error: null }, // game_players.update (approved_at)
      { data: { name: 'Lørdagsrunde' }, error: null }, // games.select(name)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'creator-1' } },
    });

    const { adminApproveScorecard } = await import('./actions');

    await expect(adminApproveScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/games/game-1/spillere?status=admin_approved');
  });

  it('redirects with ?error=not_active for a non-active game', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      { data: { status: 'finished' }, error: null }, // games.select(status)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { adminApproveScorecard } = await import('./actions');

    await expect(adminApproveScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?error=not_active');
  });

  it('redirects to / when user is neither admin nor creator', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, name: 'Ola' }, error: null }, // users
      { data: { created_by: 'someone-else' }, error: null }, // games.created_by (not owner)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { adminApproveScorecard } = await import('./actions');

    await expect(adminApproveScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/');
  });
});

describe('endGame', () => {
  it('redirects to /login when no user is authenticated (auth gate)', async () => {
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { endGame } = await import('./actions');

    await expect(endGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/login');
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

  it('WD (#386): a withdrawn player is skipped — game ends without allowMissing even though they never submitted', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      {
        data: {
          id: 'game-1',
          name: 'Vinter-cup',
          status: 'active',
          require_peer_approval: true, // even with approval required...
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
            approved_at: '2026-05-18T11:00:00Z',
            withdrawn_at: null,
            users: { email: 'a@example.com', name: 'Ada' },
          },
          {
            // Withdrawn no-show: never submitted, never approved — must NOT
            // trigger not_all_submitted or not_all_approved.
            user_id: 'user-b',
            submitted_at: null,
            approved_at: null,
            withdrawn_at: '2026-05-18T09:30:00Z',
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

    // No allowMissing — the withdrawn player alone must not block.
    await expect(endGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?status=finished');
    expect(redirectMock).not.toHaveBeenCalledWith(
      '/admin/games/game-1?error=not_all_submitted',
    );
    expect(redirectMock).not.toHaveBeenCalledWith(
      '/admin/games/game-1?error=not_all_approved',
    );
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

// ─── startGame (SF-1: incomplete_sides guard on draft→active path) ──────────

describe('startGame', () => {
  /**
   * Action query sequence (up to the incomplete_sides guard):
   *   1. auth.getUser
   *   2. users.select(is_admin).eq.single  (requireAdmin)
   *   3. games.select(id, status, ..., game_mode, mode_config).eq.single
   *   4. game_players.select(user_id, tee_gender, team_number, withdrawn_at, users).eq.returns
   *   5. tee_boxes.select(...).eq.single  (tee rating, needed for handicap freeze)
   *   6. users.select(id, email, profile_completed_at).in  (pending check)
   *   → incomplete_sides guard fires before step 7 (handicap freeze loop)
   *     so no game_players.update or games.update in the queue.
   */
  it('matchplay utkast med ufullstendige sider → redirect ?error=incomplete_sides, ingen status-flip', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // requireAdmin
      {
        data: {
          id: 'game-1',
          status: 'draft',
          hcp_allowance_pct: 100,
          tee_box_id: 'tee-1',
          game_mode: 'singles_matchplay',
          mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
        },
        error: null,
      }, // games
      {
        // One player on side 1, nobody on side 2 → isSideRosterComplete = false
        data: [
          {
            user_id: 'user-a',
            tee_gender: 'M',
            team_number: 1,
            withdrawn_at: null,
            users: { hcp_index: 10 },
          },
        ],
        error: null,
      }, // game_players
      {
        // tee_boxes: one rating set (required before pending-players check)
        data: {
          slope_mens: 125, course_rating_mens: 71.5, par_total_mens: 72,
          slope_ladies: 120, course_rating_ladies: 70.0, par_total_ladies: 72,
          slope_juniors: 115, course_rating_juniors: 69.0, par_total_juniors: 72,
        },
        error: null,
      }, // tee_boxes
      {
        // users lookup for pending-players check (profile completed)
        data: [{ id: 'user-a', email: 'a@example.com', profile_completed_at: '2026-01-01T00:00:00Z' }],
        error: null,
      }, // users
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { startGame } = await import('./actions');

    await expect(startGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?error=incomplete_sides');

    // Verify no status-flip occurred: no games.update call should be in fromCalls
    const statusFlip = supabaseMock.__fromCalls.find(
      (c) => c.table === 'games' && c.method === 'update',
    );
    expect(statusFlip).toBeUndefined();
  });
});

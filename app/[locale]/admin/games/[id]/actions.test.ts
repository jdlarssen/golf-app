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
 *   4. game_players.select(user_id, submitted_at, approved_at, withdrawn_at).eq.returns
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

// #2203: an approval or a withdrawal can make the round ready to finish. The
// message has its own suite (organizerNotices.test.ts); here only who asks.
const notifyOrganizerIfAllDeliveredMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/notifications/organizerNotices', () => ({
  notifyOrganizerIfAllDelivered: (...args: unknown[]) =>
    notifyOrganizerIfAllDeliveredMock(...args),
}));

// #2207: startScheduledGameAction only translates the core's answer into a
// redirect; the core itself is covered in lib/games/startScheduledGame.test.ts.
const startScheduledGameMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/games/startScheduledGame', () => ({
  startScheduledGame: (...args: unknown[]) => startScheduledGameMock(...args),
}));

// #2202: the button's winner announces the start; covered in its own module.
const announceStartedGameMock = vi.fn<(...args: unknown[]) => Promise<void>>(
  async () => undefined,
);
vi.mock('@/lib/games/announceStartedGame', () => ({
  announceStartedGame: (...args: unknown[]) => announceStartedGameMock(...args),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

// #1595: adminApproveScorecard re-reads the roster row through the service-role
// client when the approve UPDATE matches 0 rows, to tell "already approved" apart
// from "RLS filtered the write away". Defaults to an empty queue → the read
// resolves `{ data: null }` (row gone), which keeps the idempotent branch.
let adminSupabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminSupabaseMock,
}));

function lastRedirect(): string | undefined {
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  if (!arg) return undefined;
  return typeof arg === 'string' ? arg : arg.href;
}

beforeEach(() => {
  vi.clearAllMocks();
  adminSupabaseMock = buildSupabaseMock([]);
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
      { data: [{ user_id: 'user-a' }], error: null }, // game_players.update (withdrawn_at) → 1 row
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
    // The organiser withdrew the last missing player: asked, and O10 decides there.
    expect(notifyOrganizerIfAllDeliveredMock.mock.calls).toEqual([
      ['game-1', 'creator-1', 'adminWithdrawPlayer'],
    ]);
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
      { data: [{ user_id: 'user-a' }], error: null }, // game_players.update (withdrawn_at) → 1 row
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
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
    expect(notifyOrganizerIfAllDeliveredMock.mock.calls).toEqual([
      ['game-1', 'admin-1', 'adminWithdrawPlayer'],
    ]);
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

  // #2030: a stale tab or a double click withdraws a player who is already
  // withdrawn (or no longer on the roster). The guarded UPDATE matches 0 rows,
  // and that must surface as its own error, never as a success with an audit row.
  it('0 rows (already withdrawn): redirects ?error=withdraw_stale without an audit row', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, name: 'Kari' }, error: null }, // users (loadRole)
      { data: { created_by: 'creator-1' }, error: null }, // games.created_by (owner)
      {
        data: { id: 'game-1', name: 'Lørdagsrunde', status: 'active', game_mode: 'stableford' },
        error: null,
      }, // games (action body)
      { data: [], error: null }, // game_players.update (withdrawn_at) → 0 rows
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'creator-1' } },
    });

    const { adminWithdrawPlayer } = await import('./actions');

    await expect(adminWithdrawPlayer('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/games/game-1/spillere?error=withdraw_stale');
    expect(logAdminEventMock).not.toHaveBeenCalled();
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
    const writeFilters = supabaseMock.__fromCalls
      .filter((c) => c.table === 'game_players')
      .map((c) => [c.method, ...c.args]);
    expect(writeFilters).toContainEqual(['is', 'withdrawn_at', null]);
    expect(writeFilters).toContainEqual(['select', 'user_id']);
  });

  it('DB error on the write: redirects ?error=db_players without an audit row', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      {
        data: { id: 'game-1', name: 'Vinter-cup', status: 'active', game_mode: 'best_ball' },
        error: null,
      }, // games
      { data: null, error: { message: 'boom' } }, // game_players.update → error
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { adminWithdrawPlayer } = await import('./actions');

    await expect(adminWithdrawPlayer('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?error=db_players');
    expect(logAdminEventMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
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
      { data: [{ user_id: 'user-a' }], error: null }, // game_players.update (null out withdrawn) → 1 row
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
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
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

  // #2030: undoing a withdrawal that is already undone (or for a player no
  // longer on the roster) matches 0 rows. That is the opposite state of a stale
  // withdraw, so it gets its own code.
  it('0 rows (already back in): redirects ?error=reinstate_stale without an audit row', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      {
        data: { id: 'game-1', name: 'Vinter-cup', status: 'active', game_mode: 'stableford' },
        error: null,
      }, // games
      { data: [], error: null }, // game_players.update (null out withdrawn) → 0 rows
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { adminUndoWithdraw } = await import('./actions');

    await expect(adminUndoWithdraw('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?error=reinstate_stale');
    expect(logAdminEventMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
    const writeFilters = supabaseMock.__fromCalls
      .filter((c) => c.table === 'game_players')
      .map((c) => [c.method, ...c.args]);
    expect(writeFilters).toContainEqual(['not', 'withdrawn_at', 'is', null]);
    expect(writeFilters).toContainEqual(['select', 'user_id']);
  });
});

// ─── adminApproveScorecard (admin + creator override, #429) ─────────────────

describe('adminApproveScorecard', () => {
  it('admin: approves a pending scorecard, lands in Sekretariatet', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users (loadRole)
      { data: { status: 'active' }, error: null }, // games.select(status)
      // #712: expectAffected requires .select() on the mutation. 1-row response = success.
      { data: [{ user_id: 'user-a' }], error: null }, // game_players.update (approved_at) → 1 row
      { data: { name: 'Vinter-cup' }, error: null }, // games.select(name) for notify
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { adminApproveScorecard } = await import('./actions');

    await expect(adminApproveScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    // #1067: hash-anchors the redirect so a hard/MPA nav lands back on
    // «Leverte scorekort» instead of page top (client-side fallback covers
    // the common case where a server-action redirect drops the fragment).
    expect(lastRedirect()).toBe('/admin/games/game-1?status=admin_approved#leverte-scorekort');
    // #1598: rollen følger med i payloaden, så en navnløs arrangør får
    // «Arrangøren»-fallbacken i kortet — ikke «En spiller».
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'user-a',
      kind: 'scorecard_approved',
      payload: {
        game_id: 'game-1',
        game_name: 'Vinter-cup',
        approver_name: 'Jørgen',
        approver_role: 'organizer',
      },
    });
    // #2203: the last approval can make the round ready to finish.
    expect(notifyOrganizerIfAllDeliveredMock.mock.calls).toEqual([
      ['game-1', 'admin-1', 'adminApproveScorecard'],
    ]);
  });

  it('creator: approves on own game, lands on /games/[id]/spillere', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, name: 'Kari' }, error: null }, // users (loadRole)
      { data: { created_by: 'creator-1' }, error: null }, // games.created_by (owner)
      { data: { status: 'active' }, error: null }, // games.select(status)
      // #712: expectAffected requires .select() on the mutation. 1-row response = success.
      { data: [{ user_id: 'user-a' }], error: null }, // game_players.update → 1 row
      { data: { name: 'Lørdagsrunde' }, error: null }, // games.select(name)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'creator-1' } },
    });

    const { adminApproveScorecard } = await import('./actions');

    await expect(adminApproveScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    // #1067: creator surface (`/games/[id]/spillere`) got its own
    // `#leverte-scorekort` anchor so the same hash works for both roles.
    expect(lastRedirect()).toBe('/games/game-1/spillere?status=admin_approved#leverte-scorekort');
  });

  it('admin: 0-row update (already approved) → idempotent success, no re-notify', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users (loadRole)
      { data: { status: 'active' }, error: null }, // games.select(status)
      // #712: scorecard already approved → UPDATE matches 0 rows. expectAffected
      // throws NoRowsAffectedError; the catch treats it as idempotent success
      // WITHOUT firing the audit log or notification (the latent bug #712 fixed).
      { data: [], error: null }, // game_players.update → 0 rows
    ]);
    // #1595: the re-read confirms the card really is approved already, so the
    // idempotent branch is the honest answer here.
    adminSupabaseMock = buildSupabaseMock([
      { data: { approved_at: '2026-08-14T10:00:00Z' }, error: null }, // game_players re-read
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { adminApproveScorecard } = await import('./actions');

    await expect(adminApproveScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?status=admin_approved#leverte-scorekort');
    expect(notifyMock).not.toHaveBeenCalled();
    expect(logAdminEventMock).not.toHaveBeenCalled();
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
  });

  it('#1595: 0-row update while the scorecard is still pending → ?error=db_players, not a false success', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, name: 'Kari' }, error: null }, // users (loadRole)
      { data: { created_by: 'creator-1' }, error: null }, // games.created_by (owner)
      { data: { status: 'active' }, error: null }, // games.select(status)
      { data: [], error: null }, // game_players.update → 0 rows (RLS filtered it away)
    ]);
    // The row exists and approved_at is STILL null → the write was blocked, not
    // redundant. This is the shape a non-playing creator saw before migration
    // 0160 opened the creator SELECT branch.
    adminSupabaseMock = buildSupabaseMock([
      { data: { approved_at: null }, error: null }, // game_players re-read
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'creator-1' } },
    });

    const { adminApproveScorecard } = await import('./actions');

    await expect(adminApproveScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/games/game-1/spillere?error=db_players');
    expect(notifyMock).not.toHaveBeenCalled();
    expect(logAdminEventMock).not.toHaveBeenCalled();
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
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

// ─── reopenScorecard ────────────────────────────────────────────────────────

describe('reopenScorecard (#1363)', () => {
  it('reopens a submitted scorecard and notifies the player', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users (requireAdmin)
      { data: { name: 'Vinter-cup', status: 'active' }, error: null }, // games.select(name, status)
      // expectAffected requires .select() on the mutation. 1 row = a real reopen.
      { data: [{ user_id: 'user-a' }], error: null }, // game_players.update → 1 row
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { reopenScorecard } = await import('./actions');

    await expect(reopenScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/admin/games/game-1?status=scorecard_reopened');
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'user-a',
      kind: 'scorecard_reopened',
      payload: {
        game_id: 'game-1',
        game_name: 'Vinter-cup',
        actor_name: 'Jørgen',
      },
    });
  });

  it('#1598: a nameless organizer sends actor_name null, not the «Admin» audit string', async () => {
    // Payloaden leses i MOTTAKERENS locale, så den skal aldri bære audit-
    // loggens norske 'Admin'-fallback. Uten navn → null, og kortet fyller
    // «Arrangøren»/«The organizer» ved render.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: null }, error: null }, // users (requireAdmin) — no profile name
      { data: { name: 'Vinter-cup', status: 'active' }, error: null }, // games.select(name, status)
      { data: [{ user_id: 'user-a' }], error: null }, // game_players.update → 1 row
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { reopenScorecard } = await import('./actions');

    await expect(reopenScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'user-a',
      kind: 'scorecard_reopened',
      payload: {
        game_id: 'game-1',
        game_name: 'Vinter-cup',
        actor_name: null,
      },
    });
    // Audit-loggen beholder sin egen streng — den er ikke bruker-rettet.
    expect(logAdminEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorName: 'Admin' }),
    );
  });

  it('0-row update (nothing submitted) → idempotent success, no varsel', async () => {
    // The `.not('submitted_at','is',null)` filter matches nothing when the card
    // was never submitted or is already reopened. Before #1363 the action only
    // destructured `{ error }`, so a 0-row no-op looked like a success and
    // would have fired a varsel for a write that never happened.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      { data: { name: 'Vinter-cup', status: 'active' }, error: null }, // games.select
      { data: [], error: null }, // game_players.update → 0 rows
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { reopenScorecard } = await import('./actions');

    await expect(reopenScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/admin/games/game-1?status=scorecard_reopened');
    expect(notifyMock).not.toHaveBeenCalled();
    expect(logAdminEventMock).not.toHaveBeenCalled();
  });

  it('notify failure does not change the outcome of the reopen', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users
      { data: { name: 'Vinter-cup', status: 'active' }, error: null }, // games.select
      { data: [{ user_id: 'user-a' }], error: null }, // game_players.update → 1 row
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });
    notifyMock.mockRejectedValueOnce(new Error('insert failed'));

    const { reopenScorecard } = await import('./actions');

    await expect(reopenScorecard('game-1', 'user-a')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/admin/games/game-1?status=scorecard_reopened');
    expect(consoleErr).toHaveBeenCalledWith(
      '[reopenScorecard] scorecard_reopened notify failed',
      expect.any(Error),
    );
    consoleErr.mockRestore();
  });

  it('#2213: reopening a team card reopens every active team member', async () => {
    // Texas scramble: the captain (lex-min) owns the team's shared rows.
    // Reopening only the teammate's card left the captain's row submitted, so
    // the hole page kept the team card locked and RLS refused the correction.
    // The whole active team reopens in one UPDATE on the same RLS client.
    const CAPTAIN = 'a-captain';
    const MATE = 'u-mate';
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // users (requireAdmin)
      {
        data: { name: 'Vinter-cup', status: 'active', game_mode: 'texas_scramble' },
        error: null,
      }, // games.select(name, status, game_mode)
      {
        data: [
          { user_id: CAPTAIN, team_number: 1, withdrawn_at: null },
          { user_id: MATE, team_number: 1, withdrawn_at: null },
          { user_id: 'c-other', team_number: 2, withdrawn_at: null },
        ],
        error: null,
      }, // game_players roster
      { data: [{ user_id: CAPTAIN }, { user_id: MATE }], error: null }, // game_players.update → the whole team
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { reopenScorecard } = await import('./actions');

    await expect(reopenScorecard('game-1', MATE)).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/admin/games/game-1?status=scorecard_reopened');

    expect(supabaseMock.__fromCalls).toContainEqual({
      table: 'game_players',
      method: 'in',
      args: ['user_id', [CAPTAIN, MATE]],
    });
    expect(supabaseMock.__fromCalls).toContainEqual({
      table: 'game_players',
      method: 'not',
      args: ['submitted_at', 'is', null],
    });
    // No new service-role site: the organizer gate + RLS carry the write.
    expect(
      adminSupabaseMock.__fromCalls.some((c) => c.method === 'update'),
    ).toBe(false);

    for (const userId of [CAPTAIN, MATE]) {
      expect(notifyMock).toHaveBeenCalledWith({
        userId,
        kind: 'scorecard_reopened',
        payload: {
          game_id: 'game-1',
          game_name: 'Vinter-cup',
          actor_name: 'Jørgen',
        },
      });
    }
    expect(logAdminEventMock).toHaveBeenCalledTimes(1);
    expect(logAdminEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          gameId: 'game-1',
          playerUserId: MATE,
          reopenedUserIds: [CAPTAIN, MATE],
        },
      }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
  });
});

describe('endGame', () => {
  /**
   * #1856: the finish tail lives in `runFinishPipeline` now, and it claims
   * `games.finish_pipeline_at` through the SERVICE-ROLE client before running a
   * single step (at-most-once — the achievement varsler and the billed round
   * report are not idempotent). Tests that expect the tail to run must hand the
   * claim a winning row; the shared `adminSupabaseMock` is otherwise empty,
   * which reads as «already claimed».
   */
  function claimWon() {
    adminSupabaseMock = buildSupabaseMock([
      { data: { id: 'game-1' }, error: null },
    ]);
  }

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
    claimWon();
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
      { data: [{ id: 'game-1' }], error: null }, // games.update — flip WON
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
    claimWon();
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
      { data: [{ id: 'game-1' }], error: null }, // games.update — flip WON
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
    claimWon();
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
      { data: [{ id: 'game-1' }], error: null }, // games.update — flip WON
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
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
    expect(lastRedirect()).toBe('/admin/games/game-1?status=finished');
  });

  it('off-app gating: filtrerer game_finished-mail per spiller basert på shouldAlsoSendMail', async () => {
    claimWon();
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
      { data: [{ id: 'game-1' }], error: null }, // games.update — flip WON
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

// ─── reopenGame ─────────────────────────────────────────────────────────────

describe('reopenGame', () => {
  it('#1670: a nameless admin sends actor_name null, not the «Admin» audit string', async () => {
    // Same rule as #1598 gave reopenScorecard: the payload is read in the
    // RECIPIENT's locale, so it must never carry the audit log's Norwegian
    // 'Admin' fallback. No name → null, and the card fills
    // «Arrangøren»/«The organizer» at render time.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: null }, error: null }, // users (requireAdmin) — no profile name
      {
        data: { id: 'game-1', name: 'Vinter-cup', status: 'finished' },
        error: null,
      }, // games.select(id, name, status)
      { data: [{ id: 'game-1' }], error: null }, // games.update(status='active') → ok
      { data: [], error: null }, // syncDerivedGamesStatus lookup → no derived games
      {
        data: [{ user_id: 'admin-1' }, { user_id: 'user-a' }],
        error: null,
      }, // game_players roster (actor included, filtered out below)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { reopenGame } = await import('./actions');

    await expect(reopenGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?status=game_reopened');
    // The actor stays out of their own fan-out — only the co-player is told.
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: 'user-a',
      kind: 'game_reopened',
      payload: {
        game_id: 'game-1',
        game_name: 'Vinter-cup',
        actor_name: null,
      },
    });
    // The audit log keeps its own string — it is not user-facing.
    expect(logAdminEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorName: 'Admin' }),
    );
  });

  it('#1856: nulls finish_pipeline_at on the host AND on every derived game', async () => {
    // The marker is the finish tail's at-most-once claim. Reopening a game to
    // correct a score and finishing it again must re-run that tail — the
    // numbers changed. Leave the marker set and `claimFinishPipeline` finds 0
    // rows, so the re-finish silently ships no result summaries, no
    // differentials, no achievements, no audit row and no mail — and no round
    // report either, because the same UPDATE just nulled the one that existed.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // requireAdmin
      {
        data: { id: 'game-1', name: 'Vinter-cup', status: 'finished' },
        error: null,
      }, // games.select(id, name, status)
      { data: [{ id: 'game-1' }], error: null }, // games.update(...) on the host → ok
      { data: [{ id: 'derived-1' }], error: null }, // findDerivedGameIds
      { data: [{ id: 'derived-1' }], error: null }, // the derived batch UPDATE
      { data: [{ user_id: 'admin-1' }], error: null }, // roster (actor only)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { reopenGame } = await import('./actions');

    await expect(reopenGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?status=game_reopened');

    const updates = supabaseMock.__fromCalls
      .filter((c) => c.table === 'games' && c.method === 'update')
      .map((c) => c.args[0]);
    expect(updates).toEqual([
      // Host.
      {
        status: 'active',
        ended_at: null,
        round_report: null,
        finish_pipeline_at: null,
      },
      // Derived fan-out — same patch, same reason (#1441 D3 + #1856).
      {
        status: 'active',
        ended_at: null,
        round_report: null,
        finish_pipeline_at: null,
      },
    ]);
  });

  it('#2214: a match in a finished cup is not reopened, nothing is written', async () => {
    // A finished cup stands: reopening a match would make an active match in
    // it and move the points under a winner who is already named.
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // requireAdmin
      {
        data: {
          id: 'game-1',
          name: 'Kamp 3',
          status: 'finished',
          tournament_id: 'cup-1',
          tournament: { status: 'finished' },
        },
        error: null,
      }, // games.select
      { data: null, error: null }, // (must never be claimed by an update)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { reopenGame } = await import('./actions');

    await expect(reopenGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect({
      redirect: lastRedirect(),
      updates: supabaseMock.__fromCalls.filter((c) => c.method === 'update').length,
    }).toEqual({ redirect: '/admin/games/game-1?error=cup_finished', updates: 0 });
  });

  it('#2293: a status flip that hits 0 rows is db_game — no derived sync, audit or varsel', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // requireAdmin
      {
        data: { id: 'game-1', name: 'Vinter-cup', status: 'finished' },
        error: null,
      }, // games.select
      { data: [], error: null }, // games.update(...) → 0 rows
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { reopenGame } = await import('./actions');

    await expect(reopenGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?error=db_game');
    // syncDerivedGamesStatus would read games again; nothing runs after the write.
    expect(supabaseMock.__fromCalls.filter((c) => c.method === 'update')).toHaveLength(1);
    expect(supabaseMock.from).toHaveBeenCalledTimes(3);
    expect(logAdminEventMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('#2214: a match in an active cup is reopened as before', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // requireAdmin
      {
        data: {
          id: 'game-1',
          name: 'Kamp 3',
          status: 'finished',
          tournament_id: 'cup-1',
          tournament: { status: 'active' },
        },
        error: null,
      }, // games.select
      { data: [{ id: 'game-1' }], error: null }, // games.update(...) on the host → ok
      { data: [], error: null }, // syncDerivedGamesStatus lookup → none
      { data: [{ user_id: 'admin-1' }], error: null }, // roster (actor only)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { reopenGame } = await import('./actions');

    await expect(reopenGame('game-1')).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/admin/games/game-1?status=game_reopened');
  });
});

describe('startScheduledGameAction (#2207)', () => {
  it('pending_players → the ids in the URL, never an address', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // requireAdmin
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });
    startScheduledGameMock.mockResolvedValueOnce({
      ok: false,
      reason: 'pending_players',
      pendingUserIds: ['u1', 'u2'],
    });

    const { startScheduledGameAction } = await import('./actions');
    await expect(startScheduledGameAction('game-1')).rejects.toBeInstanceOf(RedirectError);

    const url = new URL(lastRedirect()!, 'http://x');
    expect(url.pathname).toBe('/admin/games/game-1');
    expect(url.searchParams.get('error')).toBe('pending_players');
    expect(url.searchParams.get('pending')).toBe('u1,u2');
    expect(lastRedirect()).not.toMatch(/@|emails=/);
  });

  it('admin starts the round and lands in the Sekretariat (#2202: service role)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // requireAdminOrCreator
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });
    startScheduledGameMock.mockResolvedValueOnce({ ok: true, started: true });

    const { startScheduledGameAction } = await import('./actions');
    await expect(startScheduledGameAction('game-1')).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/admin/games/game-1?status=started');
    expect(startScheduledGameMock).toHaveBeenCalledWith(adminSupabaseMock, 'game-1');
    expect(announceStartedGameMock).toHaveBeenCalledWith(
      adminSupabaseMock,
      'game-1',
      'admin-1',
      'startScheduledGameAction',
    );
  });

  it('admin who starts from the game page lands back on the game page, without ids', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // requireAdminOrCreator
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });
    startScheduledGameMock.mockResolvedValueOnce({
      ok: false,
      reason: 'pending_players',
      pendingUserIds: ['u1'],
    });

    const { startScheduledGameAction } = await import('./actions');
    await expect(startScheduledGameAction('game-1', 'game')).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1?error=pending_players');
  });

  it('admin who starts from the game page lands on /games/[id]?status=started', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: true, name: 'Jørgen' }, error: null }, // requireAdminOrCreator
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });
    startScheduledGameMock.mockResolvedValueOnce({ ok: true, started: true });

    const { startScheduledGameAction } = await import('./actions');
    await expect(startScheduledGameAction('game-1', 'game')).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1?status=started');
  });

  // #2202: the game's organiser starts from the game page, on the service-role
  // client after the requireAdminOrCreator gate, like the app's start route.
  function organiserSession(createdBy: string) {
    supabaseMock = buildSupabaseMock([
      { data: { is_admin: false, name: 'Ola' }, error: null }, // users (loadRole)
      { data: { created_by: createdBy }, error: null }, // games.created_by
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'creator-1' } },
    });
  }

  it('a non-admin organiser starts the round and lands on the game page', async () => {
    organiserSession('creator-1');
    startScheduledGameMock.mockResolvedValueOnce({ ok: true, started: true });

    const { startScheduledGameAction } = await import('./actions');
    await expect(startScheduledGameAction('game-1')).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1?status=started');
    expect(startScheduledGameMock).toHaveBeenCalledWith(adminSupabaseMock, 'game-1');
    expect(announceStartedGameMock).toHaveBeenCalledWith(
      adminSupabaseMock,
      'game-1',
      'creator-1',
      'startScheduledGameAction',
    );
  });

  it('a stranger is sent home and nothing starts', async () => {
    organiserSession('someone-else');

    const { startScheduledGameAction } = await import('./actions');
    await expect(startScheduledGameAction('game-1')).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/');
    expect(startScheduledGameMock).not.toHaveBeenCalled();
    expect(announceStartedGameMock).not.toHaveBeenCalled();
  });

  it('pending_players for the organiser carries no ids', async () => {
    organiserSession('creator-1');
    startScheduledGameMock.mockResolvedValueOnce({
      ok: false,
      reason: 'pending_players',
      pendingUserIds: ['u1', 'u2'],
    });

    const { startScheduledGameAction } = await import('./actions');
    await expect(startScheduledGameAction('game-1')).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1?error=pending_players');
  });

  it('rotation_player_count for the organiser carries format and count', async () => {
    organiserSession('creator-1');
    startScheduledGameMock.mockResolvedValueOnce({
      ok: false,
      reason: 'rotation_player_count',
      rotationMode: 'wolf',
      rotationActiveCount: 2,
    });

    const { startScheduledGameAction } = await import('./actions');
    await expect(startScheduledGameAction('game-1')).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1?error=rotation_player_count&mode=wolf&count=2');
  });
});

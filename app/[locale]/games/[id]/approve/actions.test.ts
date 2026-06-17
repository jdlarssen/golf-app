import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for `approveScorecard`.
 *
 * The action runs `loadAndAuthorize` first, which does:
 *   1. auth.getUser
 *   2. games.select(status, game_mode).single
 *   3. users.select(is_admin).single
 *   4. (if not admin) game_players.select(user_id, flight_number, withdrawn_at)
 *      for entire game (peersForApproval — #543)
 *
 * Then on the action itself:
 *   5. game_players.update(...).eq.eq.not.is.select  (resolves to affected rows)
 *
 * Since #704 the UPDATE ends in `.select('user_id')` so the action can detect a
 * 0-row write (RLS-blocked peer-approval → Supabase returns error == null on a
 * 0-row UPDATE). A successful write resolves to `{ data: [{ user_id }] }`; a
 * blocked write resolves to `{ data: [] }`, after which approveScorecard does a
 * follow-up read of `approved_at` to tell "already approved" (idempotent) from
 * "write rejected" (the bug) apart.
 *
 * Tests configure the queue to match this sequence per case.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) =>
    redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nb',
}));

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

function lastRedirect(): string | undefined {
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  if (!arg) return undefined;
  return typeof arg === 'string' ? arg : (arg as { href: string }).href;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('approveScorecard', () => {
  it('redirects to /login when no user is authenticated (auth gate)', async () => {
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { approveScorecard } = await import('./actions');

    await expect(approveScorecard('game-1', 'player-2')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/login' }),
    );
  });

  it('redirects to /approve?error=not_active when game is finished (validation)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { status: 'finished' }, error: null }, // games lookup
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { approveScorecard } = await import('./actions');

    await expect(approveScorecard('game-1', 'player-2')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/games/game-1/approve?error=not_active');
  });

  it('happy path (admin): updates approved_at and redirects with ?status=approved', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { status: 'active', game_mode: 'singles_matchplay' }, error: null }, // games
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: [{ user_id: 'player-2' }], error: null }, // game_players.update → 1 row affected
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { approveScorecard } = await import('./actions');

    await expect(approveScorecard('game-1', 'player-2')).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
    expect(revalidatePathMock).toHaveBeenCalledWith('/games/game-1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/games/game-1/approve');
    expect(lastRedirect()).toBe('/games/game-1/approve?status=approved');
  });

  it('#704: 0-row write (RLS-blocked peer) → ?error=db, no success, no notification', async () => {
    // The bug: a same-flight peer who is not creator/admin matches no UPDATE
    // policy → 0 rows, error == null. Without the rows-affected guard this would
    // falsely redirect ?status=approved and send the approval notification.
    supabaseMock = buildSupabaseMock([
      { data: { status: 'active', game_mode: 'singles_matchplay' }, error: null }, // games
      { data: { is_admin: false }, error: null }, // users.is_admin
      {
        data: [
          { user_id: 'side1', flight_number: 1, withdrawn_at: null },
          { user_id: 'side2', flight_number: 2, withdrawn_at: null },
        ],
        error: null,
      }, // game_players for peersForApproval
      { data: [], error: null }, // game_players.update → 0 rows (RLS blocked)
      { data: { approved_at: null }, error: null }, // follow-up read: still not approved
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'side2' } },
    });

    const { approveScorecard } = await import('./actions');

    await expect(approveScorecard('game-1', 'side1')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/games/game-1/approve?error=db');
    // Critical: no success-revalidation, so no notification was sent.
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('#704: 0-row write but already approved → idempotent ?status=approved, no re-notification', async () => {
    // An already-approved card legitimately matches 0 rows (the `.is(approved_at,
    // null)` filter). The follow-up read finds approved_at set → idempotent
    // success, but the notification is NOT re-sent.
    supabaseMock = buildSupabaseMock([
      { data: { status: 'active', game_mode: 'singles_matchplay' }, error: null }, // games
      { data: { is_admin: false }, error: null }, // users.is_admin
      {
        data: [
          { user_id: 'side1', flight_number: 1, withdrawn_at: null },
          { user_id: 'side2', flight_number: 2, withdrawn_at: null },
        ],
        error: null,
      }, // game_players for peersForApproval
      { data: [], error: null }, // game_players.update → 0 rows (already approved)
      { data: { approved_at: '2026-06-17T10:00:00Z' }, error: null }, // follow-up read: already approved
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'side2' } },
    });

    const { approveScorecard } = await import('./actions');

    await expect(approveScorecard('game-1', 'side1')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/games/game-1/approve?status=approved');
    // Idempotent success still revalidates so stale "pending" UI clears.
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
  });

  it('edge case (authorization): non-admin in a different flight (>4 spill) redirects to /', async () => {
    // Defence-in-depth: >4-spill med assigned flights — ulik flight = avvist.
    // 6 spillere: user-1 flight 1, player-2 flight 2 → ikke lov.
    supabaseMock = buildSupabaseMock([
      { data: { status: 'active', game_mode: 'skins' }, error: null }, // games
      { data: { is_admin: false }, error: null }, // users.is_admin (not admin)
      // game_players: 6 spillere, user-1 i flight 1, player-2 i flight 2
      {
        data: [
          { user_id: 'user-1', flight_number: 1, withdrawn_at: null },
          { user_id: 'user-a', flight_number: 1, withdrawn_at: null },
          { user_id: 'user-b', flight_number: 1, withdrawn_at: null },
          { user_id: 'user-c', flight_number: 1, withdrawn_at: null },
          { user_id: 'player-2', flight_number: 2, withdrawn_at: null },
          { user_id: 'user-d', flight_number: 2, withdrawn_at: null },
        ],
        error: null,
      },
      // No UPDATE queued — we expect the action to short-circuit before it.
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { approveScorecard } = await import('./actions');

    await expect(approveScorecard('game-1', 'player-2')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/');
    // No revalidation when authz fails.
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('#543: singles matchplay (2 spillere, singleFlight) — motstander kan attestere', async () => {
    // Én-flight-regel: 2 aktive spillere → singleFlight. Motstanderens side
    // (flight 2) er lovlig attestant for side 1-spillerens scorekort.
    supabaseMock = buildSupabaseMock([
      { data: { status: 'active', game_mode: 'singles_matchplay' }, error: null }, // games
      { data: { is_admin: false }, error: null }, // users.is_admin
      // game_players: 2 spillere, ulik flight
      {
        data: [
          { user_id: 'side1', flight_number: 1, withdrawn_at: null },
          { user_id: 'side2', flight_number: 2, withdrawn_at: null },
        ],
        error: null,
      },
      { data: [{ user_id: 'side1' }], error: null }, // game_players.update (approve) → 1 row
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'side2' } }, // motstander godkjenner
    });

    const { approveScorecard } = await import('./actions');

    // Skal gå gjennom — side2 er peer for side1 i singleFlight.
    await expect(approveScorecard('game-1', 'side1')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/games/game-1/approve?status=approved');
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
  });
});

describe('rejectScorecard', () => {
  function makeFormData(playerUserId: string, reason = 'Feil sum') {
    const fd = new FormData();
    fd.set('player_user_id', playerUserId);
    fd.set('reason', reason);
    return fd;
  }

  it('happy path (admin): clears submitted_at and redirects with ?status=rejected', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { status: 'active', game_mode: 'singles_matchplay' }, error: null }, // games
      { data: { is_admin: true }, error: null }, // users.is_admin
      { data: [{ user_id: 'player-2' }], error: null }, // game_players.update → 1 row
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'admin-1' } },
    });

    const { rejectScorecard } = await import('./actions');

    await expect(
      rejectScorecard('game-1', makeFormData('player-2')),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/games/game-1/approve?status=rejected');
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
  });

  it('#704: 0-row reject (RLS-blocked peer) → ?error=db, no success redirect', async () => {
    // Same trap as approveScorecard: a 0-row UPDATE returns error == null. Reject
    // has no idempotency filter, so 0 rows unambiguously means access denied.
    supabaseMock = buildSupabaseMock([
      { data: { status: 'active', game_mode: 'singles_matchplay' }, error: null }, // games
      { data: { is_admin: false }, error: null }, // users.is_admin
      {
        data: [
          { user_id: 'side1', flight_number: 1, withdrawn_at: null },
          { user_id: 'side2', flight_number: 2, withdrawn_at: null },
        ],
        error: null,
      }, // game_players for peersForApproval
      { data: [], error: null }, // game_players.update → 0 rows (RLS blocked)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'side2' } },
    });

    const { rejectScorecard } = await import('./actions');

    await expect(
      rejectScorecard('game-1', makeFormData('side1')),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(lastRedirect()).toBe('/games/game-1/approve?error=db');
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for `submitScorecard`.
 *
 * Mocking approach (shared across all four server-action test files):
 * - `redirect` from `next/navigation` throws `RedirectError` so callers
 *   never run code past a redirect. Tests catch and inspect the URL.
 * - `next/cache` revalidate helpers are no-op spies.
 * - `getServerClient` returns a chainable fake whose query results come
 *   from a per-test FIFO queue.
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

const sendScorecardSubmittedNotificationMock =
  vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ ok: true }));
vi.mock('@/lib/mail/scorecardSubmittedNotification', () => ({
  sendScorecardSubmittedNotification: (...args: unknown[]) =>
    sendScorecardSubmittedNotificationMock(...args),
}));

// Phase 4 mail-gating: notify() returnerer shouldAlsoSendMail som styrer om
// admin-mailen sendes. Default = true så happy-path-testen får sin historiske
// 1-mail-til-Jørgen-oppførsel. Per-test override via mockResolvedValueOnce
// dekker off-app vs aktive scenarier hvis vi vil teste gating eksplisitt.
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

describe('submitScorecard', () => {
  it('redirects to /login when no user is authenticated (auth gate)', async () => {
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('redirects with ?error=not_active when game status is not active (validation)', async () => {
    supabaseMock = buildSupabaseMock([
      // Game lookup: status is 'finished' (not 'active').
      { data: { name: 'Test', status: 'finished' }, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/games/game-1/submit?error=not_active');
  });

  it('happy path: marks submitted_at, notifies admins (filters self), redirects with ?status=submitted', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { name: 'Vinter-cup', status: 'active' }, error: null },
      // UPDATE returns the matched row via .select('user_id') — non-empty
      // means this was a fresh submit, so notify + mail must fire.
      { data: [{ user_id: 'user-1' }], error: null },
      { data: { name: 'Ola Nordmann' }, error: null }, // submitter name
      {
        // admins list
        data: [
          { id: 'admin-1', email: 'jorgen@tornygolf.no', name: 'Jørgen' },
          { id: 'user-1', email: 'ola@example.com', name: 'Ola Nordmann' },
        ],
        error: null,
      },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
    expect(revalidatePathMock).toHaveBeenCalledWith('/games/game-1');

    // Submitter (user-1) is filtered out — only Jørgen receives mail.
    expect(sendScorecardSubmittedNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendScorecardSubmittedNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jorgen@tornygolf.no',
        playerName: 'Ola Nordmann',
        gameName: 'Vinter-cup',
        gameId: 'game-1',
      }),
    );

    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
  });

  it('off-app gating: filtrerer admin-mail når shouldAlsoSendMail=false', async () => {
    // Phase 4-kontrakt: aktive admin-er (last_seen_at < 5 min) får KUN in-app
    // varsel, ingen mail. Simulert ved at notify-mock returnerer false for
    // Jørgen — verifiserer at mail-loopen filtrerer ham bort.
    notifyMock.mockResolvedValueOnce({ shouldAlsoSendMail: false });

    supabaseMock = buildSupabaseMock([
      { data: { name: 'Vinter-cup', status: 'active' }, error: null },
      { data: [{ user_id: 'user-1' }], error: null }, // UPDATE game_players (fresh)
      { data: { name: 'Ola Nordmann' }, error: null },
      {
        data: [
          { id: 'admin-1', email: 'jorgen@tornygolf.no', name: 'Jørgen' },
          { id: 'user-1', email: 'ola@example.com', name: 'Ola Nordmann' },
        ],
        error: null,
      },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );

    // Notify ble kalt (in-app fyres alltid), men mail ble IKKE sendt fordi
    // Jørgen er aktiv. Submitteren (user-1) er fortsatt filtrert ut uansett.
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
  });

  it('off-app gating: notify-feil → ingen mail (fail-closed)', async () => {
    // Hvis notify-rejection skjer (DB/network-error), defaultes sendMail til
    // false — vi vil aldri ha en situasjon der mail sendes uten in-app-rad.
    notifyMock.mockRejectedValueOnce(new Error('insert failed'));

    supabaseMock = buildSupabaseMock([
      { data: { name: 'Vinter-cup', status: 'active' }, error: null },
      { data: [{ user_id: 'user-1' }], error: null }, // UPDATE (fresh)
      { data: { name: 'Ola Nordmann' }, error: null },
      {
        data: [{ id: 'admin-1', email: 'jorgen@tornygolf.no', name: 'Jørgen' }],
        error: null,
      },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
  });

  it('edge case: redirects with ?error=db when the update returns an error', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { name: 'Test', status: 'active' }, error: null },
      { data: null, error: { message: 'permission denied' } }, // UPDATE fails
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );
    expect(lastRedirect()).toBe('/games/game-1/submit?error=db');
    // Mail must NOT fire on a DB error — pre-redirect short-circuit.
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
  });

  it('re-submit: 0 rader oppdatert → ingen notify, ingen mail, men redirect OK', async () => {
    // Phase 4-regresjon: tidligere fyrte vi notify + mail på nytt hver gang
    // submitScorecard ble kalt fordi `.is('submitted_at', null)` returnerer
    // `error == null` selv ved 0 rader endret. Nå sjekker vi
    // `updated.length === 0` og bypasser side-effects på re-submit (double-
    // click eller race med peer-godkjenning).
    supabaseMock = buildSupabaseMock([
      { data: { name: 'Vinter-cup', status: 'active' }, error: null },
      { data: [], error: null }, // UPDATE matched 0 rows — already submitted
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
  });
});

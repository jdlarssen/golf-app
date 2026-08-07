import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit tests for `submitScorecard`.
 *
 * Mocking approach (shared across all four server-action test files):
 * - `redirect` from `@/i18n/navigation` throws `RedirectError` so callers
 *   never run code past a redirect. Tests catch and inspect the URL via
 *   `RedirectError.url`.
 * - `next/cache` revalidate helpers are no-op spies.
 * - `getServerClient` returns a chainable fake whose query results come
 *   from a per-test FIFO queue.
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

// #1453: lag-leverings-cascaden gaar via admin-client - egen FIFO-mock.
let adminSupabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminSupabaseMock,
}));

function lastRedirect(): string | undefined {
  const arg = redirectMock.mock.calls.at(-1)?.[0];
  if (!arg) return undefined;
  return typeof arg === 'string' ? arg : (arg as { href: string }).href;
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
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: '/login' }),
    );
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

  it('WD gate (#387): a withdrawn player is bounced to game-home, no submit, no notify', async () => {
    // Defense-in-depth: the submit page redirects withdrawn players away, but a
    // direct POST to this action must also be refused. A trukket spiller lands
    // on game-home (which renders the «Du har trukket deg»-banner) and never
    // touches submitted_at, notify, or mail.
    supabaseMock = buildSupabaseMock([
      { data: { name: 'Vinter-cup', status: 'active' }, error: null },
      { data: { withdrawn_at: '2026-06-05T10:00:00Z' }, error: null }, // withdrawn!
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/games/game-1');
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
  });

  it('happy path: marks submitted_at, notifies admins (filters self), redirects with ?status=submitted', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { name: 'Vinter-cup', status: 'active' }, error: null },
      { data: { withdrawn_at: null }, error: null }, // WD gate (#387): not withdrawn
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
      { data: { withdrawn_at: null }, error: null }, // WD gate (#387): not withdrawn
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
      { data: { withdrawn_at: null }, error: null }, // WD gate (#387): not withdrawn
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
      { data: { withdrawn_at: null }, error: null }, // WD gate (#387): not withdrawn
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

  it('#543: singles matchplay (singleFlight) — motstander varsles som peer', async () => {
    // Én-flight-regel: 2 aktive spillere (sides 1+2) → singleFlight.
    // peersForApproval() returnerer motstanderens user_id som eneste peer.
    supabaseMock = buildSupabaseMock([
      {
        data: {
          name: 'Singles-match',
          status: 'active',
          require_peer_approval: true,
          game_mode: 'singles_matchplay',
        },
        error: null,
      },
      { data: { withdrawn_at: null }, error: null }, // WD gate
      { data: [{ user_id: 'side1' }], error: null }, // UPDATE (fresh)
      // game_players for peersForApproval — peersQuery-konstanten bygges (og
      // dequeuer sin mock) FØR Promise.all-en med name/admins:
      {
        data: [
          { user_id: 'side1', flight_number: 1, withdrawn_at: null },
          { user_id: 'side2', flight_number: 2, withdrawn_at: null },
        ],
        error: null,
      },
      { data: { name: 'Side 1-spiller' }, error: null }, // submitter name
      { data: [], error: null }, // admins (ingen her)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'side1' } },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(RedirectError);

    // Motstander (side2) skal ha fått peer_approval_request-varsel.
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'side2', kind: 'peer_approval_request' }),
    );
    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
  });

  it('re-submit: 0 rader oppdatert → ingen notify, ingen mail, men redirect OK', async () => {
    // Phase 4-regresjon: tidligere fyrte vi notify + mail på nytt hver gang
    // submitScorecard ble kalt fordi `.is('submitted_at', null)` returnerer
    // `error == null` selv ved 0 rader endret. Nå sjekker vi
    // `updated.length === 0` og bypasser side-effects på re-submit (double-
    // click eller race med peer-godkjenning).
    supabaseMock = buildSupabaseMock([
      { data: { name: 'Vinter-cup', status: 'active' }, error: null },
      { data: { withdrawn_at: null }, error: null }, // WD gate (#387): not withdrawn
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

// #1453: én-ball-lagformat (greensome m.fl.) — én levering per LAG. Cascaden
// går via admin-client (RLS-flightmate-policyen dekker ikke alle
// flight-konfigurasjoner), authz verifiseres på call-site.
describe('submitScorecard — lag-levering (#1453)', () => {
  it('greensome: én levering markerer hele lagets rader via admin-client', async () => {
    supabaseMock = buildSupabaseMock([
      {
        data: {
          name: 'Cup-dag',
          status: 'active',
          require_peer_approval: false,
          game_mode: 'greensome_matchplay',
        },
        error: null,
      },
      {
        data: { withdrawn_at: null, submitted_at: null, team_number: 1 },
        error: null,
      },
      { data: { name: 'Anders Berg' }, error: null }, // submitter name
      { data: [], error: null }, // admins-liste (tom — ingen mail/varsel)
    ]);
    adminSupabaseMock = buildSupabaseMock([
      // Team-oppdateringen matcher begge lagets rader.
      { data: [{ user_id: 'user-1' }, { user_id: 'mate-2' }], error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');
    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
    const calls = adminSupabaseMock.__fromCalls;
    expect(
      calls.some((c) => c.table === 'game_players' && c.method === 'update'),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.method === 'eq' &&
          c.args[0] === 'team_number' &&
          c.args[1] === 1,
      ),
    ).toBe(true);
    // Trukne og alt-leverte lagkamerater skal ikke røres.
    expect(
      calls.some((c) => c.method === 'is' && c.args[0] === 'withdrawn_at'),
    ).toBe(true);
    expect(
      calls.some((c) => c.method === 'is' && c.args[0] === 'submitted_at'),
    ).toBe(true);
  });

  it('idempotens: innsenderen har alt levert → ingen oppdatering, ingen varsler', async () => {
    supabaseMock = buildSupabaseMock([
      {
        data: {
          name: 'Cup-dag',
          status: 'active',
          require_peer_approval: false,
          game_mode: 'greensome_matchplay',
        },
        error: null,
      },
      {
        data: {
          withdrawn_at: null,
          submitted_at: '2026-08-06T10:00:00Z',
          team_number: 1,
        },
        error: null,
      },
    ]);
    adminSupabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');
    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
    expect(adminSupabaseMock.__fromCalls.length).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
  });
});

// #1466: én levering på hull 18 leverer BEGGE delspillene. En back9-host med
// tournament kaskaderer leveringen til innsenderens front9-søsken (via
// findSegmentSibling + admin-client). Retning kun back9→front9. Kompensert:
// feiler søsken-oppdateringen reverteres back9-markeringen (trap #5).
describe('submitScorecard — én levering på tvers av segmentet (#1466)', () => {
  // findSegmentSibling gjør to admin-queries (alle host-halvdeler + medlemskap)
  // FØR søsken-oppdateringen — begge trekker fra adminSupabaseMock sin FIFO-kø.
  const back9Game = {
    name: 'Cup-dag',
    status: 'active',
    require_peer_approval: false,
    game_mode: 'best_ball',
    hole_segment: 'back9',
    tournament_id: 't1',
    source_game_id: null,
  };

  // #1449 finding 1: findSegmentSibling now fetches ALL segment hosts in the
  // tournament (source + candidates) and day-scopes them. The source (game-1,
  // back9) and its front9 sibling share one tee-off day so the sibling resolves.
  const TEE = '2026-08-07T08:00:00Z';
  const hostRows = (front9Mode: string) => [
    { id: 'game-1', game_mode: 'best_ball', hole_segment: 'back9', scheduled_tee_off_at: TEE, created_at: null },
    { id: 'front9-a', game_mode: front9Mode, hole_segment: 'front9', scheduled_tee_off_at: TEE, created_at: null },
  ];

  it('back9-host: én levering markerer både back9-raden og front9-søskenet (egen-rad)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: back9Game, error: null },
      { data: { withdrawn_at: null, submitted_at: null, team_number: null }, error: null },
      { data: [{ user_id: 'user-1' }], error: null }, // primær UPDATE (back9, egen-rad)
      { data: { name: 'Ola Nordmann' }, error: null }, // submitter name
      { data: [], error: null }, // admins (tom)
    ]);
    adminSupabaseMock = buildSupabaseMock([
      { data: hostRows('best_ball'), error: null }, // findSegmentSibling host-halvdeler (kilde + kandidat)
      { data: [{ game_id: 'front9-a', submitted_at: null, team_number: null }], error: null }, // medlemskap
      { data: [{ user_id: 'user-1' }], error: null }, // søsken-UPDATE (front9, egen-rad)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');
    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(RedirectError);

    // Søsken-oppdateringen fyrte via admin-client mot front9-spillet.
    const calls = adminSupabaseMock.__fromCalls;
    expect(calls.some((c) => c.method === 'update' && c.table === 'game_players')).toBe(true);
    expect(
      calls.some((c) => c.method === 'eq' && c.args[0] === 'game_id' && c.args[1] === 'front9-a'),
    ).toBe(true);
    // Begge spill revalideres.
    expect(revalidateTagMock).toHaveBeenCalledWith('game-front9-a', 'max');
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', 'max');
    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
  });

  it('greensome front9-søsken: lag-bred oppdatering (én-ball-lagformat)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: back9Game, error: null }, // back9-host er best_ball (egen-rad primær)
      { data: { withdrawn_at: null, submitted_at: null, team_number: null }, error: null },
      { data: [{ user_id: 'user-1' }], error: null }, // primær UPDATE (back9)
      { data: { name: 'Ola Nordmann' }, error: null },
      { data: [], error: null },
    ]);
    adminSupabaseMock = buildSupabaseMock([
      { data: hostRows('greensome_matchplay'), error: null }, // host-halvdeler (kilde + kandidat)
      { data: [{ game_id: 'front9-a', submitted_at: null, team_number: 2 }], error: null }, // medlemskap (lag 2)
      { data: [{ user_id: 'user-1' }, { user_id: 'mate' }], error: null }, // lag-bred søsken-UPDATE
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');
    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(RedirectError);

    const calls = adminSupabaseMock.__fromCalls;
    // Lag-bred form: eq team_number=2 + is withdrawn_at + is submitted_at.
    expect(
      calls.some((c) => c.method === 'eq' && c.args[0] === 'team_number' && c.args[1] === 2),
    ).toBe(true);
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'withdrawn_at')).toBe(true);
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'submitted_at')).toBe(true);
    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
  });

  it('kompensert: søsken-oppdateringen feiler → back9-markeringen reverteres, ?error=db', async () => {
    supabaseMock = buildSupabaseMock([
      { data: back9Game, error: null },
      { data: { withdrawn_at: null, submitted_at: null, team_number: null }, error: null },
      { data: [{ user_id: 'user-1' }], error: null }, // primær UPDATE (back9)
    ]);
    adminSupabaseMock = buildSupabaseMock([
      { data: hostRows('best_ball'), error: null }, // host-halvdeler (kilde + kandidat)
      { data: [{ game_id: 'front9-a', submitted_at: null, team_number: null }], error: null }, // medlemskap
      { data: null, error: { message: 'permission denied' } }, // søsken-UPDATE FEILER
      { data: null, error: null }, // revert-UPDATE (kompensasjon)
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');
    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(RedirectError);

    // Kompensasjonen: en update som nuller submitted_at igjen.
    const revert = adminSupabaseMock.__fromCalls.find(
      (c) =>
        c.method === 'update' &&
        (c.args[0] as { submitted_at?: unknown })?.submitted_at === null,
    );
    expect(revert).toBeDefined();
    // Reverten scopes til back9-spillet + de returnerte user_id-ene.
    expect(
      adminSupabaseMock.__fromCalls.some(
        (c) => c.method === 'in' && c.args[0] === 'user_id',
      ),
    ).toBe(true);
    // Fail loudly — ingen side-effekter, redirect til submit-feil.
    expect(lastRedirect()).toBe('/games/game-1/submit?error=db');
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendScorecardSubmittedNotificationMock).not.toHaveBeenCalled();
  });

  it('idempotent: front9-søskenet er alt levert (mySubmittedAt satt) → ingen søsken-oppdatering', async () => {
    supabaseMock = buildSupabaseMock([
      { data: back9Game, error: null },
      { data: { withdrawn_at: null, submitted_at: null, team_number: null }, error: null },
      { data: [{ user_id: 'user-1' }], error: null }, // primær UPDATE (back9)
      { data: { name: 'Ola Nordmann' }, error: null },
      { data: [], error: null },
    ]);
    adminSupabaseMock = buildSupabaseMock([
      { data: hostRows('best_ball'), error: null }, // host-halvdeler (kilde + kandidat)
      // Medlemskap: front9 er ALT levert.
      { data: [{ game_id: 'front9-a', submitted_at: '2026-08-07T09:00:00Z', team_number: null }], error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');
    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(RedirectError);

    // Ingen søsken-oppdatering (kun de to findSegmentSibling-oppslagene).
    expect(
      adminSupabaseMock.__fromCalls.some((c) => c.method === 'update'),
    ).toBe(false);
    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
  });
});

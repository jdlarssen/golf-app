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

// #2203: «alle har levert» has its own suite (organizerNotices.test.ts); here
// it is the boundary, so its reads never touch the admin client's FIFO queue.
const notifyOrganizerIfAllDeliveredMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/notifications/organizerNotices', () => ({
  notifyOrganizerIfAllDelivered: (...args: unknown[]) =>
    notifyOrganizerIfAllDeliveredMock(...args),
}));

// notify() svarer «utenfor appen» som standard (shouldAlsoSendMail: true). En
// levering sender likevel aldri e-post (#2203, eierens svar 2026-10-05).
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

// #2200: the flight rule's read is the boundary here; the rule and the core
// have their own suites.
const loadCardsMock = vi.fn(
  async (..._args: unknown[]) => [] as { userId: string; name: string | null; isGuest: boolean }[],
);
vi.mock('@/lib/games/loadFlightDelivery', () => ({
  loadFlightDeliveryCards: (...args: unknown[]) => loadCardsMock(...args),
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
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
  });

  it('#1918: en som ikke er med i spillet leverer ingenting (not_player)', async () => {
    // Uttrekket til `submitScorecardCore` gjorde `meRow == null` til en egen
    // grunn i stedet for en UPDATE som traff 0 rader og redirectet som suksess.
    // Utfallet på webben er det samme blindsporet — `/games/…` notFound()-er en
    // ikke-deltaker — men nå uten skrivingen og uten «alt levert»-løgnen.
    supabaseMock = buildSupabaseMock([
      { data: { name: 'Vinter-cup', status: 'active' }, error: null },
      { data: null, error: null }, // ingen game_players-rad for denne brukeren
    ]);
    adminSupabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'en-fremmed' } },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(lastRedirect()).toBe('/games/game-1');
    expect(supabaseMock.__fromCalls.some((c) => c.method === 'update')).toBe(
      false,
    );
    expect(adminSupabaseMock.__fromCalls).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
  });

  it('happy path: marks submitted_at, notifies the organiser (no mail), redirects with ?status=submitted', async () => {
    supabaseMock = buildSupabaseMock([
      { data: { name: 'Vinter-cup', status: 'active', created_by: 'org-1' }, error: null },
      { data: { withdrawn_at: null }, error: null }, // WD gate (#387): not withdrawn
      // UPDATE returns the matched row via .select('user_id') — non-empty
      // means this was a fresh submit, so the varsler must fire.
      { data: [{ user_id: 'user-1' }], error: null },
      { data: { name: 'Ola Nordmann' }, error: null }, // submitter name
    ]);
    // #2203: no admin list and no address lookup — the admin client stays untouched.
    adminSupabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });

    const { submitScorecard } = await import('./actions');

    await expect(submitScorecard('game-1')).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
    expect(revalidatePathMock).toHaveBeenCalledWith('/games/game-1');

    // The organiser gets the one varsel; no admin, and no mail.
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'org-1', kind: 'scorecard_submitted' }),
    );
    expect(adminSupabaseMock.__fromCalls).toEqual([]);
    expect(notifyOrganizerIfAllDeliveredMock).toHaveBeenCalledWith('game-1', 'user-1', 'submitScorecard');

    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
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
    // No side effects on a DB error — pre-redirect short-circuit.
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
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
      // dequeuer sin mock) FØR Promise.all-en med navnet:
      {
        data: [
          { user_id: 'side1', flight_number: 1, withdrawn_at: null },
          { user_id: 'side2', flight_number: 2, withdrawn_at: null },
        ],
        error: null,
      },
      { data: { name: 'Side 1-spiller' }, error: null }, // submitter name
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

  it('re-submit: 0 rader oppdatert → ingen varsler, men redirect OK', async () => {
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
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
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
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
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
  /** What every delivery writes (#2200), whichever client writes it. */
  const DELIVERY_PATCH = {
    submitted_at: expect.any(String),
    rejection_reason: null,
    submitted_by_user_id: 'user-1',
    approved_at: null,
    approved_by_user_id: null,
  };

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
    // #2200: service-rollen hopper over vakta og triggerens aktør, så patchen
    // sier selv hvem som leverte, og en levering tar aldri med seg en
    // godkjenning (0191).
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual(DELIVERY_PATCH);
    expect(
      calls.some((c) => c.method === 'eq' && c.args[0] === 'game_id' && c.args[1] === 'front9-a'),
    ).toBe(true);
    // Begge spill revalideres.
    expect(revalidateTagMock).toHaveBeenCalledWith('game-front9-a', { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledWith('game-game-1', { expire: 0 });
    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
  });

  it('greensome front9-søsken: lag-bred oppdatering (én-ball-lagformat)', async () => {
    supabaseMock = buildSupabaseMock([
      { data: back9Game, error: null }, // back9-host er best_ball (egen-rad primær)
      { data: { withdrawn_at: null, submitted_at: null, team_number: null }, error: null },
      { data: [{ user_id: 'user-1' }], error: null }, // primær UPDATE (back9)
      { data: { name: 'Ola Nordmann' }, error: null },
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
    // #2200: lagkaskaden er service-rolle, så leverandøren står i patchen.
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual(DELIVERY_PATCH);
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
    // #2200: godkjenningen går med leveringen. En godkjenning igjen på et
    // ulevert kort kunne senere blitt fullført av en levering (0191).
    expect(revert?.args[0]).toEqual({
      submitted_at: null,
      approved_at: null,
      approved_by_user_id: null,
    });
    // Reverten scopes til back9-spillet + de returnerte user_id-ene.
    expect(
      adminSupabaseMock.__fromCalls.some(
        (c) => c.method === 'in' && c.args[0] === 'user_id',
      ),
    ).toBe(true);
    // Fail loudly — ingen side-effekter, redirect til submit-feil.
    expect(lastRedirect()).toBe('/games/game-1/submit?error=db');
    expect(notifyMock).not.toHaveBeenCalled();
    expect(notifyOrganizerIfAllDeliveredMock).not.toHaveBeenCalled();
  });

  it('idempotent: front9-søskenet er alt levert (mySubmittedAt satt) → ingen søsken-oppdatering', async () => {
    supabaseMock = buildSupabaseMock([
      { data: back9Game, error: null },
      { data: { withdrawn_at: null, submitted_at: null, team_number: null }, error: null },
      { data: [{ user_id: 'user-1' }], error: null }, // primær UPDATE (back9)
      { data: { name: 'Ola Nordmann' }, error: null },
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

describe('submitScorecard — levering for flighten (#2200)', () => {
  it('sender skjemaets alsoFor videre til kjernen, som leverer makkeren i samme skriving', async () => {
    loadCardsMock.mockResolvedValueOnce([{ userId: 'ola', name: 'Ola', isGuest: false }]);
    supabaseMock = buildSupabaseMock([
      {
        data: {
          name: 'Vinter-cup',
          status: 'active',
          require_peer_approval: false,
          game_mode: 'stableford',
          hole_segment: 'full',
          tournament_id: null,
          source_game_id: null,
        },
        error: null,
      },
      { data: { withdrawn_at: null, submitted_at: null, team_number: null }, error: null },
      { data: [{ user_id: 'user-1' }, { user_id: 'ola' }], error: null },
      { data: { name: 'Kari' }, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    const form = new FormData();
    form.append('alsoFor', 'ola');

    const { submitScorecard } = await import('./actions');
    await expect(submitScorecard('game-1', form)).rejects.toBeInstanceOf(RedirectError);

    expect(loadCardsMock).toHaveBeenCalledWith('game-1', 'user-1', expect.anything());
    const inCall = supabaseMock.__fromCalls.find(
      (c) => c.method === 'in' && c.args[0] === 'user_id',
    );
    expect(inCall?.args[1]).toEqual(['user-1', 'ola']);
    expect(lastRedirect()).toBe('/games/game-1?status=submitted');
  });

  it('leverte serveren færre makkerkort enn skjemaet ba om, sier kvitteringen det', async () => {
    // The page offered Ola and Per, but by now only Ola passes the rule
    // (Per keyed a hole himself in the meantime). The receipt must not read
    // as if every card went.
    loadCardsMock.mockResolvedValueOnce([{ userId: 'ola', name: 'Ola', isGuest: false }]);
    supabaseMock = buildSupabaseMock([
      {
        data: {
          name: 'Vinter-cup',
          status: 'active',
          require_peer_approval: false,
          game_mode: 'stableford',
          hole_segment: 'full',
          tournament_id: null,
          source_game_id: null,
        },
        error: null,
      },
      { data: { withdrawn_at: null, submitted_at: null, team_number: null }, error: null },
      { data: [{ user_id: 'user-1' }, { user_id: 'ola' }], error: null },
      { data: { name: 'Kari' }, error: null },
    ]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    });
    const form = new FormData();
    form.append('alsoFor', 'ola');
    form.append('alsoFor', 'per');

    const { submitScorecard } = await import('./actions');
    await expect(submitScorecard('game-1', form)).rejects.toBeInstanceOf(RedirectError);

    expect(lastRedirect()).toBe('/games/game-1?status=submitted_partial');
  });
});

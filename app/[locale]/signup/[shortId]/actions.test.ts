import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * Unit-tester for selv-påmeldings-server-actions (#199 chunks 6+7).
 * Verifiserer:
 *  - Honeypot short-circuit (success uten DB-write)
 *  - Auth-redirect for uautenticerte
 *  - Wrong registration_mode → wrong_mode-error
 *  - Wrong status (active/finished) → game_locked
 *  - UNIQUE-conflict → vennlig duplicate-melding
 *  - Success path → notify + revalidateTag fyrer
 *  - Lag-only registration_type → team_not_supported_yet placeholder
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string } | string) => redirectMock(arg),
}));

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

const notifyMock = vi.fn<(...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>>(
  async () => ({ shouldAlsoSendMail: false }),
);
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

let serverMock: ReturnType<typeof buildSupabaseMock>;
let adminMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => serverMock,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

// getGameByShortId bruker admin-client internt — mock returnerer en
// snapshot vi kontrollerer per test. Vi mock-er helperen direkte fordi det
// gjør test-arrangement enklere enn å presse en games-rad gjennom mock-køen.
const getGameByShortIdMock = vi.fn();
vi.mock('@/lib/games/getGameByShortId', () => ({
  getGameByShortId: (shortId: string) => getGameByShortIdMock(shortId),
}));

// Rate-limit + IP-lookup mock-es som no-op default-«ok». Per-test kan vi
// styre returverdien via consumeRateLimitMock for å teste rate_limited-grenen.
const consumeRateLimitMock = vi.fn<(...args: unknown[]) => Promise<{ ok: true }>>(
  async () => ({ ok: true as const }),
);
vi.mock('@/lib/auth/registrationRateLimit', () => ({
  consumeRegistrationRateLimit: (...args: unknown[]) =>
    consumeRateLimitMock(...args),
}));
vi.mock('@/lib/admin/rateLimit', () => ({
  getClientIp: async () => '127.0.0.1',
}));

// Mail-helper mock-es som no-op — mail-sending er best-effort i selve action,
// vi tester mail-template-en i sin egen test-suite.
const sendRegistrationRequestMailMock = vi.fn<(...args: unknown[]) => Promise<void>>(
  async () => {},
);
vi.mock('@/lib/mail/registrationRequest', () => ({
  sendRegistrationRequestMail: (...args: unknown[]) =>
    sendRegistrationRequestMailMock(...args),
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const GAME_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_USER_ID = '33333333-3333-3333-3333-333333333333';
const SHORT_ID = 'abc12345';

/**
 * Sett opp serverMock med getUser + profile-lookup pre-staged. profile-lookup
 * leses fra serverClient (cookie-basert) av `requireAuthedUser`. Hver test
 * skal kalle denne FØR de stiller opp adminMock så queue-rekkefølgen blir
 * deterministisk per side.
 */
function authedAsUser(opts: { profileCompleted?: boolean } = {}): void {
  const { profileCompleted = true } = opts;
  serverMock = buildSupabaseMock([
    {
      data: profileCompleted
        ? { profile_completed_at: '2026-01-01T00:00:00Z' }
        : { profile_completed_at: null },
      error: null,
    },
  ]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id: USER_ID, email: 'spiller@example.com' } },
  });
}

function unauthed(): void {
  serverMock = buildSupabaseMock([]);
  (serverMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: null },
  });
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
}

function makeGame(overrides: Record<string, unknown> = {}) {
  return {
    id: GAME_ID,
    name: 'Sommercup 2026',
    short_id: SHORT_ID,
    status: 'scheduled',
    registration_mode: 'open',
    registration_type: 'solo',
    game_mode: 'stableford',
    course_id: 'course-id',
    scheduled_tee_off_at: null,
    created_by: ADMIN_USER_ID,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock = buildSupabaseMock([]);
  adminMock = buildSupabaseMock([]);
});

describe('registerForOpenGame', () => {
  it('honeypot trigger → returnerer ok uten DB-write', async () => {
    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(
      fd({ shortId: SHORT_ID, website: 'http://bot.example' }),
    );

    expect(result).toEqual({ ok: true });
    expect(getGameByShortIdMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('uautentisert → redirect /login med next-param', async () => {
    unauthed();
    const { registerForOpenGame } = await import('./actions');

    await expect(
      registerForOpenGame(fd({ shortId: SHORT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/login?next=/signup/${SHORT_ID}` }),
    );
  });

  it('feil registration_mode → wrong_mode-error', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'manual_approval' }),
    );

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'wrong_mode' });
  });

  it('aktiv status → game_locked-error', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(makeGame({ status: 'active' }));

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'game_locked' });
  });

  it('team-only registration_type → placeholder-error', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_type: 'team' }),
    );

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'team_not_supported_yet' });
  });

  // ── #1792: solo-bakdøren for 'both' (HCD F5) ───────────────────────────────
  // Signup-siden viser KUN lag-skjemaet for both+lagmodus (alle slots påkrevd),
  // men action-en slapp solo-POST forbi fordi gaten bare sjekket === 'team'.
  // Gaten skal speile resolveRegistrationTypeView: alt annet enn solo_form
  // avvises.

  it('#1792: both + lagmodus (best_ball) → solo-POST avvises', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_type: 'both', game_mode: 'best_ball' }),
    );

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'team_not_supported_yet' });
  });

  it('#1792: both + solo-modus (stableford) → fortsatt tillatt (solo_form er eneste inngang)', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      { data: null, error: null }, // insert
      { data: { name: 'Per', nickname: null, email: 'per@x.no' }, error: null }, // notify lookup
    ]);
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_type: 'both' }), // stableford default
    );

    const { registerForOpenGame } = await import('./actions');
    await expect(
      registerForOpenGame(fd({ shortId: SHORT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/games/${GAME_ID}` }),
    );
  });

  it('UNIQUE-conflict (23505) → already_registered-error', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // game_players insert — UNIQUE-violation
      { data: null, error: { code: '23505', message: 'duplicate key' } },
    ]);
    getGameByShortIdMock.mockResolvedValue(makeGame());

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'already_registered' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('vellykket open-påmelding → INSERT + revalidateTag + notify + redirect', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // 1) game_players insert
      { data: null, error: null },
      // 2) users lookup for requesterName i notify
      {
        data: { name: 'Per Spiller', nickname: null, email: 'per@example.com' },
        error: null,
      },
    ]);
    getGameByShortIdMock.mockResolvedValue(makeGame());

    const { registerForOpenGame } = await import('./actions');

    await expect(
      registerForOpenGame(fd({ shortId: SHORT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/games/${GAME_ID}` }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ADMIN_USER_ID,
        kind: 'registration_request',
        payload: expect.objectContaining({
          game_id: GAME_ID,
          game_name: 'Sommercup 2026',
          requester_name: 'Per Spiller',
        }),
      }),
    );
    // Stableford has no cap: the direct INSERT path, no seat claim.
    expect(adminMock.__rpcCalls).toEqual([]);
    // request_id skal IKKE være satt for open-modus.
    const notifyArgs = notifyMock.mock.calls[0]?.[0] as
      | { payload: { request_id?: string } }
      | undefined;
    expect(notifyArgs?.payload.request_id).toBeUndefined();
  });

  it('ugyldig shortId-format → game_not_found uten DB-call', async () => {
    authedAsUser();
    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: 'INVALID!' }));

    expect(result).toEqual({ ok: false, error: 'game_not_found' });
    expect(getGameByShortIdMock).not.toHaveBeenCalled();
  });

  // ── matchplay side-valg (#544) ──────────────────────────────────────────

  it('matchplay uten side-felt → bad_side', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
      }),
    );
    // admin-mock trenger ingen queue-entries siden vi returnerer tidlig
    adminMock = buildSupabaseMock([]);

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));
    expect(result).toEqual({ ok: false, error: 'bad_side' });
  });

  it('matchplay med ugyldig side (3) → bad_side', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
      }),
    );
    adminMock = buildSupabaseMock([]);

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID, side: '3' }));
    expect(result).toEqual({ ok: false, error: 'bad_side' });
  });

  it('matchplay side 2 full → side_full', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
      }),
    );
    // admin-mock: kapasitets-count-query returnerer count=1 (full for teamSize=1)
    adminMock = buildSupabaseMock([{ data: null, error: null }]);
    // Supabase count-query: builder-proxy returnerer { count: 1, error: null }
    // via select(..., { count: 'exact', head: true })
    // Vi overrider ved å bygge en custom mock for dette.
    const countBuilder = {
      select: () => countBuilder,
      eq: () => countBuilder,
      is: () => countBuilder,
      then: (onFulfilled?: (v: unknown) => unknown) =>
        Promise.resolve({ count: 1, error: null }).then(onFulfilled),
    };
    (adminMock.from as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      countBuilder,
    );

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(
      fd({ shortId: SHORT_ID, side: '2' }),
    );
    expect(result).toEqual({ ok: false, error: 'side_full' });
  });

  it('matchplay vellykket påmelding med side=2 → INSERT med team_number=2 + redirect', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
      }),
    );

    // buildSupabaseMock FIFO-kø for alle 4 DB-kall (thenable-terminering):
    //   1) side-count (count=0, plass ledig) — awaited via .then()
    //   2) game_players insert — awaited via .then()
    //   3) race guard SELECT: current user er blant vinnerne (side=2, teamSize=1)
    //   4) users lookup for notify-name — maybeSingle()
    adminMock = buildSupabaseMock([
      { data: null, error: null, count: 0 } as { data: null; error: null; count: number }, // 1) count=0
      { data: null, error: null },                                                            // 2) insert
      {
        // 3) race guard SELECT: user is the only (and thus first) row → vinner
        data: [{ user_id: USER_ID, accepted_at: '2026-06-11T10:00:00Z' }],
        error: null,
      },
      { data: { name: 'Kari', nickname: null, email: 'kari@x.no' }, error: null },          // 4) users
    ]);

    const { registerForOpenGame } = await import('./actions');
    await expect(
      registerForOpenGame(fd({ shortId: SHORT_ID, side: '2' })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/games/${GAME_ID}` }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');

    // SF-3: verifiser insert-payload direkte via __fromCalls
    const insertCall = adminMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'insert',
    );
    expect(insertCall).toBeDefined();
    expect(insertCall!.args[0]).toMatchObject({
      team_number: 2,
      flight_number: 2,
    });
  });

  it('matchplay race guard: taper (ikke i vinnersett) → slett egen rad + side_full', async () => {
    // Scenario: to samtidige påmeldinger til singles side 1 (teamSize=1).
    // Begge passerer pre-insert-telling (0<1), begge inserter. Race guard
    // SELECT returnerer to rader; vinneren er 'winner-id' (accepted_at eldre).
    // Current user (USER_ID) er IKKE blant de første teamSize=1 radene → taper.
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
      }),
    );
    adminMock = buildSupabaseMock([
      { data: null, error: null, count: 0 } as { data: null; error: null; count: number }, // 1) count=0
      { data: null, error: null },                                                            // 2) insert
      {
        // 3) race guard SELECT: 2 rader, vinneren er 'winner-id' (eldre accepted_at)
        data: [
          { user_id: 'winner-id', accepted_at: '2026-06-11T09:59:59Z' },
          { user_id: USER_ID, accepted_at: '2026-06-11T10:00:00Z' },
        ],
        error: null,
      },
      { data: null, error: null }, // 4) delete own row
    ]);

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID, side: '1' }));
    expect(result).toEqual({ ok: false, error: 'side_full' });

    // Bekreft at delete ble kalt for current user
    const deleteCall = adminMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'delete',
    );
    expect(deleteCall).toBeDefined();
  });

  it('matchplay race guard: vinner (i vinnersett tross overbooking) → beholder rad og redirecter', async () => {
    // Scenario: race guard SELECT returnerer 2 rader (overbooket), men current
    // user er BLANT de første teamSize=1 radene → vinner, ingen slett.
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
      }),
    );
    adminMock = buildSupabaseMock([
      { data: null, error: null, count: 0 } as { data: null; error: null; count: number }, // 1) count=0
      { data: null, error: null },                                                            // 2) insert
      {
        // 3) race guard SELECT: current user er den FØRSTE (eldre accepted_at) → vinner
        data: [
          { user_id: USER_ID, accepted_at: '2026-06-11T09:59:59Z' },
          { user_id: 'late-id', accepted_at: '2026-06-11T10:00:00Z' },
        ],
        error: null,
      },
      { data: { name: 'Kari', nickname: null, email: 'kari@x.no' }, error: null }, // 4) users
    ]);

    const { registerForOpenGame } = await import('./actions');
    await expect(
      registerForOpenGame(fd({ shortId: SHORT_ID, side: '1' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/games/${GAME_ID}` }),
    );

    // Ingen delete-kall
    const deleteCall = adminMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'delete',
    );
    expect(deleteCall).toBeUndefined();
  });

  it('stableford (ikke matchplay) ignorerer side-felt — insert med null/null', async () => {
    // Regresjonstest: non-matchplay insert er uendret.
    authedAsUser();
    adminMock = buildSupabaseMock([
      { data: null, error: null }, // insert
      { data: { name: 'Per', nickname: null, email: 'per@x.no' }, error: null }, // notify lookup
    ]);
    getGameByShortIdMock.mockResolvedValue(makeGame()); // stableford default

    const { registerForOpenGame } = await import('./actions');
    await expect(
      registerForOpenGame(fd({ shortId: SHORT_ID, side: '1' })), // side ignoreres
    ).rejects.toBeInstanceOf(RedirectError);

    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/games/${GAME_ID}` }),
    );

    // SF-3 regresjonstest: non-matchplay insert har team_number=null, flight_number=null
    const insertCall = adminMock.__fromCalls.find(
      (c) => c.table === 'game_players' && c.method === 'insert',
    );
    expect(insertCall).toBeDefined();
    expect(insertCall!.args[0]).toMatchObject({
      team_number: null,
      flight_number: null,
    });
  });

  // ── eksakt-antall-format cap (#661) ────────────────────────────────────────

  // ── player cap (#661, #2011) → claim_open_registration_seat (#2060/#2062) ──
  // The seat count and the INSERT are one RPC. These tests pin what the action
  // hands the database — the cap number, the seat team size, a solo claim — and
  // how each outcome maps to the action's error. The counting itself is tested
  // against a real database in supabase/tests/open_registration_seat_claim_test.sql.
  // registration_type stays 'solo' (the makeGame default): a team mode with
  // 'team'/'both' is turned away by team_not_supported_yet before the cap.

  const notifyLookup = {
    data: { name: 'Kari', nickname: null, email: 'kari@example.com' },
    error: null,
  };

  /** Admin client whose seat claim answers `claim` (or fails with `rpcError`). */
  function claimAdmin(claim: unknown, rpcError?: unknown) {
    return buildSupabaseMock(
      [notifyLookup],
      { claim_open_registration_seat: claim },
      rpcError ? { rpcErrors: { claim_open_registration_seat: rpcError } } : {},
    );
  }

  function claimParams(): Record<string, unknown> | undefined {
    return adminMock.__rpcCalls.find((c) => c.name === 'claim_open_registration_seat')
      ?.params as Record<string, unknown> | undefined;
  }

  function gamePlayersCalls() {
    return adminMock.__fromCalls.filter((c) => c.table === 'game_players');
  }

  it.each([
    ['wolf', { kind: 'wolf', team_size: 1, teams_count: 5, wolf_scoring: 'net' }, 5, 1],
    ['nines', { kind: 'nines', team_size: 1, nines_variant: 'nines', nines_scoring: 'net' }, 3, 1],
    ['skins', { kind: 'skins', team_size: 1, skins_scoring: 'net' }, 16, 1],
    ['best_ball', { kind: 'best_ball', team_size: 2, teams_count: 4 }, 8, 2],
  ] as const)(
    '%s: fullt spill → game_full; kravet fikk taket og lagstørrelsen, ingen direkte INSERT',
    async (mode, modeConfig, cap, seatTeamSize) => {
      authedAsUser();
      getGameByShortIdMock.mockResolvedValue(
        makeGame({ game_mode: mode, mode_config: modeConfig }),
      );
      adminMock = claimAdmin({ outcome: 'game_full', team_number: null });

      const { registerForOpenGame } = await import('./actions');
      const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

      expect(result).toEqual({ ok: false, error: 'game_full' });
      expect(claimParams()).toMatchObject({
        p_game_id: GAME_ID,
        p_user_id: USER_ID,
        p_cap: cap,
        p_seat_team_size: seatTeamSize,
        p_max_teams: 4,
      });
      // A solo claim: one seat, no team number.
      expect(claimParams()).not.toHaveProperty('p_new_team_size');
      expect(gamePlayersCalls()).toEqual([]);
      expect(revalidateTagMock).not.toHaveBeenCalled();
    },
  );

  it('#2011: texas à 3 med plass — kravet går gjennom → revalidate + notify + redirect', async () => {
    // Negative control: the cap reads team_size from mode_config (3 → 12), and a
    // claimed seat takes the same tail as a direct INSERT.
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        game_mode: 'texas_scramble',
        mode_config: {
          kind: 'texas_scramble',
          team_size: 3,
          teams_count: 3,
          team_handicap_pct: 15,
        },
      }),
    );
    adminMock = claimAdmin({ outcome: 'ok', team_number: null });

    const { registerForOpenGame } = await import('./actions');
    await expect(
      registerForOpenGame(fd({ shortId: SHORT_ID })),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(claimParams()).toMatchObject({ p_cap: 12, p_seat_team_size: 3 });
    expect(redirectMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: `/games/${GAME_ID}` }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ADMIN_USER_ID, kind: 'registration_request' }),
    );
    // The RPC wrote the row; the action must not insert a second time.
    expect(gamePlayersCalls()).toEqual([]);
  });

  it('allerede på lista (already_on_roster) → already_registered', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ game_mode: 'wolf', mode_config: { kind: 'wolf', team_size: 1 } }),
    );
    adminMock = claimAdmin({ outcome: 'already_on_roster', team_number: null });

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'already_registered' });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('spillet ble låst mellom sjekken og kravet → game_locked', async () => {
    // The claim re-checks status under the game lock; its answer wins over the
    // action's earlier read.
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ game_mode: 'wolf', mode_config: { kind: 'wolf', team_size: 1 } }),
    );
    adminMock = claimAdmin({ outcome: 'game_locked', team_number: null });

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'game_locked' });
  });

  it('kravet feiler i databasen → db_error, ingen fail-open INSERT', async () => {
    // Before #2060 a failed count fell through to the INSERT. The count and the
    // INSERT are one call now, so a failure leaves nothing to fall back to.
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ game_mode: 'wolf', mode_config: { kind: 'wolf', team_size: 1 } }),
    );
    adminMock = claimAdmin(null, { message: 'AbortError: This operation was aborted' });

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(gamePlayersCalls()).toEqual([]);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('ukjent svar fra kravet → db_error, aldri stille suksess', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ game_mode: 'wolf', mode_config: { kind: 'wolf', team_size: 1 } }),
    );
    adminMock = claimAdmin(null);

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('requestApproval', () => {
  it('honeypot trigger → returnerer ok uten DB-write', async () => {
    const { requestApproval } = await import('./actions');
    const result = await requestApproval(
      fd({ shortId: SHORT_ID, website: 'http://bot.example' }),
    );

    expect(result).toEqual({ ok: true });
    expect(getGameByShortIdMock).not.toHaveBeenCalled();
  });

  it('message > 200 tegn → message_too_long', async () => {
    const { requestApproval } = await import('./actions');
    const longMessage = 'a'.repeat(201);
    const result = await requestApproval(
      fd({ shortId: SHORT_ID, message: longMessage }),
    );

    expect(result).toEqual({ ok: false, error: 'message_too_long' });
  });

  it('feil registration_mode (open i stedet for manual_approval) → wrong_mode', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'open' }),
    );

    const { requestApproval } = await import('./actions');
    const result = await requestApproval(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'wrong_mode' });
  });

  it('#1792: both + lagmodus (best_ball) → forespørsel avvises (samme gate som open)', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'manual_approval',
        registration_type: 'both',
        game_mode: 'best_ball',
      }),
    );

    const { requestApproval } = await import('./actions');
    const result = await requestApproval(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'team_not_supported_yet' });
  });

  it('duplikat-request → already_requested', async () => {
    authedAsUser();
    adminMock = buildSupabaseMock([
      // insert med UNIQUE-violation
      {
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      },
    ]);
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'manual_approval' }),
    );

    const { requestApproval } = await import('./actions');
    const result = await requestApproval(
      fd({ shortId: SHORT_ID, message: 'Slipp meg inn' }),
    );

    expect(result).toEqual({ ok: false, error: 'already_requested' });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('vellykket manual_approval-request → INSERT + revalidateTag + notify med request_id', async () => {
    authedAsUser();
    const requestId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    adminMock = buildSupabaseMock([
      // 1) insert request — single() returnerer id
      { data: { id: requestId }, error: null },
      // 2) users lookup for requesterName
      {
        data: { name: 'Kari Spiller', nickname: 'Karen', email: 'kari@x.no' },
        error: null,
      },
    ]);
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'manual_approval' }),
    );

    const { requestApproval } = await import('./actions');
    const result = await requestApproval(
      fd({ shortId: SHORT_ID, message: 'Slipp meg inn, takk' }),
    );

    expect(result).toEqual({ ok: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ADMIN_USER_ID,
        kind: 'registration_request',
        payload: expect.objectContaining({
          game_id: GAME_ID,
          game_name: 'Sommercup 2026',
          requester_name: 'Kari Spiller «Karen»',
          request_id: requestId,
          message: 'Slipp meg inn, takk',
        }),
      }),
    );
  });

  it('uten message → notify-payload utelater message-feltet', async () => {
    authedAsUser();
    const requestId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    adminMock = buildSupabaseMock([
      { data: { id: requestId }, error: null },
      { data: { name: 'Anon', nickname: null, email: 'a@x.no' }, error: null },
    ]);
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'manual_approval' }),
    );

    const { requestApproval } = await import('./actions');
    const result = await requestApproval(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: true });
    const notifyArgs = notifyMock.mock.calls[0]?.[0] as
      | { payload: { message?: string } }
      | undefined;
    expect(notifyArgs?.payload.message).toBeUndefined();
  });

  it('invite_only godtar forespørsel → INSERT + notify (#368)', async () => {
    // invite_only er en blindvei uten dette: noen med lenken kan nå banke på.
    authedAsUser();
    const requestId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    adminMock = buildSupabaseMock([
      { data: { id: requestId }, error: null },
      { data: { name: 'Per Banker', nickname: null, email: 'per@x.no' }, error: null },
    ]);
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'invite_only' }),
    );

    const { requestApproval } = await import('./actions');
    const result = await requestApproval(
      fd({ shortId: SHORT_ID, message: 'Håper det er plass!' }),
    );

    expect(result).toEqual({ ok: true });
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, 'max');
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ADMIN_USER_ID,
        kind: 'registration_request',
        payload: expect.objectContaining({ request_id: requestId }),
      }),
    );
  });

  // ── #543: steng påmelding ──────────────────────────────────────────────────

  it('signups_closed_at satt → signup_closed-error (#543)', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'manual_approval',
        signups_closed_at: '2026-06-11T12:00:00Z',
      }),
    );

    const { requestApproval } = await import('./actions');
    const result = await requestApproval(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'signup_closed' });
    expect(adminMock.from).not.toHaveBeenCalled();
  });
});

// ─── #543 registerForOpenGame — steng påmelding ───────────────────────────────

describe('registerForOpenGame — signup_closed guard (#543)', () => {
  it('signups_closed_at satt → signup_closed-error', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ signups_closed_at: '2026-06-11T12:00:00Z' }),
    );
    adminMock = buildSupabaseMock([]);

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    expect(result).toEqual({ ok: false, error: 'signup_closed' });
  });

  it('signups_closed_at null → ikke signup_closed (går videre i flyten)', async () => {
    authedAsUser();
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ signups_closed_at: null }),
    );
    // Må stille opp nok mock-data for at INSERT-path kaller videre.
    // Vi lar insert returnere en UNIQUE-conflict slik at testen stopper tidlig
    // men vi kan verifisere at signup_closed IKKE ble returnert.
    adminMock = buildSupabaseMock([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
    ]);

    const { registerForOpenGame } = await import('./actions');
    const result = await registerForOpenGame(fd({ shortId: SHORT_ID }));

    // Flyten gikk forbi signup_closed-guarden — fikk already_registered i stedet.
    expect(result).toEqual({ ok: false, error: 'already_registered' });
  });
});

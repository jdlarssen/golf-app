import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
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

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
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
      `/login?next=/signup/${SHORT_ID}`,
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

    expect(redirectMock).toHaveBeenCalledWith(`/games/${GAME_ID}`);
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

    expect(redirectMock).toHaveBeenCalledWith(`/games/${GAME_ID}`);
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
    expect(redirectMock).toHaveBeenCalledWith(`/games/${GAME_ID}`);

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

    expect(redirectMock).toHaveBeenCalledWith(`/games/${GAME_ID}`);

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

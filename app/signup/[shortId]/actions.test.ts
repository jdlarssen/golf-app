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

const notifyMock = vi.fn(async () => ({ shouldAlsoSendMail: false }));
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
const consumeRateLimitMock = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/lib/auth/registrationRateLimit', () => ({
  consumeRegistrationRateLimit: (...args: unknown[]) =>
    consumeRateLimitMock(...args),
}));
vi.mock('@/lib/admin/rateLimit', () => ({
  getClientIp: async () => '127.0.0.1',
}));

// Mail-helper mock-es som no-op — mail-sending er best-effort i selve action,
// vi tester mail-template-en i sin egen test-suite.
const sendRegistrationRequestMailMock = vi.fn(async () => {});
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
});

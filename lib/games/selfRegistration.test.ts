// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { SignupViewerFacts } from './loadSignupFacts';
import { signupOffer, type SignupFacts } from './signupOffer';
import { SIGNUP_FACTS_MATRIX_ROWS, signupFactsMatrix } from './testing/signupFactsMatrix';

/**
 * Type A (#2748): the writes behind the signup page and the app's route. The web
 * action's own suite (`actions.test.ts`) stands unchanged; here stands what the
 * move adds: the page and the write agree on every row of the facts matrix, no
 * write without a row back, and the gates a route needs that the action's
 * redirects used to cover.
 */

vi.mock('@/lib/games/joinTeeGenders');
vi.mock('@/lib/games/loadSignupFacts');

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => adminMock }));

const getGameByShortIdMock = vi.fn();
vi.mock('@/lib/games/getGameByShortId', () => ({
  getGameByShortId: (shortId: string) => getGameByShortIdMock(shortId),
}));

const consumeRateLimitMock = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; error?: string }>>(
  async () => ({ ok: true }),
);
vi.mock('@/lib/auth/registrationRateLimit', () => ({
  consumeRegistrationRateLimit: (...args: unknown[]) => consumeRateLimitMock(...args),
}));

const notifyMock = vi.fn<(...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>>(
  async () => ({ shouldAlsoSendMail: false }),
);
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

const sendMailMock = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
vi.mock('@/lib/mail/registrationRequest', () => ({
  sendRegistrationRequestMail: (...args: unknown[]) => sendMailMock(...args),
}));

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

import { joinTeeGenders } from './joinTeeGenders';
import { loadSignupFacts } from './loadSignupFacts';
import { registerForOpenGameCore, requestApprovalCore, withdrawRequestCore } from './selfRegistration';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const GAME_ID = '22222222-2222-4222-8222-222222222222';
const ORGANISER = '33333333-3333-4333-8333-333333333333';
const SHORT_ID = 'abc12345';
const IP = '203.0.113.7';

const REGISTER = { shortId: SHORT_ID, userId: USER_ID, ip: IP, side: null, src: null };
const REQUEST = { shortId: SHORT_ID, userId: USER_ID, ip: IP, message: null };

const NO_LINK: SignupViewerFacts = {
  profileCompleted: true,
  isAlreadyRegistered: false,
  requestView: 'none',
  hasPendingInvitation: false,
  isClubMember: false,
  viewerIsFriend: false,
  ownRequestCancellable: false,
  isFull: false,
  seats: null,
};

function makeGame(over: Record<string, unknown> = {}) {
  return {
    id: GAME_ID,
    name: 'Sommercup 2026',
    short_id: SHORT_ID,
    status: 'scheduled',
    registration_mode: 'open',
    registration_type: 'solo',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1 },
    group_id: null,
    created_by: ORGANISER,
    let_friends_skip_gate: false,
    signups_closed_at: null,
    ...over,
  };
}

const PLAYER_ROW = { data: [{ user_id: USER_ID }], error: null };
const REQUEST_ROW = { data: { id: 'request-1' }, error: null };

/** A database that takes the write: one row back, whichever way it goes. */
function writableAdmin() {
  return buildSupabaseMock([], { claim_open_registration_seat: { outcome: 'ok' } }, {
    byTable: { game_players: [PLAYER_ROW], game_registration_requests: [REQUEST_ROW] },
  });
}

function wrote(admin: ReturnType<typeof buildSupabaseMock>): boolean {
  return (
    admin.__rpcCalls.length > 0 ||
    admin.__fromCalls.some((call: { method: string }) => call.method === 'insert')
  );
}

function withFacts(facts: SignupFacts): void {
  const { game, ...viewer } = facts;
  getGameByShortIdMock.mockResolvedValue(makeGame(game));
  vi.mocked(loadSignupFacts).mockResolvedValue({
    ...NO_LINK,
    ...viewer,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock = writableAdmin();
  getGameByShortIdMock.mockResolvedValue(makeGame());
  vi.mocked(loadSignupFacts).mockResolvedValue(NO_LINK);
  consumeRateLimitMock.mockResolvedValue({ ok: true });
  notifyMock.mockResolvedValue({ shouldAlsoSendMail: false });
  sendMailMock.mockResolvedValue(undefined);
});

describe('the page and the writes agree (AK 36)', () => {
  it('join passes the register core, request the request core, everything else neither', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rows = 0;
    const offers: Record<string, number> = {};
    for (const facts of signupFactsMatrix()) {
      rows += 1;
      const offer = signupOffer(facts);
      offers[offer] = (offers[offer] ?? 0) + 1;
      withFacts(facts);

      adminMock = writableAdmin();
      const register = await registerForOpenGameCore(REGISTER);
      const registerWrote = wrote(adminMock);

      adminMock = writableAdmin();
      const request = await requestApprovalCore(REQUEST);
      const requestWrote = wrote(adminMock);

      const seen = { register: register.ok, registerWrote, request: request.ok, requestWrote };
      const expected = {
        register: offer === 'join',
        registerWrote: offer === 'join',
        request: offer === 'request',
        requestWrote: offer === 'request',
      };
      if (JSON.stringify(seen) !== JSON.stringify(expected)) {
        expect.fail(`${JSON.stringify(facts)} → ${offer}: ${JSON.stringify(seen)}`);
      }
    }
    expect(rows).toBe(SIGNUP_FACTS_MATRIX_ROWS);
    // The matrix has to reach all seven, or it proves less than it looks.
    expect(Object.keys(offers).sort()).toEqual(
      ['closed', 'in_game', 'join', 'locked', 'pending', 'request', 'web'].sort(),
    );
    spy.mockRestore();
  }, 120_000);
});

describe('the side choice stays the website\'s', () => {
  const matchplay = { game_mode: 'singles_matchplay', mode_config: { kind: 'singles_matchplay', team_size: 1 } };

  it('without a side matchplay stops, with nothing written', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame(matchplay));
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'bad_side' });
    expect(wrote(adminMock)).toBe(false);
  });

  it('with a side the row gets it', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame(matchplay));
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        game_players: [
          { data: null, error: null, count: 0 } as never,
          PLAYER_ROW,
          { data: [{ user_id: USER_ID, accepted_at: 'now' }], error: null },
        ],
      },
    });
    await expect(registerForOpenGameCore({ ...REGISTER, side: 2 })).resolves.toEqual({
      ok: true,
      gameId: GAME_ID,
    });
    const insert = adminMock.__fromCalls.find((c: { method: string }) => c.method === 'insert');
    expect(insert?.args[0]).toMatchObject({ team_number: 2, flight_number: 2 });
  });

  it('a request on matchplay has no side (AK 46)', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ ...matchplay, registration_mode: 'manual_approval' }));
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: true });
    const insert = adminMock.__fromCalls.find((c: { method: string }) => c.method === 'insert');
    expect(insert?.table).toBe('game_registration_requests');
    expect(insert?.args[0]).not.toHaveProperty('team_number');
  });
});

describe('gates the action\'s redirects used to cover', () => {
  it('an unfinished profile stops both, with nothing written (AK 44)', async () => {
    vi.mocked(loadSignupFacts).mockResolvedValue({ ...NO_LINK, profileCompleted: false });
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'profile_incomplete' });
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'profile_incomplete' });
    expect(wrote(adminMock)).toBe(false);
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['draft', makeGame({ status: 'draft' })],
  ])('%s round answers game_not_found and reads nothing about the player', async (_name, game) => {
    getGameByShortIdMock.mockResolvedValue(game);
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'game_not_found' });
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'game_not_found' });
    expect(loadSignupFacts).not.toHaveBeenCalled();
  });

  it('the core checks the length of a message itself', async () => {
    const result = await requestApprovalCore({ ...REQUEST, message: 'a'.repeat(201) });
    expect(result).toEqual({ ok: false, error: 'message_too_long' });
    expect(getGameByShortIdMock).not.toHaveBeenCalled();
  });

  it('a message of exactly the limit, trimmed, goes through', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    const message = 'a'.repeat(200);
    await expect(requestApprovalCore({ ...REQUEST, message: `  ${message}  ` })).resolves.toEqual({ ok: true });
    const insert = adminMock.__fromCalls.find((c: { method: string }) => c.method === 'insert');
    expect(insert?.args[0]).toMatchObject({ message });
  });
});

describe('rate limit (AK 41)', () => {
  it('uses the caller, the IP and the round, before the write', async () => {
    let wroteBeforeConsume = true;
    consumeRateLimitMock.mockImplementation(async () => {
      wroteBeforeConsume = wrote(adminMock);
      return { ok: true };
    });
    await registerForOpenGameCore(REGISTER);
    expect(consumeRateLimitMock).toHaveBeenCalledWith({ userId: USER_ID, ip: IP, gameId: GAME_ID });
    expect(wroteBeforeConsume).toBe(false);
    expect(wrote(adminMock)).toBe(true);
  });

  it('over the limit: rate_limited and no write, on both', async () => {
    consumeRateLimitMock.mockResolvedValue({ ok: false, error: 'rate_limited' });
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'rate_limited' });
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'rate_limited' });
    expect(wrote(adminMock)).toBe(false);
  });

  it('the capped way too', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ game_mode: 'wolf', mode_config: { kind: 'wolf', team_size: 1 } }));
    consumeRateLimitMock.mockResolvedValue({ ok: false, error: 'rate_limited' });
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'rate_limited' });
    expect(adminMock.__rpcCalls).toEqual([]);
  });
});

describe('no row is never a success (AK 42)', () => {
  const wolf = { game_mode: 'wolf', mode_config: { kind: 'wolf', team_size: 1 } };
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it.each([
    ['an empty answer', null],
    ['an answer with no outcome', {}],
    ['an unknown outcome', { outcome: 'maybe' }],
  ])('%s from the seat RPC is db_error, and the organiser hears nothing', async (_name, claim) => {
    getGameByShortIdMock.mockResolvedValue(makeGame(wolf));
    adminMock = buildSupabaseMock([], { claim_open_registration_seat: claim });
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'db_error' });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('an error from the seat RPC is db_error', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame(wolf));
    adminMock = buildSupabaseMock([], {}, { rpcErrors: { claim_open_registration_seat: { message: 'boom' } } });
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'db_error' });
  });

  it.each([
    ['null', { data: null, error: null }],
    ['an empty list', { data: [], error: null }],
  ])('an insert that returns %s is db_error', async (_name, answer) => {
    adminMock = buildSupabaseMock([], {}, { byTable: { game_players: [answer] } });
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'db_error' });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a request that returns no row is db_error', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    adminMock = buildSupabaseMock([], {}, {
      byTable: { game_registration_requests: [{ data: null, error: null }] },
    });
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'db_error' });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a failed read of the facts is db_error on both, never wrong_mode or profile_incomplete (#1863)', async () => {
    vi.mocked(loadSignupFacts).mockRejectedValue(new Error('boom'));
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'invite_only', group_id: 'g' }));
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'db_error' });
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'db_error' });
    expect(wrote(adminMock)).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('two quick taps (AK 43)', () => {
  it('the second insert is already_registered, and only the first tells the organiser', async () => {
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        game_players: [PLAYER_ROW, { data: null, error: { code: '23505', message: 'duplicate key' } }],
      },
    });
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: true, gameId: GAME_ID });
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'already_registered' });
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('a seat already held answers the same', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ game_mode: 'wolf', mode_config: { kind: 'wolf', team_size: 1 } }));
    adminMock = buildSupabaseMock([], { claim_open_registration_seat: { outcome: 'already_on_roster' } });
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'already_registered' });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('the second request is already_requested, and only the first tells the organiser', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        game_registration_requests: [REQUEST_ROW, { data: null, error: { code: '23505', message: 'duplicate key' } }],
      },
    });
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: true });
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'already_requested' });
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });
});

describe('the same effect as on the web (AK 45)', () => {
  it('the row has accepted_at, the tee category and the source', async () => {
    vi.mocked(joinTeeGenders).mockResolvedValueOnce({ [USER_ID]: 'ladies' });
    const before = Date.now();
    await registerForOpenGameCore({ ...REGISTER, src: 'plakat' });
    const insert = adminMock.__fromCalls.find((c: { method: string }) => c.method === 'insert');
    const row = insert?.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      game_id: GAME_ID,
      user_id: USER_ID,
      tee_gender: 'ladies',
      signup_source: 'poster',
    });
    expect(Date.parse(String(row.accepted_at))).toBeGreaterThanOrEqual(before);
  });

  it('an unknown source becomes null and never stops the row', async () => {
    await expect(registerForOpenGameCore({ ...REGISTER, src: 'hacker' })).resolves.toMatchObject({ ok: true });
    const insert = adminMock.__fromCalls.find((c: { method: string }) => c.method === 'insert');
    expect(insert?.args[0]).toMatchObject({ signup_source: null });
  });

  it('the capped way carries the same fields to the RPC', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ game_mode: 'wolf', mode_config: { kind: 'wolf', team_size: 1 } }));
    vi.mocked(joinTeeGenders).mockResolvedValueOnce({ [USER_ID]: 'ladies' });
    await registerForOpenGameCore({ ...REGISTER, src: 'public' });
    expect(adminMock.__rpcCalls[0]).toMatchObject({
      name: 'claim_open_registration_seat',
      params: {
        p_game_id: GAME_ID,
        p_user_id: USER_ID,
        p_tee_gender: 'ladies',
        p_signup_source: 'public_page',
      },
    });
  });

  it('the organiser gets registration_request', async () => {
    await registerForOpenGameCore(REGISTER);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ORGANISER, kind: 'registration_request' }),
    );
  });

  it('a notification that fails does not roll back the signup', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    notifyMock.mockRejectedValue(new Error('boom'));
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: true, gameId: GAME_ID });
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: true });
    spy.mockRestore();
  });

  it('a mail that fails does not roll back the request', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    notifyMock.mockResolvedValue({ shouldAlsoSendMail: true });
    sendMailMock.mockRejectedValue(new Error('boom'));
    adminMock = buildSupabaseMock([], {}, {
      byTable: {
        game_registration_requests: [REQUEST_ROW],
        users: [
          { data: { name: 'Per', nickname: null, email: 'per@example.test' }, error: null },
          { data: { email: 'arrangor@example.test', locale: 'no' }, error: null },
        ],
      },
    });
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: true });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('a full open round takes a request (#2837)', () => {
  const fullWolf = { game_mode: 'wolf', mode_config: { kind: 'wolf', team_size: 1 } };
  const FULL: SignupViewerFacts = { ...NO_LINK, isFull: true, seats: { kind: 'capped', cap: 5, held: 5 } };

  it('the request goes in, and the organiser hears of it like any request', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame(fullWolf));
    vi.mocked(loadSignupFacts).mockResolvedValue(FULL);
    await expect(requestApprovalCore({ ...REQUEST, message: 'Plass til én til?' })).resolves.toEqual({ ok: true });
    const insert = adminMock.__fromCalls.find((c: { method: string }) => c.method === 'insert');
    expect(insert?.table).toBe('game_registration_requests');
    expect(insert?.args[0]).toMatchObject({ game_id: GAME_ID, user_id: USER_ID, status: 'pending', message: 'Plass til én til?' });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ORGANISER,
        kind: 'registration_request',
        payload: expect.objectContaining({ request_id: 'request-1' }),
      }),
    );
    // Asking is not signing up: the seat claim is never called.
    expect(adminMock.__rpcCalls).toEqual([]);
  });

  it('with seats left an open round still says wrong_mode, with nothing written', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame(fullWolf));
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'wrong_mode' });
    expect(wrote(adminMock)).toBe(false);
  });

  it('full, then closed: no new request', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ ...fullWolf, signups_closed_at: '2026-11-01T10:00:00Z' }));
    vi.mocked(loadSignupFacts).mockResolvedValue(FULL);
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'wrong_mode' });
    getGameByShortIdMock.mockResolvedValue(makeGame({ ...fullWolf, registration_mode: 'manual_approval', signups_closed_at: '2026-11-01T10:00:00Z' }));
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'signup_closed' });
    expect(wrote(adminMock)).toBe(false);
  });

  // Someone took the last seat between the screen and the tap: the answer is
  // «full», as the claim would have said, not «signup is not open».
  it('a full round does not sign you up directly: game_full, and the claim is never tried', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame(fullWolf));
    vi.mocked(loadSignupFacts).mockResolvedValue(FULL);
    await expect(registerForOpenGameCore(REGISTER)).resolves.toEqual({ ok: false, error: 'game_full' });
    expect(wrote(adminMock)).toBe(false);
  });
});

describe('asking again after withdrawing (#2837)', () => {
  const DUPLICATE = { data: null, error: { code: '23505', message: 'duplicate key' } };

  function updateOf(admin: ReturnType<typeof buildSupabaseMock>) {
    const at = admin.__fromCalls.findIndex(
      (c: { table: string; method: string }) => c.table === 'game_registration_requests' && c.method === 'update',
    );
    const calls = admin.__fromCalls.slice(at);
    const end = calls.findIndex((c: { method: string }, i: number) => i > 0 && c.method === 'select');
    return { args: calls[0]?.args[0] as Record<string, unknown> | undefined, filters: calls.slice(1, end) };
  }

  beforeEach(() => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
  });

  it('the withdrawn row opens again, at the back of the queue, and the organiser hears of it', async () => {
    adminMock = buildSupabaseMock([], {}, {
      byTable: { game_registration_requests: [DUPLICATE, { data: [{ id: 'old-request' }], error: null }] },
    });
    const before = Date.now();
    await expect(requestApprovalCore({ ...REQUEST, message: 'Nå kan jeg likevel' })).resolves.toEqual({ ok: true });
    const { args, filters } = updateOf(adminMock);
    expect(args).toMatchObject({
      status: 'pending',
      message: 'Nå kan jeg likevel',
      decided_at: null,
      decided_by_user_id: null,
      rejection_reason: null,
    });
    expect(Date.parse(String(args?.created_at))).toBeGreaterThanOrEqual(before);
    expect(filters.map((f: { method: string; args: unknown[] }) => [f.method, ...f.args])).toEqual(
      expect.arrayContaining([
        ['eq', 'game_id', GAME_ID],
        ['eq', 'user_id', USER_ID],
        ['eq', 'status', 'withdrawn'],
        ['is', 'team_request_id', null],
        ['eq', 'is_team_captain', false],
        ['is', 'brought_by_user_id', null],
      ]),
    );
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ request_id: 'old-request' }) }),
    );
  });

  it('a row the organiser answered stays answered: already_requested, and nobody hears of it', async () => {
    adminMock = buildSupabaseMock([], {}, {
      byTable: { game_registration_requests: [DUPLICATE, { data: [], error: null }] },
    });
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'already_requested' });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a failed reopen is db_error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([], {}, {
      byTable: { game_registration_requests: [DUPLICATE, { data: null, error: { message: 'boom' } }] },
    });
    await expect(requestApprovalCore(REQUEST)).resolves.toEqual({ ok: false, error: 'db_error' });
    expect(notifyMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('withdrawRequestCore (#2837)', () => {
  const WITHDRAW = { shortId: SHORT_ID, userId: USER_ID };

  function updateCall(admin: ReturnType<typeof buildSupabaseMock>) {
    return admin.__fromCalls.find(
      (c: { table: string; method: string }) => c.table === 'game_registration_requests' && c.method === 'update',
    );
  }

  it('your own waiting request becomes withdrawn, by you, now', async () => {
    adminMock = buildSupabaseMock([], {}, {
      byTable: { game_registration_requests: [{ data: [{ id: 'request-1' }], error: null }] },
    });
    const before = Date.now();
    await expect(withdrawRequestCore(WITHDRAW)).resolves.toEqual({ ok: true });
    const update = updateCall(adminMock)?.args[0] as Record<string, unknown>;
    expect(update).toMatchObject({ status: 'withdrawn', decided_by_user_id: USER_ID });
    expect(Date.parse(String(update.decided_at))).toBeGreaterThanOrEqual(before);
    const filters = adminMock.__fromCalls
      .filter((c: { table: string; method: string }) => c.table === 'game_registration_requests' && ['eq', 'is'].includes(c.method))
      .map((c: { method: string; args: unknown[] }) => [c.method, ...c.args]);
    expect(filters).toEqual(
      expect.arrayContaining([
        ['eq', 'game_id', GAME_ID],
        ['eq', 'user_id', USER_ID],
        ['eq', 'status', 'pending'],
        ['is', 'team_request_id', null],
        ['eq', 'is_team_captain', false],
        ['is', 'brought_by_user_id', null],
      ]),
    );
    // The organiser gets no mail about a request taken back.
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('after closing, the waiting list can still be left', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ signups_closed_at: '2026-11-01T10:00:00Z' }));
    adminMock = buildSupabaseMock([], {}, {
      byTable: { game_registration_requests: [{ data: [{ id: 'request-1' }], error: null }] },
    });
    await expect(withdrawRequestCore(WITHDRAW)).resolves.toEqual({ ok: true });
  });

  it('0 rows: the organiser answered first, so nothing is withdrawn', async () => {
    adminMock = buildSupabaseMock([], {}, {
      byTable: { game_registration_requests: [{ data: [], error: null }] },
    });
    await expect(withdrawRequestCore(WITHDRAW)).resolves.toEqual({ ok: false, error: 'not_pending' });
  });

  it('a failed write is db_error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([], {}, {
      byTable: { game_registration_requests: [{ data: null, error: { message: 'boom' } }] },
    });
    await expect(withdrawRequestCore(WITHDRAW)).resolves.toEqual({ ok: false, error: 'db_error' });
    spy.mockRestore();
  });

  it.each([
    ['unknown', null],
    ['draft', makeGame({ status: 'draft' })],
  ])('%s round answers game_not_found, with nothing written', async (_name, game) => {
    getGameByShortIdMock.mockResolvedValue(game);
    await expect(withdrawRequestCore(WITHDRAW)).resolves.toEqual({ ok: false, error: 'game_not_found' });
    expect(updateCall(adminMock)).toBeUndefined();
  });
});

describe('one rule for «your own request» (#2837)', () => {
  it('the withdraw filter and the cancellable fact agree on every row', async () => {
    const { isOwnPendingRequest } = await vi.importActual<typeof import('./loadSignupFacts')>(
      './loadSignupFacts',
    );
    adminMock = buildSupabaseMock([], {}, {
      byTable: { game_registration_requests: [{ data: [{ id: 'request-1' }], error: null }] },
    });
    await withdrawRequestCore({ shortId: SHORT_ID, userId: USER_ID });
    const filters = adminMock.__fromCalls
      .filter(
        (c: { table: string; method: string }) =>
          c.table === 'game_registration_requests' && (c.method === 'eq' || c.method === 'is'),
      )
      .map((c: { args: unknown[] }) => ({ column: String(c.args[0]), value: c.args[1] }))
      .filter((f: { column: string }) => f.column !== 'game_id' && f.column !== 'user_id');
    expect(filters.length).toBeGreaterThan(1);

    let rows = 0;
    for (const status of ['pending', 'approved', 'rejected', 'withdrawn'] as const) {
      for (const team_request_id of [null, 'captain-row']) {
        for (const is_team_captain of [false, true]) {
          for (const brought_by_user_id of [null, 'host']) {
            rows += 1;
            const row = { status, team_request_id, is_team_captain, brought_by_user_id };
            const filterMatches = filters.every(
              (f: { column: string; value: unknown }) => row[f.column as keyof typeof row] === f.value,
            );
            expect(isOwnPendingRequest(row)).toBe(filterMatches);
          }
        }
      }
    }
    expect(rows).toBe(32);
  });
});

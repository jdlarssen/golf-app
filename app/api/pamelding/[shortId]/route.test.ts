// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionError } from '@/lib/games/selfRegistration';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2748): signing up in the app. The rule (`signupOffer`, real here), the
 * reads (`loadSignupFacts`) and the writes (`selfRegistration`) have their own
 * suites. Here stands what the route answers for: nothing without a token, the
 * caller comes only from the token and the round only from the path, each
 * outcome gets its status, and no answer carries a name or an address.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const GAME_ID = '22222222-2222-4222-8222-222222222222';
const SHORT_ID = 'abc12345';
const IP = '203.0.113.7';

let countAnswer: { count?: number; error?: { message: string } } = { count: 5 };
const fake = createAdminClientMock({ tokens: { 'token-meg': ME }, respond: () => countAnswer });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/games/loadSignupFacts');

const getGameByShortIdMock = vi.fn();
vi.mock('@/lib/games/getGameByShortId', () => ({
  getGameByShortId: (shortId: string) => getGameByShortIdMock(shortId),
}));

const registerMock = vi.fn();
const requestMock = vi.fn();
vi.mock('@/lib/games/selfRegistration', () => ({
  registerForOpenGameCore: (...args: unknown[]) => registerMock(...args),
  requestApprovalCore: (...args: unknown[]) => requestMock(...args),
}));

vi.mock('@/lib/admin/rateLimit', () => ({ getClientIp: async () => IP }));

import { NextRequest } from 'next/server';
import { loadSignupFacts } from '@/lib/games/loadSignupFacts';
import { GET, POST } from './route';

const NO_LINK = {
  profileCompleted: true,
  isAlreadyRegistered: false,
  requestView: 'none' as const,
  hasPendingInvitation: false,
  isClubMember: false,
  viewerIsFriend: false,
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
    courses: { name: 'Larvik GK' },
    tee_box: { name: 'Gul' },
    scheduled_tee_off_at: '2026-11-20T09:00:00Z',
    entry_fee_kr: 200,
    group_id: null,
    created_by: 'organiser',
    let_friends_skip_gate: false,
    signups_closed_at: null,
    payment_link: null,
    ...over,
  };
}

const params = { params: Promise.resolve({ shortId: SHORT_ID }) };

function get(token: string | null = 'token-meg') {
  return GET(
    new NextRequest(`http://localhost/api/pamelding/${SHORT_ID}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    params,
  );
}

function post(body: unknown, token: string | null = 'token-meg') {
  return POST(
    new NextRequest(`http://localhost/api/pamelding/${SHORT_ID}`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    params,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  countAnswer = { count: 5 };
  getGameByShortIdMock.mockResolvedValue(makeGame());
  vi.mocked(loadSignupFacts).mockResolvedValue(NO_LINK);
  registerMock.mockResolvedValue({ ok: true, gameId: GAME_ID });
  requestMock.mockResolvedValue({ ok: true });
});

describe('GET /api/pamelding/[shortId]', () => {
  it('401 without a token, and nothing is read', async () => {
    const res = await get(null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(getGameByShortIdMock).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['a draft', makeGame({ status: 'draft' })],
  ])('404 for %s', async (_name, game) => {
    getGameByShortIdMock.mockResolvedValue(game);
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'game_not_found' });
    expect(loadSignupFacts).not.toHaveBeenCalled();
  });

  it('the offer, the card and a count of the active players, nothing more', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      offer: 'join',
      round: {
        name: 'Sommercup 2026',
        modeLabel: 'Stableford',
        courseName: 'Larvik GK',
        teeName: 'Gul',
        teeOffAt: '2026-11-20T09:00:00Z',
        entryFeeKr: 200,
      },
      playerCount: 5,
      signupPath: `/signup/${SHORT_ID}`,
    });
    expect(loadSignupFacts).toHaveBeenCalledWith(expect.objectContaining({ id: GAME_ID }), ME);
    const count = fake.ops.find((op) => op.table === 'game_players');
    expect(count?.columns).toBe('user_id');
    expect(count?.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'game_id', value: GAME_ID },
        { op: 'is', column: 'withdrawn_at', value: null },
      ]),
    );
  });

  it('the game id only for a player on the list', async () => {
    vi.mocked(loadSignupFacts).mockResolvedValue({ ...NO_LINK, isAlreadyRegistered: true });
    const body = await (await get()).json();
    expect(body).toMatchObject({ offer: 'in_game', gameId: GAME_ID });
  });

  it.each([
    ['the facts', () => vi.mocked(loadSignupFacts).mockRejectedValue(new Error('boom'))],
    ['the count', () => { countAnswer = { error: { message: 'boom' } }; }],
  ])('500 load_failed when reading %s fails', async (_name, arrange) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    arrange();
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
    spy.mockRestore();
  });
});

describe('POST /api/pamelding/[shortId]', () => {
  it('401 without a token, and nothing is written', async () => {
    const res = await post({ intent: 'join' }, null);
    expect(res.status).toBe(401);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', 'ikke json'],
    ['null', 'null'],
    ['no intent', {}],
    ['an unknown intent', { intent: 'team' }],
  ])('400 bad_request for %s', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
    expect(registerMock).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['a draft', makeGame({ status: 'draft' })],
  ])('404 for %s', async (_name, game) => {
    getGameByShortIdMock.mockResolvedValue(game);
    const res = await post({ intent: 'join' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'game_not_found' });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('join: the caller from the token, the round from the path, no side, whatever the body says', async () => {
    const res = await post({
      intent: 'join',
      src: 'plakat',
      user_id: 'someone-else',
      game_id: 'another-game',
      shortId: 'zzzzzzzz',
      side: 2,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'joined', gameId: GAME_ID });
    expect(getGameByShortIdMock).toHaveBeenCalledWith(SHORT_ID);
    expect(registerMock).toHaveBeenCalledWith({
      shortId: SHORT_ID,
      userId: ME,
      ip: IP,
      side: null,
      src: 'plakat',
    });
  });

  it('request: the same, with the message', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    const res = await post({ intent: 'request', message: 'Plass?', user_id: 'someone-else' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'requested' });
    expect(requestMock).toHaveBeenCalledWith({ shortId: SHORT_ID, userId: ME, ip: IP, message: 'Plass?' });
  });

  it('a src or a message that is not text counts as none', async () => {
    await post({ intent: 'join', src: 7 });
    expect(registerMock).toHaveBeenCalledWith(expect.objectContaining({ src: null }));
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    await post({ intent: 'request', message: ['x'] });
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ message: null }));
  });

  describe('the screen\'s offer answers first, and no core is called', () => {
    const facts = (over: Record<string, unknown>) => () =>
      vi.mocked(loadSignupFacts).mockResolvedValue({ ...NO_LINK, ...over });
    const game = (over: Record<string, unknown>) => () =>
      getGameByShortIdMock.mockResolvedValue(makeGame(over));
    it.each<[string, () => void, number, object]>([
      ['on the list', facts({ isAlreadyRegistered: true }), 200, { status: 'joined', gameId: GAME_ID }],
      ['on the list in a finished round', () => { facts({ isAlreadyRegistered: true })(); game({ status: 'finished' })(); }, 200, { status: 'joined', gameId: GAME_ID }],
      ['asked already', facts({ requestView: 'self_request' }), 200, { status: 'requested' }],
      ['active', game({ status: 'active' }), 409, { error: 'game_locked' }],
      ['finished', game({ status: 'finished' }), 409, { error: 'game_locked' }],
      ['closed', game({ signups_closed_at: '2026-11-01T10:00:00Z' }), 409, { error: 'signup_closed' }],
      ['a team', game({ registration_type: 'team', game_mode: 'best_ball' }), 409, { error: 'use_web' }],
      ['open matchplay', game({ game_mode: 'singles_matchplay' }), 409, { error: 'use_web' }],
      ['a captain\'s team', facts({ requestView: 'captain_invited' }), 409, { error: 'use_web' }],
      ['an invitation on invite only', () => { game({ registration_mode: 'invite_only' })(); facts({ hasPendingInvitation: true })(); }, 409, { error: 'use_web' }],
    ])('%s', async (_name, arrange, status, body) => {
      arrange();
      for (const intent of ['join', 'request']) {
        const res = await post({ intent });
        expect(res.status).toBe(status);
        expect(await res.json()).toEqual(body);
      }
      expect(registerMock).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
    });
  });

  describe('every answer from the cores has its status', () => {
    it.each<[ActionError, number, object]>([
      ['already_registered', 200, { status: 'joined', gameId: GAME_ID }],
      ['message_too_long', 400, { error: 'message_too_long' }],
      ['not_authed', 401, { error: 'unauthorized' }],
      ['game_not_found', 404, { error: 'game_not_found' }],
      ['game_locked', 409, { error: 'game_locked' }],
      ['signup_closed', 409, { error: 'signup_closed' }],
      ['game_full', 409, { error: 'game_full' }],
      ['wrong_mode', 409, { error: 'wrong_mode' }],
      ['profile_incomplete', 409, { error: 'profile_incomplete' }],
      ['team_not_supported_yet', 409, { error: 'use_web' }],
      ['bad_side', 409, { error: 'use_web' }],
      ['side_full', 409, { error: 'use_web' }],
      ['rate_limited', 429, { error: 'rate_limited' }],
      ['db_error', 500, { error: 'db_error' }],
    ])('%s', async (error, status, body) => {
      registerMock.mockResolvedValue({ ok: false, error });
      const res = await post({ intent: 'join' });
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual(body);

      getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
      requestMock.mockResolvedValue({ ok: false, error });
      const res2 = await post({ intent: 'request' });
      expect(res2.status).toBe(status);
      expect(await res2.json()).toEqual(body);
    });
  });

  describe('the unique key answers for any old request, so the route looks again', () => {
    const asked = (requestView: 'none' | 'self_request', isAlreadyRegistered = false) => ({
      ...NO_LINK,
      requestView,
      isAlreadyRegistered,
    });
    beforeEach(() => {
      getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
      requestMock.mockResolvedValue({ ok: false, error: 'already_requested' });
    });

    it('two quick taps: the row is waiting, 200 requested', async () => {
      vi.mocked(loadSignupFacts)
        .mockResolvedValueOnce(asked('none'))
        .mockResolvedValueOnce(asked('self_request'));
      const res = await post({ intent: 'request' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'requested' });
    });

    it('an old rejected request: no «sent» that nobody gets', async () => {
      vi.mocked(loadSignupFacts).mockResolvedValue(asked('none'));
      const res = await post({ intent: 'request' });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'wrong_mode' });
    });

    it('approved in the meantime: on the list', async () => {
      vi.mocked(loadSignupFacts)
        .mockResolvedValueOnce(asked('none'))
        .mockResolvedValueOnce(asked('none', true));
      const res = await post({ intent: 'request' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'joined', gameId: GAME_ID });
    });

    it('a failed second look is 500 db_error, not a guess', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(loadSignupFacts)
        .mockResolvedValueOnce(asked('none'))
        .mockRejectedValueOnce(new Error('boom'));
      const res = await post({ intent: 'request' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'db_error' });
      spy.mockRestore();
    });
  });

  it('a failed read of the facts is 500 db_error, and nothing is written', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadSignupFacts).mockRejectedValue(new Error('boom'));
    const res = await post({ intent: 'join' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'db_error' });
    expect(registerMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

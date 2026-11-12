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

const FRIEND_A = '33333333-3333-4333-8333-333333333333';
const FRIEND_B = '44444444-4444-4444-8444-444444444444';
const FRIEND_C = '55555555-5555-4555-8555-555555555555';
const STRANGER = '66666666-6666-4666-8666-666666666666';
const REQUEST_ID = '77777777-7777-4777-8777-777777777777';

let countAnswer: { count?: number; error?: { message: string } } = { count: 5 };
/** #2840: the team reads. `ownRow` is the caller's request row in the round. */
let ownRow: Record<string, unknown> | null = null;
let rosterRows: { user_id: string }[] = [];
let requestRows: { user_id: string }[] = [];
let myName: string | null = 'Martin Hansen';
const fake = createAdminClientMock({
  tokens: { 'token-meg': ME },
  respond: (op) => {
    if (op.table === 'game_players') return { ...countAnswer, data: rosterRows };
    if (op.table === 'game_registration_requests') return { data: op.single ? ownRow : requestRows };
    if (op.table === 'users') return { data: { name: myName } };
    return {};
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
vi.mock('@/lib/games/loadSignupFacts');

const readFriendIdsMock = vi.fn();
vi.mock('@/lib/friends/getFriendIds', () => ({
  readFriendIds: (userId: string) => readFriendIdsMock(userId),
}));

const loadTeamDashboardMock = vi.fn();
vi.mock('@/lib/games/teamDashboardCore', () => ({
  loadTeamDashboard: (...args: unknown[]) => loadTeamDashboardMock(...args),
}));

const submitTeamMock = vi.fn();
const acceptTeamMock = vi.fn();
const declineTeamMock = vi.fn();
vi.mock('@/lib/games/teamRegistrationCore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/games/teamRegistrationCore')>()),
  submitTeamRegistrationCore: (...args: unknown[]) => submitTeamMock(...args),
  acceptTeamInviteCore: (...args: unknown[]) => acceptTeamMock(...args),
  declineTeamInviteCore: (...args: unknown[]) => declineTeamMock(...args),
}));

const displayNameMock = vi.fn();
vi.mock('@/app/[locale]/signup/[shortId]/team/captainLookup', () => ({
  getCaptainDisplayName: (userId: string) => displayNameMock(userId),
}));

const getGameByShortIdMock = vi.fn();
vi.mock('@/lib/games/getGameByShortId', () => ({
  getGameByShortId: (shortId: string) => getGameByShortIdMock(shortId),
}));

const registerMock = vi.fn();
const requestMock = vi.fn();
const withdrawMock = vi.fn();
vi.mock('@/lib/games/selfRegistration', () => ({
  registerForOpenGameCore: (...args: unknown[]) => registerMock(...args),
  requestApprovalCore: (...args: unknown[]) => requestMock(...args),
  withdrawRequestCore: (...args: unknown[]) => withdrawMock(...args),
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
  ownRow = null;
  rosterRows = [];
  requestRows = [];
  myName = 'Martin Hansen';
  readFriendIdsMock.mockResolvedValue([]);
  displayNameMock.mockImplementation(async (id: string) => `Navn ${id.slice(0, 4)}`);
  submitTeamMock.mockResolvedValue({ ok: true, captainRequestId: REQUEST_ID, slotResults: [] });
  acceptTeamMock.mockResolvedValue({ ok: true });
  declineTeamMock.mockResolvedValue({ ok: true });
  getGameByShortIdMock.mockResolvedValue(makeGame());
  vi.mocked(loadSignupFacts).mockResolvedValue(NO_LINK);
  registerMock.mockResolvedValue({ ok: true, gameId: GAME_ID });
  requestMock.mockResolvedValue({ ok: true });
  withdrawMock.mockResolvedValue({ ok: true });
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
      seats: null,
      canCancelRequest: false,
      signupPath: `/signup/${SHORT_ID}`,
      teamSignup: null,
      hasTeamPage: false,
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

  // #2837
  it('a full round: the request, and the seats as numbers', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ game_mode: 'wolf', mode_config: { kind: 'wolf' } }));
    vi.mocked(loadSignupFacts).mockResolvedValue({
      ...NO_LINK,
      isFull: true,
      seats: { kind: 'capped', cap: 5, held: 5 },
    });
    expect(await (await get()).json()).toMatchObject({
      offer: 'request',
      seats: { kind: 'capped', cap: 5, held: 5 },
    });
  });

  it.each<[string, Record<string, unknown>, boolean]>([
    ['your own request, waiting', { requestView: 'self_request', ownRequestCancellable: true }, true],
    ['a team waiting for the organiser', { requestView: 'team_awaiting_approval', ownRequestCancellable: false }, false],
    ['a captain\'s own team request', { requestView: 'self_request', ownRequestCancellable: false }, false],
  ])('the request can be withdrawn here: %s', async (_name, over, can) => {
    vi.mocked(loadSignupFacts).mockResolvedValue({ ...NO_LINK, ...over });
    expect(await (await get()).json()).toMatchObject({ offer: 'pending', canCancelRequest: can });
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

  it('a full open round takes the request (#2837)', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ game_mode: 'wolf', mode_config: { kind: 'wolf' } }));
    vi.mocked(loadSignupFacts).mockResolvedValue({ ...NO_LINK, isFull: true, seats: { kind: 'capped', cap: 5, held: 5 } });
    const res = await post({ intent: 'request', message: 'Plass?' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'requested' });
    expect(requestMock).toHaveBeenCalledWith({ shortId: SHORT_ID, userId: ME, ip: IP, message: 'Plass?' });
    expect(registerMock).not.toHaveBeenCalled();
  });

  describe('cancel: «Trekk forespørselen» (#2837)', () => {
    it('the caller from the token, the round from the path, whatever the body says', async () => {
      const res = await post({ intent: 'cancel', user_id: 'someone-else', game_id: 'another-game', shortId: 'zzzzzzzz' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'cancelled' });
      expect(withdrawMock).toHaveBeenCalledWith({ shortId: SHORT_ID, userId: ME });
      expect(registerMock).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('also after the organiser has closed the signup', async () => {
      getGameByShortIdMock.mockResolvedValue(makeGame({ signups_closed_at: '2026-11-01T10:00:00Z' }));
      vi.mocked(loadSignupFacts).mockResolvedValue({ ...NO_LINK, requestView: 'self_request', ownRequestCancellable: true });
      const res = await post({ intent: 'cancel' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'cancelled' });
    });

    it('401 without a token, and nothing is written', async () => {
      const res = await post({ intent: 'cancel' }, null);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
      expect(withdrawMock).not.toHaveBeenCalled();
    });

    it.each<[string, number, object]>([
      ['not_pending', 409, { error: 'not_pending' }],
      ['game_not_found', 404, { error: 'game_not_found' }],
      ['db_error', 500, { error: 'db_error' }],
    ])('%s', async (error, status, body) => {
      withdrawMock.mockResolvedValue({ ok: false, error });
      const res = await post({ intent: 'cancel' });
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual(body);
    });
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

// #2840: the team screens in the app.
const TEAM_ROUND = { registration_type: 'team', game_mode: 'best_ball', mode_config: { kind: 'best_ball', team_size: 2 } };

describe('GET /api/pamelding/[shortId]: the team screens (#2840)', () => {
  it('a captain-to-be gets the form, and the offer stays web for old builds', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame(TEAM_ROUND));
    const body = await (await get()).json();
    expect(body).toMatchObject({
      offer: 'web',
      teamSignup: {
        kind: 'form',
        teamSize: 2,
        nameMin: 3,
        nameMax: 40,
        suggestedName: 'Martins lag',
        unavailableFriendIds: [],
      },
      hasTeamPage: false,
    });
  });

  it('greys out only friends already in the round: on the list or with a live request', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame(TEAM_ROUND));
    readFriendIdsMock.mockResolvedValue([FRIEND_A, FRIEND_B, FRIEND_C]);
    rosterRows = [{ user_id: FRIEND_A }, { user_id: STRANGER }, { user_id: ME }];
    requestRows = [{ user_id: FRIEND_B }, { user_id: '88888888-8888-4888-8888-888888888888' }];
    const body = await (await get()).json();
    expect(body.teamSignup.unavailableFriendIds).toEqual([FRIEND_A, FRIEND_B]);
    expect(readFriendIdsMock).toHaveBeenCalledWith(ME);

    const roster = fake.ops.find((op) => op.table === 'game_players' && op.columns === 'user_id' && op.filters.length === 2);
    expect(roster?.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'game_id', value: GAME_ID },
        { op: 'is', column: 'withdrawn_at', value: null },
      ]),
    );
    const requests = fake.ops.find((op) => op.table === 'game_registration_requests' && !op.single);
    expect(requests?.filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'game_id', value: GAME_ID },
        { op: 'in', column: 'status', value: ['pending', 'approved'] },
      ]),
    );
  });

  it('no name gives «Laget mitt»', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame(TEAM_ROUND));
    myName = null;
    expect((await (await get()).json()).teamSignup.suggestedName).toBe('Laget mitt');
  });

  it('an invited teammate gets the yes/no, with the names the team page shows and no ids', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame(TEAM_ROUND));
    vi.mocked(loadSignupFacts).mockResolvedValue({ ...NO_LINK, requestView: 'captain_invited' });
    ownRow = { status: 'pending', is_team_captain: false, team_request_id: 'captain-row' };
    loadTeamDashboardMock.mockResolvedValue({
      kind: 'member',
      game: { id: GAME_ID, shortId: SHORT_ID, name: 'x', courseName: null, joinEffect: 'instant', signupsClosed: false },
      myRowId: REQUEST_ID,
      myStatus: 'pending',
      teamName: 'Martins lag',
      captain: { requestId: 'captain-row', userId: FRIEND_A, displayName: 'Martin Hansen', status: 'approved' },
      members: [{ requestId: REQUEST_ID, userId: ME, displayName: 'ka•••@gmail.com', status: 'pending', isGuest: false }],
    });
    const res = await get();
    const body = await res.json();
    expect(body.offer).toBe('web');
    expect(body.hasTeamPage).toBe(true);
    expect(body.teamSignup).toEqual({
      kind: 'invited',
      requestId: REQUEST_ID,
      captainName: 'Martin Hansen',
      teamName: 'Martins lag',
      joinEffect: 'instant',
      members: [
        { name: 'Martin Hansen', isCaptain: true, status: 'approved' },
        { name: 'ka•••@gmail.com', isCaptain: false, status: 'pending' },
      ],
    });
    expect(loadTeamDashboardMock).toHaveBeenCalledWith(SHORT_ID, ME);
    expect(JSON.stringify(body)).not.toContain(FRIEND_A);
  });

  it.each<[string, () => void]>([
    ['a solo round', () => {}],
    ['a team round you are on', () => {
      getGameByShortIdMock.mockResolvedValue(makeGame(TEAM_ROUND));
      vi.mocked(loadSignupFacts).mockResolvedValue({ ...NO_LINK, isAlreadyRegistered: true });
    }],
    ['a closed team round', () => getGameByShortIdMock.mockResolvedValue(makeGame({ ...TEAM_ROUND, signups_closed_at: '2026-11-01T10:00:00Z' }))],
    ['an invite-only team round', () => getGameByShortIdMock.mockResolvedValue(makeGame({ ...TEAM_ROUND, registration_mode: 'invite_only' }))],
  ])('no team screen on %s', async (_name, arrange) => {
    arrange();
    const body = await (await get()).json();
    expect(body.teamSignup).toBeNull();
    expect(readFriendIdsMock).not.toHaveBeenCalled();
    expect(loadTeamDashboardMock).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown> | null, boolean]>([
    ['captain', { status: 'approved', is_team_captain: true, team_request_id: null }, true],
    ['teammate', { status: 'approved', is_team_captain: false, team_request_id: 'c' }, true],
    ['a solo request', { status: 'pending', is_team_captain: false, team_request_id: null }, false],
    ['a teammate who said no', { status: 'rejected', is_team_captain: false, team_request_id: 'c' }, false],
    ['a captain who withdrew', { status: 'withdrawn', is_team_captain: true, team_request_id: null }, false],
    ['no row', null, false],
  ])('hasTeamPage: %s', async (_name, row, expected) => {
    getGameByShortIdMock.mockResolvedValue(makeGame(TEAM_ROUND));
    vi.mocked(loadSignupFacts).mockResolvedValue({ ...NO_LINK, isAlreadyRegistered: true });
    ownRow = row;
    const body = await (await get()).json();
    expect(body.hasTeamPage).toBe(expected);
    const own = fake.ops.find((op) => op.table === 'game_registration_requests' && op.single);
    expect(own?.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME_ID },
      { op: 'eq', column: 'user_id', value: ME },
    ]);
  });

  it('a failed friend read is 500 load_failed, never a form that greys out nobody', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getGameByShortIdMock.mockResolvedValue(makeGame(TEAM_ROUND));
    readFriendIdsMock.mockRejectedValue(new Error('boom'));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
    spy.mockRestore();
  });
});

describe('POST /api/pamelding/[shortId]: the team intents (#2840)', () => {
  beforeEach(() => {
    getGameByShortIdMock.mockResolvedValue(makeGame(TEAM_ROUND));
  });

  it.each([
    ['team', { intent: 'team', teamName: 'Martins lag', memberIds: [FRIEND_A] }],
    ['accept_team', { intent: 'accept_team', requestId: REQUEST_ID }],
    ['decline_team', { intent: 'decline_team', requestId: REQUEST_ID }],
  ])('%s: 401 without a token, and no core is called', async (_name, body) => {
    const res = await post(body, null);
    expect(res.status).toBe(401);
    expect(submitTeamMock).not.toHaveBeenCalled();
    expect(acceptTeamMock).not.toHaveBeenCalled();
    expect(declineTeamMock).not.toHaveBeenCalled();
  });

  it('team: the captain from the token, the round from the path, the ip, whatever the body says', async () => {
    submitTeamMock.mockResolvedValue({
      ok: true,
      captainRequestId: REQUEST_ID,
      slotResults: [
        { ok: true, outcome: 'known_added', userId: FRIEND_A },
        { ok: false, userId: FRIEND_B, reason: 'alreadyRegistered' },
      ],
    });
    displayNameMock.mockImplementation(async (id: string) => (id === FRIEND_A ? 'Kari Nordmann' : null));
    getGameByShortIdMock.mockResolvedValue(makeGame({ ...TEAM_ROUND, mode_config: { kind: 'best_ball', team_size: 3 } }));
    const res = await post({
      intent: 'team',
      teamName: 'Martins lag',
      memberIds: [FRIEND_A, FRIEND_B],
      user_id: STRANGER,
      userId: STRANGER,
      shortId: 'zzzzzzzz',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'team_registered',
      captainRequestId: REQUEST_ID,
      joinEffect: 'instant',
      slotResults: [
        { ok: true, userId: FRIEND_A, name: 'Kari Nordmann' },
        { ok: false, userId: FRIEND_B, name: null, reason: 'alreadyRegistered' },
      ],
    });
    expect(getGameByShortIdMock).toHaveBeenCalledWith(SHORT_ID);
    expect(submitTeamMock).toHaveBeenCalledWith(
      ME,
      { shortId: SHORT_ID, teamName: 'Martins lag', memberIds: [FRIEND_A, FRIEND_B] },
      { ip: IP },
    );
  });

  it('team on manual approval: the team waits for the organiser', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ ...TEAM_ROUND, registration_mode: 'manual_approval' }));
    const body = await (await post({ intent: 'team', teamName: 'Lag', memberIds: [FRIEND_A] })).json();
    expect(body).toMatchObject({ status: 'team_registered', joinEffect: 'approval' });
  });

  it.each([
    ['accept_team', acceptTeamMock, 'team_accepted'],
    ['decline_team', declineTeamMock, 'team_declined'],
  ] as const)('%s: the caller from the token, the request from the body', async (intent, core, status) => {
    const res = await post({ intent, requestId: REQUEST_ID, user_id: STRANGER, userId: STRANGER });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status });
    expect(core).toHaveBeenCalledWith(ME, { shortId: SHORT_ID, requestId: REQUEST_ID });
  });

  it.each<[string, unknown]>([
    ['team without a name', { intent: 'team', memberIds: [FRIEND_A] }],
    ['team with a name that is not text', { intent: 'team', teamName: 7, memberIds: [FRIEND_A] }],
    ['team with an absurd name', { intent: 'team', teamName: 'x'.repeat(201), memberIds: [FRIEND_A] }],
    ['team without members', { intent: 'team', teamName: 'Lag' }],
    ['team with members that are not a list', { intent: 'team', teamName: 'Lag', memberIds: FRIEND_A }],
    ['team with an address for a member', { intent: 'team', teamName: 'Lag', memberIds: ['kari@example.com'] }],
    ['team with a number for a member', { intent: 'team', teamName: 'Lag', memberIds: [7] }],
    ['team with too many members', { intent: 'team', teamName: 'Lag', memberIds: Array(9).fill(FRIEND_A) }],
    ['accept_team without a request', { intent: 'accept_team' }],
    ['decline_team with a request that is no uuid', { intent: 'decline_team', requestId: 'abc' }],
  ])('400 bad_request: %s', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
    expect(submitTeamMock).not.toHaveBeenCalled();
    expect(acceptTeamMock).not.toHaveBeenCalled();
    expect(declineTeamMock).not.toHaveBeenCalled();
  });

  it('team on a missing or draft round is 404, and the core is not called', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ ...TEAM_ROUND, status: 'draft' }));
    const res = await post({ intent: 'team', teamName: 'Lag', memberIds: [FRIEND_A] });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'game_not_found' });
    expect(submitTeamMock).not.toHaveBeenCalled();
  });

  it.each<[string, number, object]>([
    ['team_name_invalid', 400, { error: 'team_name_invalid' }],
    ['slots_count_wrong', 400, { error: 'slots_count_wrong' }],
    ['duplicate_members', 400, { error: 'duplicate_members' }],
    ['self_in_slots', 400, { error: 'self_in_slots' }],
    ['not_authed', 401, { error: 'unauthorized' }],
    ['teammate_not_friend', 403, { error: 'teammate_not_friend' }],
    ['game_not_found', 404, { error: 'game_not_found' }],
    ['game_locked', 409, { error: 'game_locked' }],
    ['signup_closed', 409, { error: 'signup_closed' }],
    ['game_full', 409, { error: 'game_full' }],
    ['already_registered', 409, { error: 'already_registered' }],
    ['wrong_type', 409, { error: 'wrong_type' }],
    ['wrong_mode', 409, { error: 'wrong_mode' }],
    ['mode_does_not_support_teams', 409, { error: 'mode_does_not_support_teams' }],
    ['profile_incomplete', 409, { error: 'profile_incomplete' }],
    ['rate_limited', 429, { error: 'rate_limited' }],
    ['db_error', 500, { error: 'db_error' }],
  ])('team: %s', async (error, status, body) => {
    submitTeamMock.mockResolvedValue({ ok: false, error });
    const res = await post({ intent: 'team', teamName: 'Lag', memberIds: [FRIEND_A] });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
  });

  it.each<[string, number, object]>([
    ['not_authed', 401, { error: 'unauthorized' }],
    ['profile_incomplete', 409, { error: 'profile_incomplete' }],
    ['not_found', 404, { error: 'not_found' }],
    ['game_locked', 409, { error: 'game_locked' }],
    ['signup_closed', 409, { error: 'signup_closed' }],
    ['db_error', 500, { error: 'db_error' }],
  ])('accept_team and decline_team: %s', async (error, status, body) => {
    for (const [intent, core] of [['accept_team', acceptTeamMock], ['decline_team', declineTeamMock]] as const) {
      core.mockResolvedValue({ ok: false, error });
      const res = await post({ intent, requestId: REQUEST_ID });
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual(body);
    }
  });

  it('join on a team round still answers use_web, and no core is called', async () => {
    const res = await post({ intent: 'join' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'use_web' });
    expect(registerMock).not.toHaveBeenCalled();
    expect(submitTeamMock).not.toHaveBeenCalled();
  });
});

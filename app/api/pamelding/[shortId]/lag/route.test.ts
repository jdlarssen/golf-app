// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2840): the team page in the app. The cores (`teamDashboardCore`)
 * have their own suite, with the ownership checks. Here stands what the route
 * answers for: nothing without a token, the caller only from the token and the
 * round only from the path, each intent to its core, and each outcome its status.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const GAME_ID = '22222222-2222-4222-8222-222222222222';
const FRIEND = '33333333-3333-4333-8333-333333333333';
const STRANGER = '66666666-6666-4666-8666-666666666666';
const REQUEST_ID = '77777777-7777-4777-8777-777777777777';
const OLD_REQUEST_ID = '88888888-8888-4888-8888-888888888888';
const INVITATION_ID = '99999999-9999-4999-8999-999999999999';
const SHORT_ID = 'abc12345';

const fake = createAdminClientMock({ tokens: { 'token-meg': ME }, respond: () => ({}) });
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

const USER_CLIENT = { scoped: 'caller' };
vi.mock('@/lib/api/appAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/appAuth')>()),
  callerScopedClient: () => USER_CLIENT,
}));

const core = {
  loadTeamDashboard: vi.fn(),
  onTeamPageVisit: vi.fn(),
  removeTeamMemberCore: vi.fn(),
  resendTeamInviteCore: vi.fn(),
  transferCaptaincyCore: vi.fn(),
  attachToCaptainTeamCore: vi.fn(),
  addTeamMemberCore: vi.fn(),
};
vi.mock('@/lib/games/teamDashboardCore', () => ({
  loadTeamDashboard: (...a: unknown[]) => core.loadTeamDashboard(...a),
  onTeamPageVisit: (...a: unknown[]) => core.onTeamPageVisit(...a),
  removeTeamMemberCore: (...a: unknown[]) => core.removeTeamMemberCore(...a),
  resendTeamInviteCore: (...a: unknown[]) => core.resendTeamInviteCore(...a),
  transferCaptaincyCore: (...a: unknown[]) => core.transferCaptaincyCore(...a),
  attachToCaptainTeamCore: (...a: unknown[]) => core.attachToCaptainTeamCore(...a),
  addTeamMemberCore: (...a: unknown[]) => core.addTeamMemberCore(...a),
}));

// #2840: the captain's friends who are in the round already («Velg en venn»).
const readUnavailableFriendIds = vi.fn();
vi.mock('@/lib/games/appTeamSignup', () => ({
  readUnavailableFriendIds: (...a: unknown[]) => readUnavailableFriendIds(...a),
}));

// next/server's after() does not exist outside the Next runtime: run it at once.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => unknown) => void fn() };
});

import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const params = { params: Promise.resolve({ shortId: SHORT_ID }) };

function get(token: string | null = 'token-meg', query = '') {
  return GET(
    new NextRequest(`http://localhost/api/pamelding/${SHORT_ID}/lag${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    params,
  );
}

function post(body: unknown, token: string | null = 'token-meg') {
  return POST(
    new NextRequest(`http://localhost/api/pamelding/${SHORT_ID}/lag`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    params,
  );
}

const CAPTAIN_VIEW = {
  kind: 'captain',
  game: {
    id: GAME_ID,
    shortId: SHORT_ID,
    name: 'Sommercup 2026',
    courseName: 'Larvik GK',
    joinEffect: 'instant',
    signupsClosed: false,
  },
  myRowId: REQUEST_ID,
  myStatus: 'approved',
  teamName: 'Martins lag',
  captain: { requestId: REQUEST_ID, userId: ME, displayName: 'Martin Hansen', status: 'approved' },
  members: [
    { requestId: OLD_REQUEST_ID, userId: FRIEND, displayName: 'ka•••@gmail.com', status: 'pending', isGuest: false },
  ],
};

const WRITES = [
  'removeTeamMemberCore',
  'resendTeamInviteCore',
  'transferCaptaincyCore',
  'attachToCaptainTeamCore',
  'addTeamMemberCore',
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  fake.reset();
  core.loadTeamDashboard.mockResolvedValue(CAPTAIN_VIEW);
  core.onTeamPageVisit.mockResolvedValue(undefined);
  readUnavailableFriendIds.mockResolvedValue([FRIEND]);
  for (const name of WRITES) core[name].mockResolvedValue({ ok: true });
});

describe('GET /api/pamelding/[shortId]/lag', () => {
  it('401 without a token, and nothing is read or marked', async () => {
    const res = await get(null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(core.loadTeamDashboard).not.toHaveBeenCalled();
    expect(core.onTeamPageVisit).not.toHaveBeenCalled();
  });

  it('the team page\'s view for the caller, then the visit is recorded as on the web', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...CAPTAIN_VIEW, unavailableFriendIds: [FRIEND] });
    expect(core.loadTeamDashboard).toHaveBeenCalledWith(SHORT_ID, ME);
    expect(readUnavailableFriendIds).toHaveBeenCalledWith(GAME_ID, ME);
    expect(core.onTeamPageVisit).toHaveBeenCalledWith(GAME_ID, ME);
  });

  it('#2840: ?visit=0 reads the team without recording a visit (the «Laget ditt» row)', async () => {
    const res = await get('token-meg', '?visit=0');
    expect(res.status).toBe(200);
    expect(core.loadTeamDashboard).toHaveBeenCalledWith(SHORT_ID, ME);
    expect(core.onTeamPageVisit).not.toHaveBeenCalled();
  });

  it('#2840: only the captain gets the friends who are in the round', async () => {
    const memberView = { ...CAPTAIN_VIEW, kind: 'member' };
    core.loadTeamDashboard.mockResolvedValue(memberView);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(memberView);
    expect(readUnavailableFriendIds).not.toHaveBeenCalled();
  });

  it('#2840: a failed read of those friends is 500, never a picker that greys out nobody', async () => {
    readUnavailableFriendIds.mockRejectedValue(new Error('boom'));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
  });

  it('404 for a missing round or a draft, and no visit is recorded', async () => {
    core.loadTeamDashboard.mockResolvedValue({ kind: 'not_found' });
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'game_not_found' });
    expect(core.onTeamPageVisit).not.toHaveBeenCalled();
  });

  it('a failed visit side effect does not fail the page', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    core.onTeamPageVisit.mockRejectedValue(new Error('boom'));
    const res = await get();
    expect(res.status).toBe(200);
    spy.mockRestore();
  });

  it('500 load_failed when the read throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    core.loadTeamDashboard.mockRejectedValue(new Error('boom'));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load_failed' });
    spy.mockRestore();
  });
});

describe('POST /api/pamelding/[shortId]/lag', () => {
  it.each([
    { intent: 'remove', requestId: REQUEST_ID },
    { intent: 'add', friendId: FRIEND },
  ])('401 without a token, and nothing is written (%o)', async (body) => {
    const res = await post(body, null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    for (const name of WRITES) expect(core[name]).not.toHaveBeenCalled();
  });

  // Whatever the body says about who and where: the token and the path decide.
  const HOSTILE = { user_id: STRANGER, userId: STRANGER, shortId: 'zzzzzzzz', game_id: 'x' };

  it.each<[string, Record<string, unknown>, (typeof WRITES)[number], unknown[], object]>([
    ['remove', { requestId: REQUEST_ID }, 'removeTeamMemberCore', [ME, { shortId: SHORT_ID, requestId: REQUEST_ID }], { status: 'removed' }],
    ['resend', { requestId: REQUEST_ID }, 'resendTeamInviteCore', [ME, { shortId: SHORT_ID, requestId: REQUEST_ID }], { status: 'resent' }],
    ['transfer', { requestId: REQUEST_ID }, 'transferCaptaincyCore', [ME, { shortId: SHORT_ID, requestId: REQUEST_ID }], { status: 'transferred' }],
    ['attach', { invitationId: INVITATION_ID }, 'attachToCaptainTeamCore', [ME, { shortId: SHORT_ID, invitationId: INVITATION_ID }, { userClient: USER_CLIENT }], { status: 'attached' }],
    ['add', { friendId: FRIEND }, 'addTeamMemberCore', [ME, { shortId: SHORT_ID, friendId: FRIEND, replaceRequestId: null }], { status: 'added' }],
  ])('%s: to its core, with the caller from the token', async (intent, fields, name, args, answer) => {
    const res = await post({ intent, ...fields, ...HOSTILE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(answer);
    expect(core[name]).toHaveBeenCalledTimes(1);
    expect(core[name]).toHaveBeenCalledWith(...args);
    for (const other of WRITES) if (other !== name) expect(core[other]).not.toHaveBeenCalled();
  });

  it('add with replaceRequestId swaps, and says whether the old row went', async () => {
    core.addTeamMemberCore.mockResolvedValue({ ok: true, replaced: false });
    const res = await post({ intent: 'add', friendId: FRIEND, replaceRequestId: OLD_REQUEST_ID });
    expect(await res.json()).toEqual({ status: 'added', replaced: false });
    expect(core.addTeamMemberCore).toHaveBeenCalledWith(ME, {
      shortId: SHORT_ID,
      friendId: FRIEND,
      replaceRequestId: OLD_REQUEST_ID,
    });
  });

  it.each<[string, unknown]>([
    ['not JSON', 'ikke json'],
    ['null', 'null'],
    ['no intent', {}],
    ['an unknown intent', { intent: 'delete_team', requestId: REQUEST_ID }],
    ['remove without a request', { intent: 'remove' }],
    ['resend with a request that is no uuid', { intent: 'resend', requestId: 'abc' }],
    ['transfer with a number', { intent: 'transfer', requestId: 7 }],
    ['attach without an invitation', { intent: 'attach' }],
    ['add without a friend', { intent: 'add' }],
    ['add with an address for a friend', { intent: 'add', friendId: 'kari@example.com' }],
    ['add with a replace that is no uuid', { intent: 'add', friendId: FRIEND, replaceRequestId: 'abc' }],
  ])('400 bad_request: %s', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
    for (const name of WRITES) expect(core[name]).not.toHaveBeenCalled();
  });

  it.each<[(typeof WRITES)[number], string, string, number, object]>([
    ['removeTeamMemberCore', 'remove', 'not_found', 404, { error: 'not_found' }],
    ['removeTeamMemberCore', 'remove', 'game_locked', 409, { error: 'game_locked' }],
    ['removeTeamMemberCore', 'remove', 'db_error', 500, { error: 'db_error' }],
    ['resendTeamInviteCore', 'resend', 'not_found', 404, { error: 'not_found' }],
    ['transferCaptaincyCore', 'transfer', 'not_found', 404, { error: 'not_found' }],
    ['transferCaptaincyCore', 'transfer', 'not_approved', 409, { error: 'not_approved' }],
    ['transferCaptaincyCore', 'transfer', 'captain_is_guest', 409, { error: 'captain_is_guest' }],
    ['transferCaptaincyCore', 'transfer', 'game_locked', 409, { error: 'game_locked' }],
    ['transferCaptaincyCore', 'transfer', 'not_authed', 401, { error: 'unauthorized' }],
    ['attachToCaptainTeamCore', 'attach', 'team_unknown', 409, { error: 'team_unknown' }],
    ['attachToCaptainTeamCore', 'attach', 'profile_incomplete', 409, { error: 'profile_incomplete' }],
    ['attachToCaptainTeamCore', 'attach', 'signup_closed', 409, { error: 'signup_closed' }],
    ['addTeamMemberCore', 'add', 'teammate_not_friend', 403, { error: 'teammate_not_friend' }],
    ['addTeamMemberCore', 'add', 'team_full', 409, { error: 'team_full' }],
    ['addTeamMemberCore', 'add', 'already_registered', 409, { error: 'already_registered' }],
    ['addTeamMemberCore', 'add', 'signup_closed', 409, { error: 'signup_closed' }],
    ['addTeamMemberCore', 'add', 'not_found', 404, { error: 'not_found' }],
    ['addTeamMemberCore', 'add', 'db_error', 500, { error: 'db_error' }],
  ])('%s → %s: %s', async (name, intent, error, status, body) => {
    core[name].mockResolvedValue({ ok: false, error });
    const fields =
      intent === 'attach' ? { invitationId: INVITATION_ID } : intent === 'add' ? { friendId: FRIEND } : { requestId: REQUEST_ID };
    const res = await post({ intent, ...fields });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
  });

  it('a core that throws is 500 db_error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    core.removeTeamMemberCore.mockRejectedValue(new Error('boom'));
    const res = await post({ intent: 'remove', requestId: REQUEST_ID });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'db_error' });
    spy.mockRestore();
  });
});

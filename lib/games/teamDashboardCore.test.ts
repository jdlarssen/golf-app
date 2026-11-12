// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * Type A (#2840): the team page's read and actions, shared by the web and the
 * app's route. The ownership checks live in the core: only the team's current
 * captain manages it, and an invitation is only ever the caller's own. Moved
 * here from `teamActions.test.ts`; new in #2840 is `addTeamMemberCore`.
 */

vi.mock('@/lib/games/joinTeeGenders');

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

const notifyInvitedToTeamMock = vi.fn<
  (...args: unknown[]) => Promise<{ shouldAlsoSendMail: boolean }>
>(async () => ({ shouldAlsoSendMail: false }));
vi.mock('@/lib/notifications/notifyInvitedToTeam', () => ({
  notifyInvitedToTeam: (...args: unknown[]) => notifyInvitedToTeamMock(...args),
}));

const readFriendIdsMock = vi.fn<(userId: string) => Promise<string[]>>();
vi.mock('@/lib/friends/getFriendIds', () => ({
  readFriendIds: (userId: string) => readFriendIdsMock(userId),
}));

const confirmMock = vi.fn(async () => {});
vi.mock('@/lib/games/confirmParticipation', () => ({
  maybeAutoConfirmParticipation: (...args: unknown[]) => confirmMock(...(args as [])),
}));
const markReadMock = vi.fn(async () => {});
vi.mock('@/lib/notifications/markRead', () => ({
  markReadOnVisit: (...args: unknown[]) => markReadMock(...(args as [])),
}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const getGameByShortIdMock = vi.fn();
vi.mock('@/lib/games/getGameByShortId', () => ({
  getGameByShortId: (shortId: string) => getGameByShortIdMock(shortId),
}));

vi.mock('@/lib/auth/registrationRateLimit', () => ({
  consumeRegistrationRateLimit: async () => ({ ok: true }),
}));

import {
  addTeamMemberCore,
  attachToCaptainTeamCore,
  loadTeamDashboard,
  onTeamPageVisit,
  removeTeamMemberCore,
  resendTeamInviteCore,
  transferCaptaincyCore,
} from './teamDashboardCore';

const CAPTAIN_ID = '11111111-1111-4111-8111-111111111111';
const GAME_ID = '22222222-2222-4222-8222-222222222222';
const CAPTAIN_REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const ORGANISER_ID = '44444444-4444-4444-8444-444444444444';
const MATE_ID = '55555555-5555-4555-8555-555555555555';
const FRIEND_ID = '66666666-6666-4666-8666-666666666666';
const CHILD_REQUEST_ID = '77777777-7777-4777-8777-777777777777';
const OLD_REQUEST_ID = '88888888-8888-4888-8888-888888888888';
const SHORT_ID = 'abc12345';
const DB_ERR = { message: 'connection reset', code: '' };

const PROFILE_OK: QueryResult = { data: { profile_completed_at: '2026-01-01T00:00:00Z' }, error: null };
const CAPTAIN_DISPLAY: QueryResult = {
  data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
  error: null,
};

function makeGame(overrides: Record<string, unknown> = {}) {
  return {
    id: GAME_ID,
    name: 'Sommercup 2026',
    short_id: SHORT_ID,
    status: 'scheduled',
    registration_mode: 'open',
    registration_type: 'team',
    game_mode: 'texas_scramble',
    mode_config: { kind: 'texas_scramble', team_size: 3, teams_count: 4, team_handicap_pct: 10 },
    signups_closed_at: null,
    scheduled_tee_off_at: '2026-06-12T15:30:00Z',
    created_by: ORGANISER_ID,
    courses: { name: 'Bjaavann' },
    ...overrides,
  };
}

function calls(table: string, method: string) {
  return adminMock.__fromCalls.filter((c) => c.table === table && c.method === method);
}
function anyWrites() {
  return adminMock.__fromCalls.filter((c) => ['insert', 'update', 'upsert', 'delete'].includes(c.method));
}
function filtersAfter(table: string, method: string): unknown[][] {
  const all = adminMock.__fromCalls;
  const start = all.findIndex((c) => c.table === table && c.method === method);
  if (start === -1) return [];
  const filters: unknown[][] = [];
  for (const call of all.slice(start + 1)) {
    if (call.method !== 'eq') break;
    filters.push(call.args);
  }
  return filters;
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock = buildSupabaseMock([]);
  getGameByShortIdMock.mockResolvedValue(makeGame());
  readFriendIdsMock.mockResolvedValue([FRIEND_ID, MATE_ID]);
});

describe('remove and resend follow the captaincy (#2358)', () => {
  const NEW_CAPTAIN_ID = '99999999-9999-4999-8999-999999999999';
  const childRow = (): QueryResult => ({
    data: {
      id: CHILD_REQUEST_ID,
      game_id: GAME_ID,
      user_id: MATE_ID,
      team_request_id: CAPTAIN_REQUEST_ID,
      team_name: 'Bjørka',
      status: 'approved',
    },
    error: null,
  });
  const captainRow = (userId: string, status = 'approved'): QueryResult => ({
    data: { user_id: userId, team_name: 'Bjørka', status },
    error: null,
  });
  const input = { shortId: SHORT_ID, requestId: CHILD_REQUEST_ID };

  it('#2840: a failed read of the teammate or the captain is db_error, not «not yours»', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);
    expect(await removeTeamMemberCore(NEW_CAPTAIN_ID, input)).toEqual({ ok: false, error: 'db_error' });
    adminMock = buildSupabaseMock([childRow(), { data: null, error: { message: 'boom' } }]);
    expect(await resendTeamInviteCore(NEW_CAPTAIN_ID, input)).toEqual({ ok: false, error: 'db_error' });
    expect(calls('game_players', 'delete')).toHaveLength(0);
    expect(calls('game_registration_requests', 'delete')).toHaveLength(0);
  });

  it('the current captain removes a teammate: roster row, then request, then a notice', async () => {
    adminMock = buildSupabaseMock([
      childRow(),
      captainRow(NEW_CAPTAIN_ID),
      { data: null, error: null },
      { data: null, error: null },
    ]);
    expect(await removeTeamMemberCore(NEW_CAPTAIN_ID, input)).toEqual({ ok: true });
    expect(calls('game_players', 'delete')).toHaveLength(1);
    expect(calls('game_registration_requests', 'delete')).toHaveLength(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: MATE_ID, kind: 'registration_rejected' }),
    );
  });

  it('a former captain manages nothing → not_found, no delete, no invite', async () => {
    adminMock = buildSupabaseMock([childRow(), captainRow(NEW_CAPTAIN_ID)]);
    expect(await removeTeamMemberCore(CAPTAIN_ID, input)).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);

    adminMock = buildSupabaseMock([childRow(), captainRow(NEW_CAPTAIN_ID)]);
    expect(await resendTeamInviteCore(CAPTAIN_ID, input)).toEqual({ ok: false, error: 'not_found' });
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });

  it('a captain who has withdrawn manages nothing → not_found', async () => {
    adminMock = buildSupabaseMock([childRow(), captainRow(CAPTAIN_ID, 'withdrawn')]);
    expect(await removeTeamMemberCore(CAPTAIN_ID, input)).toEqual({ ok: false, error: 'not_found' });
    adminMock = buildSupabaseMock([childRow(), captainRow(CAPTAIN_ID, 'withdrawn')]);
    expect(await resendTeamInviteCore(CAPTAIN_ID, input)).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
  });

  it('#2223: the roster row cannot be deleted → db_error, the request untouched', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([childRow(), captainRow(CAPTAIN_ID), { data: null, error: DB_ERR }]);
    expect(await removeTeamMemberCore(CAPTAIN_ID, input)).toEqual({ ok: false, error: 'db_error' });
    expect(calls('game_registration_requests', 'delete')).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('resend: the captain nudges the teammate with the team name', async () => {
    adminMock = buildSupabaseMock([childRow(), captainRow(CAPTAIN_ID), CAPTAIN_DISPLAY]);
    expect(await resendTeamInviteCore(CAPTAIN_ID, input)).toEqual({ ok: true });
    expect(notifyInvitedToTeamMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: MATE_ID, teamRequestId: CAPTAIN_REQUEST_ID, teamName: 'Bjørka' }),
    );
  });

  it.each([
    ['remove', removeTeamMemberCore],
    ['resend', resendTeamInviteCore],
  ] as const)('#2445: %s on a draft → not_found, nothing sent', async (_label, core) => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ status: 'draft' }));
    adminMock = buildSupabaseMock([childRow(), captainRow(CAPTAIN_ID)]);
    expect(await core(CAPTAIN_ID, input)).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });
});

describe('transferCaptaincyCore (#2358)', () => {
  const NEW_CAPTAIN_REQUEST = '99999999-9999-4999-8999-999999999999';
  const input = { shortId: SHORT_ID, requestId: NEW_CAPTAIN_REQUEST };

  it('sends the caller as the actor, and empties the cache on ok', async () => {
    adminMock = buildSupabaseMock([], { transfer_team_captaincy: { outcome: 'ok' } });
    expect(await transferCaptaincyCore(CAPTAIN_ID, input)).toEqual({ ok: true });
    expect(adminMock.__rpcCalls).toEqual([
      {
        name: 'transfer_team_captaincy',
        params: { p_game_id: GAME_ID, p_actor_user_id: CAPTAIN_ID, p_new_captain_request_id: NEW_CAPTAIN_REQUEST },
      },
    ]);
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it.each([
    ['not_approved', 'not_approved'],
    ['new_captain_is_guest', 'captain_is_guest'],
    ['game_locked', 'game_locked'],
    ['not_allowed', 'not_found'],
    ['not_a_teammate', 'not_found'],
    ['game_not_found', 'not_found'],
    ['noe_ukjent', 'db_error'],
  ])('outcome %s → %s, no cache expiry', async (outcome, error) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([], { transfer_team_captaincy: { outcome } });
    expect(await transferCaptaincyCore(CAPTAIN_ID, input)).toEqual({ ok: false, error });
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('an RPC error → db_error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([], {}, { rpcErrors: { transfer_team_captaincy: { message: 'boom' } } });
    expect(await transferCaptaincyCore(CAPTAIN_ID, input)).toEqual({ ok: false, error: 'db_error' });
  });

  it('a request id that is not a uuid, or a draft → not_found, no RPC', async () => {
    expect(await transferCaptaincyCore(CAPTAIN_ID, { shortId: SHORT_ID, requestId: 'nope' })).toEqual({
      ok: false,
      error: 'not_found',
    });
    getGameByShortIdMock.mockResolvedValue(makeGame({ status: 'draft' }));
    expect(await transferCaptaincyCore(CAPTAIN_ID, input)).toEqual({ ok: false, error: 'not_found' });
    expect(adminMock.__rpcCalls).toEqual([]);
  });
});

describe('attachToCaptainTeamCore', () => {
  const INVITEE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const INVITEE_EMAIL = 'ny.spiller@example.com';
  const OTHER_CAPTAIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const OTHER_REQUEST_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  let userClient: ReturnType<typeof buildSupabaseMock>;

  const invitation = (invitedBy: string): QueryResult => ({
    data: { id: 'inv-1', email: INVITEE_EMAIL, game_id: GAME_ID, invited_by: invitedBy },
    error: null,
  });
  const ownEmail: QueryResult = { data: { email: INVITEE_EMAIL }, error: null };
  const captains = (...rows: Array<{ id: string; user_id: string; team_name: string; status: string }>): QueryResult => ({
    data: rows,
    error: null,
  });
  const ourCaptain = { id: CAPTAIN_REQUEST_ID, user_id: CAPTAIN_ID, team_name: 'Lag A', status: 'approved' };

  function attach() {
    return attachToCaptainTeamCore(
      INVITEE_ID,
      { shortId: SHORT_ID, invitationId: 'inv-1' },
      { userClient: userClient as unknown as SupabaseClient<Database> },
    );
  }

  beforeEach(() => {
    userClient = buildSupabaseMock([]);
  });

  it("#2840: an e-mail invitation sent before the friends rule still attaches the invitee to that captain's team, without a friendship", async () => {
    // The invitee and the captain are not friends.
    readFriendIdsMock.mockResolvedValue([]);
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      invitation(CAPTAIN_ID),
      ownEmail,
      captains(ourCaptain),
      { data: { id: 'child-1' }, error: null }, // child insert
      { data: { team_number: 2, flight_number: 2, withdrawn_at: null }, error: null }, // captain's roster row
      { data: null, error: null }, // game_players upsert
      { data: null, error: null }, // invitation accepted
    ]);

    expect(await attach()).toEqual({ ok: true });
    expect(readFriendIdsMock).not.toHaveBeenCalled();
    expect(calls('game_registration_requests', 'insert')[0]?.args[0]).toMatchObject({
      user_id: INVITEE_ID,
      team_request_id: CAPTAIN_REQUEST_ID,
      is_team_captain: false,
      status: 'approved',
    });
    expect(calls('game_players', 'upsert')[0]?.args[0]).toMatchObject({ user_id: INVITEE_ID, team_number: 2 });
    // befriend_inviter runs with the caller's own client, never the admin one.
    expect(userClient.__rpcCalls).toEqual([{ name: 'befriend_inviter', params: { p_inviter: CAPTAIN_ID } }]);
    expect(adminMock.__rpcCalls).toEqual([]);
  });

  it("#1343: picks the inviting captain's team even when another team is newer", async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      invitation(CAPTAIN_ID),
      ownEmail,
      captains(
        { id: OTHER_REQUEST_ID, user_id: OTHER_CAPTAIN_ID, team_name: 'Lag Sist', status: 'pending' },
        { ...ourCaptain, status: 'pending' },
      ),
      { data: { id: 'child-1' }, error: null },
      { data: null, error: null },
    ]);
    expect(await attach()).toEqual({ ok: true });
    expect(calls('game_registration_requests', 'insert')[0]?.args[0]).toMatchObject({
      team_request_id: CAPTAIN_REQUEST_ID,
      team_name: 'Lag A',
      status: 'pending',
    });
    expect(calls('game_players', 'upsert')).toEqual([]);
  });

  it('#1343: the inviter is not a captain → team_unknown, nothing inserted', async () => {
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      invitation(ORGANISER_ID),
      ownEmail,
      captains({ id: OTHER_REQUEST_ID, user_id: OTHER_CAPTAIN_ID, team_name: 'Lag Sist', status: 'pending' }),
      { data: [], error: null }, // the inviter-teams map: nothing
    ]);
    expect(await attach()).toEqual({ ok: false, error: 'team_unknown' });
    expect(anyWrites()).toEqual([]);
  });

  it('#1437: the invitation read enforces expiry (.gt on expires_at)', async () => {
    adminMock = buildSupabaseMock([PROFILE_OK, { data: null, error: null }]);
    expect(await attach()).toEqual({ ok: false, error: 'not_found' });
    const expiry = adminMock.__fromCalls.find(
      (c) => c.table === 'invitations' && c.method === 'gt' && c.args[0] === 'expires_at',
    );
    expect(expiry).toBeDefined();
  });

  it("an invitation for another address → not_found, nothing written", async () => {
    adminMock = buildSupabaseMock([PROFILE_OK, invitation(CAPTAIN_ID), { data: { email: 'annen@example.com' }, error: null }]);
    expect(await attach()).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
  });

  it("#2358: the inviter handed on the captaincy → the team under the new captain", async () => {
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      invitation(CAPTAIN_ID),
      ownEmail,
      captains({ id: OTHER_REQUEST_ID, user_id: OTHER_CAPTAIN_ID, team_name: 'Bjørka', status: 'approved' }),
      { data: [{ user_id: CAPTAIN_ID, team_request_id: OTHER_REQUEST_ID }], error: null },
      { data: { id: 'child-1' }, error: null },
      { data: { team_number: 3 }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    expect(await attach()).toEqual({ ok: true });
    expect(calls('game_registration_requests', 'insert')[0]?.args[0]).toMatchObject({
      team_request_id: OTHER_REQUEST_ID,
      team_name: 'Bjørka',
    });
    expect(calls('game_players', 'upsert')[0]?.args[0]).toMatchObject({ team_number: 3 });
  });

  it("best ball: the invitee gets the captain's flight (#2290)", async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ game_mode: 'best_ball', mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 } }),
    );
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      invitation(CAPTAIN_ID),
      ownEmail,
      captains(ourCaptain),
      { data: { id: 'child-1' }, error: null },
      { data: { team_number: 2, flight_number: 1, withdrawn_at: null }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
    expect(await attach()).toEqual({ ok: true });
    expect(calls('game_players', 'upsert')[0]?.args[0]).toMatchObject({ team_number: 2, flight_number: 1 });
  });

  it('an approved captain without a team number → no game_players row', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      invitation(CAPTAIN_ID),
      ownEmail,
      captains(ourCaptain),
      { data: { id: 'child-1' }, error: null },
      { data: { team_number: null }, error: null },
      { data: null, error: null },
    ]);
    expect(await attach()).toEqual({ ok: true });
    expect(calls('game_players', 'upsert')).toEqual([]);
  });

  it.each([
    ["the captain's roster row cannot be read", [{ data: null, error: DB_ERR }]],
    ['the roster row cannot be written', [{ data: { team_number: 1 }, error: null }, { data: null, error: DB_ERR }]],
  ])('#2223: %s → db_error, the request rolled back, invitation kept', async (_label, steps) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      invitation(CAPTAIN_ID),
      ownEmail,
      captains(ourCaptain),
      { data: { id: CHILD_REQUEST_ID }, error: null },
      ...(steps as QueryResult[]),
      { data: [{ id: CHILD_REQUEST_ID }], error: null }, // rollback .select('id')
    ]);
    expect(await attach()).toEqual({ ok: false, error: 'db_error' });
    expect(filtersAfter('game_registration_requests', 'delete')).toEqual([['id', CHILD_REQUEST_ID]]);
    expect(calls('invitations', 'update')).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(userClient.__rpcCalls).toEqual([]);
  });

  it.each([
    ['#543 closed signups', { signups_closed_at: '2026-06-11T10:00:00Z' }, 'signup_closed'],
    ['#2445 draft', { status: 'draft' }, 'not_found'],
  ] as const)('%s → %s, nothing written', async (_label, overrides, error) => {
    getGameByShortIdMock.mockResolvedValue(makeGame(overrides));
    adminMock = buildSupabaseMock([PROFILE_OK, invitation(CAPTAIN_ID), ownEmail, captains(ourCaptain)]);
    expect(await attach()).toEqual({ ok: false, error });
    expect(anyWrites()).toEqual([]);
  });

  it('profile not complete → profile_incomplete', async () => {
    adminMock = buildSupabaseMock([{ data: { profile_completed_at: null }, error: null }]);
    expect(await attach()).toEqual({ ok: false, error: 'profile_incomplete' });
    expect(anyWrites()).toEqual([]);
  });
});

describe('#2840: addTeamMemberCore — fill a free seat with a friend', () => {
  const activeCaptain = (status = 'approved'): QueryResult => ({
    data: { id: CAPTAIN_REQUEST_ID, status, team_name: 'Lag A' },
    error: null,
  });
  const team = (...rows: Array<{ id: string; user_id: string; status: string }>): QueryResult => ({
    data: rows,
    error: null,
  });
  const liveFriend: QueryResult = { data: [{ id: FRIEND_ID }], error: null };
  const notInRound: QueryResult[] = [
    { data: null, error: null }, // request for the friend in this game
    { data: null, error: null }, // roster row for the friend in this game
  ];

  function add(over: { friendId?: string; replaceRequestId?: string } = {}) {
    return addTeamMemberCore(CAPTAIN_ID, { shortId: SHORT_ID, friendId: FRIEND_ID, ...over });
  }

  it('open mode: the friend joins with the captain\'s status, team and flight, gets the invite', async () => {
    adminMock = buildSupabaseMock([
      activeCaptain(),
      team({ id: CHILD_REQUEST_ID, user_id: MATE_ID, status: 'approved' }),
      liveFriend,
      ...notInRound,
      { data: { team_number: 4, flight_number: 4, withdrawn_at: null }, error: null }, // captain's roster row
      CAPTAIN_DISPLAY,
      { data: null, error: null }, // child insert
      { data: null, error: null }, // game_players upsert
    ]);

    expect(await add()).toEqual({ ok: true });
    expect(calls('game_registration_requests', 'insert')[0]?.args[0]).toMatchObject({
      user_id: FRIEND_ID,
      status: 'approved',
      team_request_id: CAPTAIN_REQUEST_ID,
      team_name: 'Lag A',
      is_team_captain: false,
    });
    expect(calls('game_players', 'upsert')[0]?.args[0]).toMatchObject({
      user_id: FRIEND_ID,
      team_number: 4,
      flight_number: 4,
    });
    expect(notifyInvitedToTeamMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: FRIEND_ID, teamRequestId: CAPTAIN_REQUEST_ID }),
    );
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('a pending captain (manual approval): the friend waits as pending, no game_players row', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
    adminMock = buildSupabaseMock([
      activeCaptain('pending'),
      team(),
      liveFriend,
      ...notInRound,
      CAPTAIN_DISPLAY,
      { data: null, error: null }, // child insert
    ]);
    expect(await add()).toEqual({ ok: true });
    expect(calls('game_registration_requests', 'insert')[0]?.args[0]).toMatchObject({ status: 'pending' });
    expect(adminMock.__fromCalls.filter((c) => c.table === 'game_players' && c.method === 'upsert')).toEqual([]);
  });

  it('not a friend → teammate_not_friend, nothing written', async () => {
    readFriendIdsMock.mockResolvedValue([MATE_ID]);
    adminMock = buildSupabaseMock([activeCaptain(), team(), liveFriend, ...notInRound]);
    expect(await add()).toEqual({ ok: false, error: 'teammate_not_friend' });
    expect(anyWrites()).toEqual([]);
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });

  it('the friend read fails → db_error, nothing written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    readFriendIdsMock.mockRejectedValue(new Error('boom'));
    adminMock = buildSupabaseMock([activeCaptain(), team()]);
    expect(await add()).toEqual({ ok: false, error: 'db_error' });
    expect(anyWrites()).toEqual([]);
  });

  it('the caller is not a captain in this game → not_found, nothing written', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: null }]);
    expect(await add()).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
  });

  it.each(['withdrawn', 'rejected'])('a %s captain → not_found', async (status) => {
    adminMock = buildSupabaseMock([activeCaptain(status)]);
    expect(await add()).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
  });

  it.each([
    ['an active game', { status: 'active' }, 'game_locked'],
    ['closed signups', { signups_closed_at: '2026-06-11T10:00:00Z' }, 'signup_closed'],
  ] as const)('%s → %s', async (_label, overrides, error) => {
    getGameByShortIdMock.mockResolvedValue(makeGame(overrides));
    adminMock = buildSupabaseMock([activeCaptain()]);
    expect(await add()).toEqual({ ok: false, error });
    expect(anyWrites()).toEqual([]);
  });

  it('#2445: a draft → not_found', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ status: 'draft' }));
    expect(await add()).toEqual({ ok: false, error: 'not_found' });
    expect(adminMock.__fromCalls).toEqual([]);
  });

  it('every seat taken (pending or approved) → team_full, nothing written', async () => {
    adminMock = buildSupabaseMock([
      activeCaptain(),
      team(
        { id: CHILD_REQUEST_ID, user_id: MATE_ID, status: 'approved' },
        { id: OLD_REQUEST_ID, user_id: 'x', status: 'pending' },
      ),
    ]);
    expect(await add()).toEqual({ ok: false, error: 'team_full' });
    expect(anyWrites()).toEqual([]);
    expect(readFriendIdsMock).not.toHaveBeenCalled();
  });

  it('a friend already in the round → already_registered, nothing written', async () => {
    adminMock = buildSupabaseMock([
      activeCaptain(),
      team(),
      liveFriend,
      { data: null, error: null },
      { data: { user_id: FRIEND_ID }, error: null }, // the organiser put them on the roster
    ]);
    expect(await add()).toEqual({ ok: false, error: 'already_registered' });
    expect(anyWrites()).toEqual([]);
  });

  it('the roster row cannot be written → db_error, the child row deleted again, no invite', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      activeCaptain(),
      team(),
      liveFriend,
      ...notInRound,
      { data: { team_number: 4, flight_number: 4, withdrawn_at: null }, error: null },
      CAPTAIN_DISPLAY,
      { data: null, error: null }, // child insert
      { data: null, error: DB_ERR }, // upsert fails
      { data: [{ id: 'new-child' }], error: null }, // rollback .select('id')
    ]);
    expect(await add()).toEqual({ ok: false, error: 'db_error' });
    expect(filtersAfter('game_registration_requests', 'delete')).toEqual([
      ['team_request_id', CAPTAIN_REQUEST_ID],
      ['user_id', FRIEND_ID],
    ]);
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });

  it('replace: a teammate who said no is swapped — the declined row frees its seat and is deleted after the new write', async () => {
    adminMock = buildSupabaseMock([
      activeCaptain(),
      // Team of 3: one approved, one rejected. The rejected row holds no seat.
      team(
        { id: CHILD_REQUEST_ID, user_id: MATE_ID, status: 'approved' },
        { id: OLD_REQUEST_ID, user_id: 'gone', status: 'rejected' },
      ),
      liveFriend,
      ...notInRound,
      { data: { team_number: 4, flight_number: 4, withdrawn_at: null }, error: null },
      CAPTAIN_DISPLAY,
      { data: null, error: null }, // child insert
      { data: null, error: null }, // upsert
      { data: [{ id: OLD_REQUEST_ID }], error: null }, // old row delete .select('id')
    ]);
    expect(await add({ replaceRequestId: OLD_REQUEST_ID })).toEqual({ ok: true, replaced: true });
    const order = adminMock.__fromCalls
      .filter((c) => ['insert', 'upsert', 'delete'].includes(c.method))
      .map((c) => `${c.table}.${c.method}`);
    expect(order).toEqual([
      'game_registration_requests.insert',
      'game_players.upsert',
      'game_registration_requests.delete',
    ]);
    expect(filtersAfter('game_registration_requests', 'delete')).toEqual([
      ['id', OLD_REQUEST_ID],
      ['team_request_id', CAPTAIN_REQUEST_ID],
    ]);
  });

  it('replace: the old row delete matches 0 rows → ok, replaced false (said out loud)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      activeCaptain('pending'),
      team({ id: OLD_REQUEST_ID, user_id: 'gone', status: 'withdrawn' }),
      liveFriend,
      ...notInRound,
      CAPTAIN_DISPLAY,
      { data: null, error: null }, // child insert
      { data: [], error: null }, // old row delete: 0 rows
    ]);
    expect(await add({ replaceRequestId: OLD_REQUEST_ID })).toEqual({ ok: true, replaced: false });
  });

  it.each([
    ['not on the team', team({ id: CHILD_REQUEST_ID, user_id: MATE_ID, status: 'approved' })],
    ['still active', team({ id: OLD_REQUEST_ID, user_id: MATE_ID, status: 'approved' })],
  ])('replace with a row %s → not_found, nothing written', async (_label, children) => {
    adminMock = buildSupabaseMock([activeCaptain(), children]);
    expect(await add({ replaceRequestId: OLD_REQUEST_ID })).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
  });
});

describe('loadTeamDashboard', () => {
  const myRow = (over: Record<string, unknown>): QueryResult => ({
    data: {
      id: CAPTAIN_REQUEST_ID,
      user_id: CAPTAIN_ID,
      status: 'approved',
      is_team_captain: true,
      team_name: 'Lag A',
      team_request_id: null,
      ...over,
    },
    error: null,
  });

  it('#2445: a draft or a missing game → not_found', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ status: 'draft' }));
    expect(await loadTeamDashboard(SHORT_ID, CAPTAIN_ID)).toEqual({ kind: 'not_found' });
    getGameByShortIdMock.mockResolvedValue(null);
    expect(await loadTeamDashboard(SHORT_ID, CAPTAIN_ID)).toEqual({ kind: 'not_found' });
  });

  it('#2840: a failed read throws instead of reading as «no team»', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);
    await expect(loadTeamDashboard(SHORT_ID, CAPTAIN_ID)).rejects.toThrow();

    adminMock = buildSupabaseMock([myRow({}), { data: null, error: { message: 'boom' } }]);
    await expect(loadTeamDashboard(SHORT_ID, CAPTAIN_ID)).rejects.toThrow();
  });

  it('the captain sees the team; a nameless teammate shows masked, an unknown user reads as a guest', async () => {
    adminMock = buildSupabaseMock([
      myRow({}),
      {
        data: [
          { id: CAPTAIN_REQUEST_ID, user_id: CAPTAIN_ID, status: 'approved', is_team_captain: true, team_name: 'Lag A', team_request_id: null },
          { id: CHILD_REQUEST_ID, user_id: MATE_ID, status: 'pending', is_team_captain: false, team_name: 'Lag A', team_request_id: CAPTAIN_REQUEST_ID },
          { id: OLD_REQUEST_ID, user_id: FRIEND_ID, status: 'approved', is_team_captain: false, team_name: 'Lag A', team_request_id: CAPTAIN_REQUEST_ID },
        ],
        error: null,
      },
      {
        data: [
          { id: CAPTAIN_ID, name: 'Kari Kaptein', email: 'kari@example.com', nickname: null, is_guest: false },
          { id: MATE_ID, name: null, email: 'mate@example.com', nickname: null, is_guest: false },
        ],
        error: null,
      },
    ]);

    const view = await loadTeamDashboard(SHORT_ID, CAPTAIN_ID);

    expect(view).toMatchObject({
      kind: 'captain',
      myRowId: CAPTAIN_REQUEST_ID,
      myStatus: 'approved',
      teamName: 'Lag A',
      // #2840: the team size and tee-off, for the app's free seats and its line under the title.
      game: {
        id: GAME_ID,
        joinEffect: 'instant',
        signupsClosed: false,
        courseName: 'Bjaavann',
        teamSize: 3,
        teeOffAt: '2026-06-12T15:30:00Z',
      },
      captain: { requestId: CAPTAIN_REQUEST_ID, userId: CAPTAIN_ID, displayName: 'Kari Kaptein' },
    });
    if (view.kind !== 'captain') return;
    expect(view.members).toEqual([
      expect.objectContaining({ userId: MATE_ID, status: 'pending', isGuest: false }),
      expect.objectContaining({ userId: FRIEND_ID, displayName: null, isGuest: true }),
    ]);
    // #2207: never the full address.
    expect(view.members[0]?.displayName).not.toContain('mate@example.com');
    expect(view.members[0]?.displayName).toBeTruthy();
  });

  it('a teammate gets the member view of the captain\'s team', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'manual_approval',
        signups_closed_at: '2026-06-11T10:00:00Z',
        scheduled_tee_off_at: null,
        mode_config: { kind: 'texas_scramble' },
      }),
    );
    adminMock = buildSupabaseMock([
      myRow({ id: CHILD_REQUEST_ID, user_id: MATE_ID, is_team_captain: false, team_request_id: CAPTAIN_REQUEST_ID, status: 'pending' }),
      { data: [], error: null },
      { data: [], error: null },
    ]);
    expect(await loadTeamDashboard(SHORT_ID, MATE_ID)).toMatchObject({
      kind: 'member',
      myRowId: CHILD_REQUEST_ID,
      myStatus: 'pending',
      // #2840: no team size in the config, no tee-off: both null, never a guess.
      game: { joinEffect: 'approval', signupsClosed: true, teamSize: null, teeOffAt: null },
    });
  });

  it('a solo request → solo', async () => {
    adminMock = buildSupabaseMock([myRow({ is_team_captain: false, team_request_id: null })]);
    expect(await loadTeamDashboard(SHORT_ID, CAPTAIN_ID)).toMatchObject({ kind: 'solo' });
  });

  it('no row and no invitation → no_team', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: null }, { data: { email: 'x@example.com' }, error: null }, { data: [], error: null }]);
    expect(await loadTeamDashboard(SHORT_ID, MATE_ID)).toMatchObject({ kind: 'no_team' });
  });

  it("an invitation from a captain → invited_unknown with the captain's team", async () => {
    adminMock = buildSupabaseMock([
      { data: null, error: null },
      { data: { email: 'mate@example.com' }, error: null },
      { data: [{ id: 'inv-1', email: 'mate@example.com', invited_by: CAPTAIN_ID }], error: null },
      { data: [{ id: CAPTAIN_REQUEST_ID, user_id: CAPTAIN_ID, team_name: 'Lag A', status: 'approved' }], error: null },
      { data: [], error: null }, // inviter-teams map
      CAPTAIN_DISPLAY,
    ]);
    expect(await loadTeamDashboard(SHORT_ID, MATE_ID)).toMatchObject({
      kind: 'invited_unknown',
      invitationId: 'inv-1',
      teamName: 'Lag A',
      captainName: 'Kaptein',
    });
  });

  it('#1343: an invitation from the organiser → team_unknown (no captain at all → noCaptain)', async () => {
    adminMock = buildSupabaseMock([
      { data: null, error: null },
      { data: { email: 'mate@example.com' }, error: null },
      { data: [{ id: 'inv-1', email: 'mate@example.com', invited_by: ORGANISER_ID }], error: null },
      { data: [], error: null }, // no captains
    ]);
    expect(await loadTeamDashboard(SHORT_ID, MATE_ID)).toMatchObject({ kind: 'team_unknown', noCaptain: true });
  });
});

describe('onTeamPageVisit', () => {
  it('confirms the seat first, then marks the team varsler read', async () => {
    const order: string[] = [];
    confirmMock.mockImplementation(async () => {
      order.push('confirm');
    });
    markReadMock.mockImplementation(async () => {
      order.push('markRead');
    });
    await onTeamPageVisit(GAME_ID, MATE_ID);
    expect(confirmMock).toHaveBeenCalledWith({ gameId: GAME_ID, userId: MATE_ID });
    expect(markReadMock).toHaveBeenCalledWith({ userId: MATE_ID, surface: 'teamSignup', entityId: GAME_ID });
    expect(order).toEqual(['confirm', 'markRead']);
  });
});

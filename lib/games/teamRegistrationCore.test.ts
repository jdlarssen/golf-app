// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * Type A (#2840): the team registration core behind the signup page and the
 * app's routes. Moved here from `teamActions.test.ts`, which now holds only the
 * web wrapper (redirects, honeypot). New in #2840: a teammate is always a
 * friend of the captain, checked before any write.
 */

// #2209: the shared double (lib/games/__mocks__) — the real helper would eat
// this file's queued Supabase answers with its two reads.
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

// The friend rule's input, stubbed at the module boundary.
const readFriendIdsMock = vi.fn<(userId: string) => Promise<string[]>>();
vi.mock('@/lib/friends/getFriendIds', () => ({
  readFriendIds: (userId: string) => readFriendIdsMock(userId),
}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const getGameByShortIdMock = vi.fn();
vi.mock('@/lib/games/getGameByShortId', () => ({
  getGameByShortId: (shortId: string) => getGameByShortIdMock(shortId),
}));

const consumeRateLimitMock = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean }>>(
  async () => ({ ok: true }),
);
vi.mock('@/lib/auth/registrationRateLimit', () => ({
  consumeRegistrationRateLimit: (...args: unknown[]) => consumeRateLimitMock(...args),
}));

import {
  acceptTeamInviteCore,
  declineTeamInviteCore,
  submitTeamRegistrationCore,
} from './teamRegistrationCore';

const CAPTAIN_ID = '11111111-1111-4111-8111-111111111111';
const GAME_ID = '22222222-2222-4222-8222-222222222222';
const CAPTAIN_REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_USER_ID = '44444444-4444-4444-8444-444444444444';
const FRIEND_A = '55555555-5555-4555-8555-555555555555';
const FRIEND_B = '66666666-6666-4666-8666-666666666666';
const FRIEND_C = '77777777-7777-4777-8777-777777777777';
const STRANGER = '88888888-8888-4888-8888-888888888888';
const SHORT_ID = 'abc12345';
const CTX = { ip: '203.0.113.7' };

const PROFILE_OK: QueryResult = { data: { profile_completed_at: '2026-01-01T00:00:00Z' }, error: null };
const CAPTAIN_DISPLAY: QueryResult = {
  data: { name: 'Kaptein', nickname: null, email: 'kaptein@example.com' },
  error: null,
};
const liveUsers = (...ids: string[]): QueryResult => ({ data: ids.map((id) => ({ id })), error: null });

function makeGame(overrides: Record<string, unknown> = {}) {
  return {
    id: GAME_ID,
    name: 'Sommercup 2026',
    short_id: SHORT_ID,
    status: 'scheduled',
    registration_mode: 'open',
    registration_type: 'team',
    game_mode: 'texas_scramble',
    mode_config: { kind: 'texas_scramble', team_size: 4, teams_count: 4, team_handicap_pct: 10 },
    course_id: 'course-id',
    scheduled_tee_off_at: null,
    signups_closed_at: null,
    created_by: ADMIN_USER_ID,
    ...overrides,
  };
}

/** Texas à 2: one teammate. */
const PAIRS = { kind: 'texas_scramble', team_size: 2, teams_count: 4, team_handicap_pct: 25 };

function submit(memberIds: string[], teamName = 'Birdie-jegerne') {
  return submitTeamRegistrationCore(CAPTAIN_ID, { shortId: SHORT_ID, teamName, memberIds }, CTX);
}

function calls(table: string, method: string) {
  return adminMock.__fromCalls.filter((c) => c.table === table && c.method === method);
}

/** Every write the core can make, on any table, plus the RPCs. */
function anyWrites() {
  return adminMock.__fromCalls.filter((c) => ['insert', 'update', 'upsert', 'delete'].includes(c.method));
}

/** The `eq` filters chained right after the first `method` call on `table`. */
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
  readFriendIdsMock.mockResolvedValue([FRIEND_A, FRIEND_B, FRIEND_C]);
  consumeRateLimitMock.mockResolvedValue({ ok: true });
});

describe('#2840: a teammate must be a friend of the captain', () => {
  it('a member who is not a friend → teammate_not_friend, nothing written', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    adminMock = buildSupabaseMock([PROFILE_OK, liveUsers(FRIEND_A, FRIEND_B, STRANGER)], {
      claim_open_registration_seat: { outcome: 'ok', team_number: 1 },
    });

    const result = await submit([FRIEND_A, STRANGER, FRIEND_B]);

    expect(result).toEqual({ ok: false, error: 'teammate_not_friend' });
    expect(readFriendIdsMock).toHaveBeenCalledWith(CAPTAIN_ID);
    expect(anyWrites()).toEqual([]);
    expect(adminMock.__rpcCalls).toEqual([]);
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });

  it('the friend read fails → db_error, nothing written (never «no friends»)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getGameByShortIdMock.mockResolvedValue(makeGame());
    readFriendIdsMock.mockRejectedValue(new Error('connection reset'));
    adminMock = buildSupabaseMock([PROFILE_OK, liveUsers(FRIEND_A, FRIEND_B, FRIEND_C)]);

    const result = await submit([FRIEND_A, FRIEND_B, FRIEND_C]);

    expect(result).toEqual({ ok: false, error: 'db_error' });
    expect(anyWrites()).toEqual([]);
    expect(adminMock.__rpcCalls).toEqual([]);
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });

  it('a friend whose account is deleted → teammate_not_friend, nothing written', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    // The users read filters deleted_at is null, so FRIEND_C does not come back.
    adminMock = buildSupabaseMock([PROFILE_OK, liveUsers(FRIEND_A, FRIEND_B)]);

    const result = await submit([FRIEND_A, FRIEND_B, FRIEND_C]);

    expect(result).toEqual({ ok: false, error: 'teammate_not_friend' });
    expect(anyWrites()).toEqual([]);
    const usersRead = adminMock.__fromCalls.filter((c) => c.table === 'users');
    expect(usersRead).toContainEqual(expect.objectContaining({ method: 'is', args: ['deleted_at', null] }));
  });

  it('the users read fails → db_error, nothing written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getGameByShortIdMock.mockResolvedValue(makeGame());
    adminMock = buildSupabaseMock([PROFILE_OK, { data: null, error: { message: 'boom' } }]);

    expect(await submit([FRIEND_A, FRIEND_B, FRIEND_C])).toEqual({ ok: false, error: 'db_error' });
    expect(anyWrites()).toEqual([]);
  });

  it('the same friend twice → duplicate_members, nothing read or written', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    adminMock = buildSupabaseMock([PROFILE_OK]);

    expect(await submit([FRIEND_A, FRIEND_A, FRIEND_B])).toEqual({
      ok: false,
      error: 'duplicate_members',
    });
    expect(readFriendIdsMock).not.toHaveBeenCalled();
    expect(anyWrites()).toEqual([]);
  });

  it('the captain in a seat → self_in_slots', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    adminMock = buildSupabaseMock([PROFILE_OK]);

    expect(await submit([FRIEND_A, CAPTAIN_ID, FRIEND_B])).toEqual({
      ok: false,
      error: 'self_in_slots',
    });
    expect(anyWrites()).toEqual([]);
  });

  it('the wrong number of members → slots_count_wrong', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
    adminMock = buildSupabaseMock([PROFILE_OK]);

    expect(await submit([FRIEND_A, FRIEND_B])).toEqual({ ok: false, error: 'slots_count_wrong' });
    expect(anyWrites()).toEqual([]);
  });

  it('no e-mail invitation is ever written from the team submit', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ mode_config: PAIRS }));
    adminMock = buildSupabaseMock(
      [
        PROFILE_OK,
        liveUsers(FRIEND_A),
        { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
        CAPTAIN_DISPLAY,
        { data: null, error: null }, // child insert
        { data: null, error: null }, // child upsert
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 1 } },
    );

    expect((await submit([FRIEND_A])).ok).toBe(true);
    expect(adminMock.__fromCalls.filter((c) => c.table === 'invitations')).toEqual([]);
  });
});

describe('submitTeamRegistrationCore — input and game gates', () => {
  it('a bad short id → game_not_found, no reads', async () => {
    const result = await submitTeamRegistrationCore(
      CAPTAIN_ID,
      { shortId: 'NOPE', teamName: 'Lag A', memberIds: [] },
      CTX,
    );
    expect(result).toEqual({ ok: false, error: 'game_not_found' });
    expect(adminMock.__fromCalls).toEqual([]);
  });

  it.each([['AB'], ['x'.repeat(41)]])('team name «%s» → team_name_invalid', async (teamName) => {
    expect(await submit([FRIEND_A], teamName)).toEqual({ ok: false, error: 'team_name_invalid' });
  });

  it('profile not complete → profile_incomplete, no game read', async () => {
    adminMock = buildSupabaseMock([{ data: { profile_completed_at: null }, error: null }]);
    expect(await submit([FRIEND_A])).toEqual({ ok: false, error: 'profile_incomplete' });
    expect(getGameByShortIdMock).not.toHaveBeenCalled();
  });

  it('the profile read fails → db_error, not profile_incomplete', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([{ data: null, error: { message: 'boom' } }]);
    expect(await submit([FRIEND_A])).toEqual({ ok: false, error: 'db_error' });
  });

  it.each([
    ['solo-only game', { registration_type: 'solo' }, 'wrong_type'],
    ['invite_only', { registration_mode: 'invite_only' }, 'wrong_mode'],
    ['active game', { status: 'active' }, 'game_locked'],
    ['#543 closed signups', { signups_closed_at: '2026-06-11T10:00:00Z' }, 'signup_closed'],
    ['stableford', { game_mode: 'stableford', mode_config: { kind: 'stableford' } }, 'mode_does_not_support_teams'],
    ['#2445 draft', { status: 'draft' }, 'game_not_found'],
  ] as const)('%s → %s', async (_label, overrides, error) => {
    getGameByShortIdMock.mockResolvedValue(makeGame(overrides));
    adminMock = buildSupabaseMock([PROFILE_OK]);
    expect(await submit([FRIEND_A, FRIEND_B, FRIEND_C])).toEqual({ ok: false, error });
    expect(anyWrites()).toEqual([]);
  });

  it('rate limited → rate_limited, the bucket gets the IP from ctx, nothing written', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ mode_config: PAIRS }));
    consumeRateLimitMock.mockResolvedValue({ ok: false });
    adminMock = buildSupabaseMock([PROFILE_OK, liveUsers(FRIEND_A)]);

    expect(await submit([FRIEND_A])).toEqual({ ok: false, error: 'rate_limited' });
    expect(consumeRateLimitMock).toHaveBeenCalledWith({
      userId: CAPTAIN_ID,
      ip: CTX.ip,
      gameId: GAME_ID,
    });
    expect(anyWrites()).toEqual([]);
  });
});

describe('submitTeamRegistrationCore — writes', () => {
  it('open mode: captain and friends on the same team number and flight, invites and cache', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ mode_config: { ...PAIRS, team_size: 3 } }));
    adminMock = buildSupabaseMock(
      [
        PROFILE_OK,
        liveUsers(FRIEND_A, FRIEND_B),
        { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
        CAPTAIN_DISPLAY,
        { data: null, error: null }, // child A insert
        { data: null, error: null }, // child A upsert
        { data: null, error: null }, // child B insert
        { data: null, error: null }, // child B upsert
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 3 } },
    );

    const result = await submit([FRIEND_A, FRIEND_B]);

    expect(result).toEqual({
      ok: true,
      captainRequestId: CAPTAIN_REQUEST_ID,
      slotResults: [
        { ok: true, outcome: 'known_added', userId: FRIEND_A },
        { ok: true, outcome: 'known_added', userId: FRIEND_B },
      ],
    });
    expect(calls('game_registration_requests', 'insert')[0]?.args[0]).toMatchObject({
      user_id: CAPTAIN_ID,
      status: 'approved',
      is_team_captain: true,
      team_name: 'Birdie-jegerne',
    });
    expect(calls('game_registration_requests', 'insert')[1]?.args[0]).toMatchObject({
      user_id: FRIEND_A,
      status: 'approved',
      is_team_captain: false,
      team_request_id: CAPTAIN_REQUEST_ID,
    });
    const upserts = calls('game_players', 'upsert').map((c) => c.args[0]);
    expect(upserts).toEqual([
      expect.objectContaining({ user_id: FRIEND_A, team_number: 3, flight_number: 3 }),
      expect.objectContaining({ user_id: FRIEND_B, team_number: 3, flight_number: 3 }),
    ]);
    // The captain's seat comes from the claim, with the numbers from TypeScript.
    expect(adminMock.__rpcCalls[0]?.params).toMatchObject({
      p_game_id: GAME_ID,
      p_user_id: CAPTAIN_ID,
      p_seat_team_size: 3,
      p_new_team_size: 3,
    });
    expect(notifyInvitedToTeamMock).toHaveBeenCalledTimes(2);
    expect(notifyInvitedToTeamMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: FRIEND_A, teamName: 'Birdie-jegerne' }),
    );
    expect(notifyMock).not.toHaveBeenCalled(); // no organiser notice in open mode
    expect(revalidateTagMock).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('manual approval: captain and friends pending, no seat claim, no game_players, the organiser is told', async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({ registration_mode: 'manual_approval', mode_config: PAIRS }),
    );
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      liveUsers(FRIEND_A),
      { data: { id: CAPTAIN_REQUEST_ID }, error: null }, // captain insert
      CAPTAIN_DISPLAY,
      { data: null, error: null }, // child insert
    ]);

    const result = await submit([FRIEND_A]);

    expect(result).toMatchObject({ ok: true, captainRequestId: CAPTAIN_REQUEST_ID });
    expect(calls('game_registration_requests', 'insert').map((c) => c.args[0])).toEqual([
      expect.objectContaining({ user_id: CAPTAIN_ID, status: 'pending', decided_at: null }),
      expect.objectContaining({ user_id: FRIEND_A, status: 'pending', decided_at: null }),
    ]);
    expect(adminMock.__rpcCalls).toEqual([]);
    expect(adminMock.__fromCalls.filter((c) => c.table === 'game_players')).toEqual([]);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ADMIN_USER_ID,
        kind: 'registration_request',
        payload: expect.objectContaining({ team_name: 'Birdie-jegerne', request_id: CAPTAIN_REQUEST_ID }),
      }),
    );
  });

  it('captain double submit (UNIQUE 23505) → already_registered', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ mode_config: PAIRS }));
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      liveUsers(FRIEND_A),
      { data: null, error: { code: '23505', message: 'duplicate' } },
    ]);
    expect(await submit([FRIEND_A])).toEqual({ ok: false, error: 'already_registered' });
  });

  it('a friend already in the round (child insert 23505) → slot alreadyRegistered, the rest goes on', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ mode_config: { ...PAIRS, team_size: 3 } }));
    adminMock = buildSupabaseMock(
      [
        PROFILE_OK,
        liveUsers(FRIEND_A, FRIEND_B),
        { data: { id: CAPTAIN_REQUEST_ID }, error: null },
        CAPTAIN_DISPLAY,
        { data: null, error: { code: '23505', message: 'duplicate' } }, // child A
        { data: null, error: null }, // child B insert
        { data: null, error: null }, // child B upsert
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 1 } },
    );

    const result = await submit([FRIEND_A, FRIEND_B]);
    expect(result.ok && result.slotResults).toEqual([
      { ok: false, userId: FRIEND_A, reason: 'alreadyRegistered' },
      { ok: true, outcome: 'known_added', userId: FRIEND_B },
    ]);
  });

  it('#2223: the friend\'s roster row cannot be written → dbError, the child request rolled back, no invite', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getGameByShortIdMock.mockResolvedValue(makeGame({ mode_config: PAIRS }));
    adminMock = buildSupabaseMock(
      [
        PROFILE_OK,
        liveUsers(FRIEND_A),
        { data: { id: CAPTAIN_REQUEST_ID }, error: null },
        CAPTAIN_DISPLAY,
        { data: null, error: null }, // child insert
        { data: null, error: { message: 'connection reset' } }, // child upsert
        { data: [{ id: 'child-1' }], error: null }, // rollback .select('id')
      ],
      { claim_open_registration_seat: { outcome: 'ok', team_number: 1 } },
    );

    const result = await submit([FRIEND_A]);

    expect(result.ok && result.slotResults).toEqual([
      { ok: false, userId: FRIEND_A, reason: 'dbError' },
    ]);
    expect(filtersAfter('game_registration_requests', 'delete')).toEqual([
      ['team_request_id', CAPTAIN_REQUEST_ID],
      ['user_id', FRIEND_A],
    ]);
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });
});

/**
 * #2011/#2060: the seat claim decides the cap and the team number for open
 * registration. What stays here: what the core hands the claim, how each
 * outcome maps, and the rollback of the captain's row (AGENTS.md trap 5).
 */
describe('submitTeamRegistrationCore — the seat claim', () => {
  function refused(outcome: string | null, rollback: QueryResult = { data: [{ id: CAPTAIN_REQUEST_ID }], error: null }) {
    getGameByShortIdMock.mockResolvedValue(makeGame()); // open, Texas à 4 → cap 40
    adminMock = buildSupabaseMock(
      [
        PROFILE_OK,
        liveUsers(FRIEND_A, FRIEND_B, FRIEND_C),
        { data: { id: CAPTAIN_REQUEST_ID }, error: null },
        CAPTAIN_DISPLAY,
        rollback,
        // What the core would consume if it went on past a refusal:
        { data: null, error: null },
        { data: null, error: null },
      ],
      { claim_open_registration_seat: outcome === null ? null : { outcome, team_number: null } },
    );
  }

  it('full game → game_full, the captain row rolled back, no teammate written', async () => {
    refused('game_full');
    expect(await submit([FRIEND_A, FRIEND_B, FRIEND_C])).toEqual({ ok: false, error: 'game_full' });
    expect(calls('game_registration_requests', 'delete')).toHaveLength(1);
    expect(calls('game_registration_requests', 'insert')).toHaveLength(1);
    expect(adminMock.__fromCalls.filter((c) => c.table === 'game_players')).toEqual([]);
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });

  it('the claim gets the cap, the team size and a new team', async () => {
    refused('game_full');
    await submit([FRIEND_A, FRIEND_B, FRIEND_C]);
    const params = adminMock.__rpcCalls.find((c) => c.name === 'claim_open_registration_seat')
      ?.params as Record<string, unknown>;
    expect(params).toMatchObject({
      p_game_id: GAME_ID,
      p_user_id: CAPTAIN_ID,
      p_cap: 40,
      p_seat_team_size: 4,
      p_new_team_size: 4,
      p_max_teams: 10,
    });
    // #463: the captain registers themself → confirmed at once.
    expect(typeof params.p_accepted_at).toBe('string');
  });

  it.each(['signup_closed', 'game_locked'] as const)('gate closed under the lock (%s) → same error', async (outcome) => {
    refused(outcome);
    expect(await submit([FRIEND_A, FRIEND_B, FRIEND_C])).toEqual({ ok: false, error: outcome });
    expect(calls('game_registration_requests', 'delete')).toHaveLength(1);
  });

  it('an unknown answer from the claim → db_error, rolled back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    refused(null);
    expect(await submit([FRIEND_A, FRIEND_B, FRIEND_C])).toEqual({ ok: false, error: 'db_error' });
    expect(calls('game_registration_requests', 'delete')).toHaveLength(1);
  });

  it('#667: the claim RPC fails → db_error, rolled back, no game_players', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getGameByShortIdMock.mockResolvedValue(makeGame({ mode_config: PAIRS }));
    adminMock = buildSupabaseMock(
      [
        PROFILE_OK,
        liveUsers(FRIEND_A),
        { data: { id: CAPTAIN_REQUEST_ID }, error: null },
        CAPTAIN_DISPLAY,
        { data: [{ id: CAPTAIN_REQUEST_ID }], error: null },
      ],
      {},
      { rpcErrors: { claim_open_registration_seat: { message: 'db constraint violation' } } },
    );
    expect(await submit([FRIEND_A])).toEqual({ ok: false, error: 'db_error' });
    expect(calls('game_registration_requests', 'delete')).toHaveLength(1);
    expect(adminMock.__fromCalls.filter((c) => c.table === 'game_players')).toEqual([]);
  });

  it('the compensating delete matches 0 rows → still game_full (no 500)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    refused('game_full', { data: [], error: null });
    expect(await submit([FRIEND_A, FRIEND_B, FRIEND_C])).toEqual({ ok: false, error: 'game_full' });
  });

  it('#2072: captain already on the roster → already_registered, rolled back, no teammate', async () => {
    refused('already_on_roster');
    expect(await submit([FRIEND_A, FRIEND_B, FRIEND_C])).toEqual({
      ok: false,
      error: 'already_registered',
    });
    expect(calls('game_registration_requests', 'delete')).toHaveLength(1);
    expect(calls('game_registration_requests', 'insert')).toHaveLength(1);
    expect(notifyInvitedToTeamMock).not.toHaveBeenCalled();
  });
});

const MATE_ID = FRIEND_A;
const MATE_REQUEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DB_ERR = { message: 'AbortError: This operation was aborted', code: '' };

const mateRequest = (over: Record<string, unknown> = {}): QueryResult => ({
  data: {
    id: MATE_REQUEST_ID,
    game_id: GAME_ID,
    user_id: MATE_ID,
    status: 'pending',
    team_request_id: CAPTAIN_REQUEST_ID,
    team_name: 'Lag A',
    is_team_captain: false,
    ...over,
  },
  error: null,
});
const captainRequest: QueryResult = { data: { user_id: CAPTAIN_ID }, error: null };

function accept() {
  return acceptTeamInviteCore(MATE_ID, { shortId: SHORT_ID, requestId: MATE_REQUEST_ID });
}

function playerWrites() {
  return adminMock.__fromCalls.filter(
    (c) => c.table === 'game_players' && ['upsert', 'insert', 'update'].includes(c.method),
  );
}

describe('acceptTeamInviteCore', () => {
  beforeEach(() => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ registration_mode: 'manual_approval' }));
  });

  it('profile not complete → profile_incomplete, nothing read', async () => {
    adminMock = buildSupabaseMock([{ data: { profile_completed_at: null }, error: null }]);
    expect(await accept()).toEqual({ ok: false, error: 'profile_incomplete' });
    expect(adminMock.__fromCalls.filter((c) => c.table === 'game_registration_requests')).toEqual([]);
  });

  it('#543: closed signups → signup_closed', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ signups_closed_at: '2026-06-11T10:00:00Z' }));
    adminMock = buildSupabaseMock([PROFILE_OK, mateRequest()]);
    expect(await accept()).toEqual({ ok: false, error: 'signup_closed' });
  });

  it('#1445: the request read fails → db_error, not not_found', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([PROFILE_OK, { data: null, error: DB_ERR }]);
    expect(await accept()).toEqual({ ok: false, error: 'db_error' });
    expect(getGameByShortIdMock).not.toHaveBeenCalled();
  });

  it('#1445: a real 0-row result stays not_found', async () => {
    adminMock = buildSupabaseMock([PROFILE_OK, { data: null, error: null }], {}, { strictSingle: true });
    expect(await accept()).toEqual({ ok: false, error: 'not_found' });
  });

  it('a row that belongs to somebody else → not_found', async () => {
    adminMock = buildSupabaseMock([PROFILE_OK, mateRequest({ user_id: STRANGER })]);
    expect(await accept()).toEqual({ ok: false, error: 'not_found' });
  });

  it.each([
    ['a solo request', { team_request_id: null, is_team_captain: false }],
    ["the captain's own request", { team_request_id: null, is_team_captain: true }],
  ] as const)('#2440: %s → not_found, nothing written', async (_label, over) => {
    adminMock = buildSupabaseMock([PROFILE_OK, mateRequest(over), { data: [{ id: MATE_REQUEST_ID }], error: null }]);
    expect(await accept()).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
  });

  it('#2440: the captain row is not in this game → not_found, nothing written', async () => {
    adminMock = buildSupabaseMock(
      [PROFILE_OK, mateRequest(), { data: null, error: null }, { data: [{ id: MATE_REQUEST_ID }], error: null }],
      {},
      { strictSingle: true },
    );
    expect(await accept()).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
  });

  it('#2061: the captain has no roster row → approved, but no game_players row', async () => {
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      mateRequest(),
      captainRequest,
      { data: null, error: null },
      { data: [{ id: MATE_REQUEST_ID }], error: null }, // status update .select('id')
      { data: null, error: null },
    ]);
    expect(await accept()).toEqual({ ok: true });
    expect(playerWrites()).toEqual([]);
    expect(calls('game_registration_requests', 'update')[0]?.args[0]).toMatchObject({ status: 'approved' });
  });

  it('#2061: the status update matches 0 rows → db_error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([PROFILE_OK, mateRequest(), captainRequest, { data: null, error: null }, { data: [], error: null }]);
    expect(await accept()).toEqual({ ok: false, error: 'db_error' });
    expect(playerWrites()).toEqual([]);
  });

  it('the captain is on team 2 → the teammate goes on team 2', async () => {
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      mateRequest(),
      captainRequest,
      { data: { team_number: 2 }, error: null },
      { data: [{ id: MATE_REQUEST_ID }], error: null },
      { data: null, error: null },
    ]);
    expect(await accept()).toEqual({ ok: true });
    expect(playerWrites().map((c) => c.args[0])).toEqual([
      expect.objectContaining({ user_id: MATE_ID, team_number: 2, flight_number: 2 }),
    ]);
  });

  it("best ball: the teammate gets the captain's flight (#2290)", async () => {
    getGameByShortIdMock.mockResolvedValue(
      makeGame({
        registration_mode: 'manual_approval',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
      }),
    );
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      mateRequest(),
      captainRequest,
      { data: { team_number: 2, flight_number: 1, withdrawn_at: null }, error: null },
      { data: [{ id: MATE_REQUEST_ID }], error: null },
      { data: null, error: null },
    ]);
    expect(await accept()).toEqual({ ok: true });
    expect(playerWrites()[0]?.args[0]).toMatchObject({ team_number: 2, flight_number: 1 });
  });

  it.each([
    ['the captain request', [mateRequest(), { data: null, error: DB_ERR }]],
    ["the captain's roster row", [mateRequest(), captainRequest, { data: null, error: DB_ERR }]],
  ])('reading %s fails → db_error, nothing written', async (_label, queue) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([PROFILE_OK, ...queue, { data: [{ id: MATE_REQUEST_ID }], error: null }]);
    expect(await accept()).toEqual({ ok: false, error: 'db_error' });
    expect(anyWrites()).toEqual([]);
  });

  it('#2445: a draft → not_found, nothing written', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ status: 'draft' }));
    adminMock = buildSupabaseMock([PROFILE_OK, mateRequest(), captainRequest, { data: null, error: null }]);
    expect(await accept()).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
  });
});

describe('declineTeamInviteCore', () => {
  function decline(requestId = MATE_REQUEST_ID) {
    return declineTeamInviteCore(MATE_ID, { shortId: SHORT_ID, requestId });
  }

  beforeEach(() => {
    getGameByShortIdMock.mockResolvedValue(makeGame());
  });

  it('declines: roster row first, then the request, then the captain is told', async () => {
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      mateRequest({ status: 'approved' }),
      { data: null, error: null }, // game_players delete
      { data: [{ id: MATE_REQUEST_ID }], error: null }, // update .select('id')
      { data: { user_id: CAPTAIN_ID, team_name: 'Lag A' }, error: null }, // captain request
      { data: { name: 'Mate', nickname: null, email: 'mate@example.com' }, error: null }, // decliner name
    ]);
    expect(await decline()).toEqual({ ok: true });
    expect(calls('game_registration_requests', 'update')[0]?.args[0]).toMatchObject({ status: 'rejected' });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: CAPTAIN_ID, kind: 'team_member_withdrew' }),
    );
  });

  it('#2840: the request cannot be read → db_error, nothing written', async () => {
    adminMock = buildSupabaseMock([PROFILE_OK, { data: null, error: { message: 'boom' } }]);
    expect(await decline()).toEqual({ ok: false, error: 'db_error' });
    expect(calls('game_players', 'delete')).toHaveLength(0);
    expect(calls('game_registration_requests', 'update')).toHaveLength(0);
  });

  it('#2223: the roster row cannot be deleted → db_error, the request untouched', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      PROFILE_OK,
      mateRequest({ status: 'approved' }),
      { data: null, error: DB_ERR },
      { data: [{ id: MATE_REQUEST_ID }], error: null },
    ]);
    expect(await decline()).toEqual({ ok: false, error: 'db_error' });
    expect(calls('game_registration_requests', 'update')).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('#2358: the captain cannot «decline» their own captain row → not_found, nothing written', async () => {
    adminMock = buildSupabaseMock([
      { data: { profile_completed_at: '2026-01-01T00:00:00Z' }, error: null },
      {
        data: {
          id: CAPTAIN_REQUEST_ID,
          game_id: GAME_ID,
          user_id: CAPTAIN_ID,
          status: 'approved',
          team_request_id: null,
          team_name: 'Bjørka',
          is_team_captain: true,
        },
        error: null,
      },
    ]);
    const result = await declineTeamInviteCore(CAPTAIN_ID, { shortId: SHORT_ID, requestId: CAPTAIN_REQUEST_ID });
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
  });

  it('#2445: a draft → not_found, nothing written', async () => {
    getGameByShortIdMock.mockResolvedValue(makeGame({ status: 'draft' }));
    adminMock = buildSupabaseMock([PROFILE_OK, mateRequest()]);
    expect(await decline()).toEqual({ ok: false, error: 'not_found' });
    expect(anyWrites()).toEqual([]);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

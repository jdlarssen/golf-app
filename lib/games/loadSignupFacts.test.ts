// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClientMock, type QueryOp, type QueryResponse } from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#2748): the reads behind the signup rule. Every row the rule needs,
 * filtered to this player and this round, and a failed read never reads as
 * «not a member» (#1863).
 */

const ME = '11111111-1111-4111-8111-111111111111';
const ORGANISER = '33333333-3333-4333-8333-333333333333';
const GROUP = '55555555-5555-4555-8555-555555555555';
const GAME_ID = '22222222-2222-4222-8222-222222222222';

let answers: Record<string, QueryResponse | ((op: QueryOp) => QueryResponse)>;
const fake = createAdminClientMock({
  respond: (op) => {
    const answer = answers[op.table];
    if (typeof answer === 'function') return answer(op);
    return answer ?? { data: null };
  },
});
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));

import { loadSignupFacts, type SignupFactsGame } from './loadSignupFacts';

const GAME: SignupFactsGame = {
  id: GAME_ID,
  group_id: null,
  registration_mode: 'open',
  let_friends_skip_gate: false,
  created_by: ORGANISER,
};
const CLUB_GATED: SignupFactsGame = {
  ...GAME,
  group_id: GROUP,
  registration_mode: 'manual_approval',
  let_friends_skip_gate: true,
};
const friendship = {
  id: 'f',
  requester_id: ME,
  addressee_id: ORGANISER,
  status: 'accepted',
};

const filtersOf = (table: string) => fake.ops.find((op) => op.table === table)?.filters ?? [];
const FAILED = { error: { message: 'boom' } };

beforeEach(() => {
  fake.reset();
  answers = {
    users: { data: { profile_completed_at: '2026-01-01T00:00:00Z', email: 'me@example.test' } },
  };
});

describe('loadSignupFacts', () => {
  it('a finished profile with no link to the round', async () => {
    await expect(loadSignupFacts(GAME, ME)).resolves.toEqual({
      profileCompleted: true,
      isAlreadyRegistered: false,
      requestView: 'none',
      hasPendingInvitation: false,
      isClubMember: false,
      viewerIsFriend: false,
    });
    expect(fake.ops.map((op) => op.table)).toEqual([
      'users',
      'game_players',
      'game_registration_requests',
      'invitations',
    ]);
  });

  it('reads this player in this round', async () => {
    await loadSignupFacts(GAME, ME);
    expect(filtersOf('users')).toContainEqual({ op: 'eq', column: 'id', value: ME });
    for (const table of ['game_players', 'game_registration_requests']) {
      expect(filtersOf(table)).toEqual(
        expect.arrayContaining([
          { op: 'eq', column: 'game_id', value: GAME_ID },
          { op: 'eq', column: 'user_id', value: ME },
        ]),
      );
    }
  });

  it('a profile without a finished form, and no row at all, count as not completed', async () => {
    answers.users = { data: { profile_completed_at: null, email: 'me@example.test' } };
    expect((await loadSignupFacts(GAME, ME)).profileCompleted).toBe(false);
    answers.users = { data: null };
    expect((await loadSignupFacts(GAME, ME)).profileCompleted).toBe(false);
  });

  it('a row on the roster counts, withdrawn or not: the query does not filter on it', async () => {
    answers.game_players = { data: { game_id: GAME_ID } };
    expect((await loadSignupFacts(GAME, ME)).isAlreadyRegistered).toBe(true);
    expect(filtersOf('game_players').map((f) => f.column)).not.toContain('withdrawn_at');
  });

  it('an open invitation on the address counts, not an accepted or expired one', async () => {
    answers.invitations = { data: [{ id: 'i' }] };
    const before = Date.now();
    expect((await loadSignupFacts(GAME, ME)).hasPendingInvitation).toBe(true);
    const filters = filtersOf('invitations');
    expect(filters).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'game_id', value: GAME_ID },
        { op: 'is', column: 'accepted_at', value: null },
      ]),
    );
    expect(filters.find((f) => f.column === 'email')?.op).toBe('imatch');
    const expiry = filters.find((f) => f.column === 'expires_at');
    expect(expiry?.op).toBe('gt');
    expect(Date.parse(String(expiry?.value))).toBeGreaterThanOrEqual(before);
  });

  it('a request and a captain row get their view; the captain is asked only for an approved child', async () => {
    answers.game_registration_requests = { data: { status: 'pending', team_request_id: null } };
    expect((await loadSignupFacts(GAME, ME)).requestView).toBe('self_request');
    answers.game_registration_requests = { data: { status: 'pending', team_request_id: 'c' } };
    expect((await loadSignupFacts(GAME, ME)).requestView).toBe('captain_invited');

    answers.game_registration_requests = (op) =>
      op.filters.some((f) => f.column === 'id')
        ? { data: { status: 'pending' } }
        : { data: { status: 'approved', team_request_id: 'c' } };
    expect((await loadSignupFacts(GAME, ME)).requestView).toBe('team_awaiting_approval');
  });

  it('asks about the club only for a club round, and about friends only behind the gate', async () => {
    await loadSignupFacts(GAME, ME);
    expect(fake.ops.map((op) => op.table)).not.toContain('group_members');
    expect(fake.ops.map((op) => op.table)).not.toContain('friendships');

    await loadSignupFacts({ ...CLUB_GATED, let_friends_skip_gate: false }, ME);
    expect(fake.ops.map((op) => op.table)).not.toContain('friendships');

    answers.group_members = { data: { user_id: ME } };
    answers.friendships = { data: [friendship] };
    await expect(loadSignupFacts(CLUB_GATED, ME)).resolves.toMatchObject({
      isClubMember: true,
      viewerIsFriend: true,
    });
    expect(filtersOf('group_members')).toEqual(
      expect.arrayContaining([
        { op: 'eq', column: 'group_id', value: GROUP },
        { op: 'eq', column: 'user_id', value: ME },
      ]),
    );
  });

  it('a friend of someone else is not a friend of the organiser', async () => {
    answers.friendships = { data: [{ ...friendship, addressee_id: 'someone-else' }] };
    expect((await loadSignupFacts(CLUB_GATED, ME)).viewerIsFriend).toBe(false);
  });

  it.each(['users', 'game_players', 'game_registration_requests', 'invitations', 'group_members', 'friendships'])(
    'a failed read of %s throws',
    async (table) => {
      answers[table] = FAILED;
      await expect(loadSignupFacts(CLUB_GATED, ME)).rejects.toBeTruthy();
    },
  );

  it('a failed read of the captain throws', async () => {
    answers.game_registration_requests = (op) =>
      op.filters.some((f) => f.column === 'id')
        ? FAILED
        : { data: { status: 'approved', team_request_id: 'c' } };
    await expect(loadSignupFacts(GAME, ME)).rejects.toBeTruthy();
  });
});

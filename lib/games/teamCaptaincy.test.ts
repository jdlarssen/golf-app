import { describe, it, expect } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { hasAcceptedTeamInvite, readCaptainTeam, type TeamChild } from './teamCaptaincy';

/**
 * Type A (#2358): who has said yes to a team invitation.
 *
 * A captain with a teammate who has said yes cannot withdraw; unanswered
 * invitations do not stop them (owner's answer on #2358). `status` alone
 * cannot tell the two apart: an open game writes a teammate's request as
 * `approved` the moment the captain registers the team, before they have seen
 * it. The two signals that do:
 *   - the roster row is confirmed (`game_players.accepted_at`, #463): the
 *     teammate joined through the team page or opened the game;
 *   - the teammate approved the request themself (`decided_by_user_id` is
 *     their own id): the early yes in a manual-approval game, before the
 *     organiser has put the team on the roster.
 */

const TEAMMATE = '44444444-4444-4444-4444-444444444444';
const CAPTAIN = '33333333-3333-3333-3333-333333333333';
const ORGANISER = '77777777-7777-7777-7777-777777777777';

function child(overrides: Partial<TeamChild> = {}): TeamChild {
  return {
    id: 'req-1',
    user_id: TEAMMATE,
    status: 'approved',
    decided_by_user_id: CAPTAIN,
    ...overrides,
  };
}

describe('hasAcceptedTeamInvite', () => {
  it.each([
    // [case, child, roster accepted_at (undefined = no roster row), expected]
    ['open game, not answered yet', child(), null, false],
    ['open game, confirmed on the roster', child(), '2026-09-29T10:00:00.000Z', true],
    ['manual game, invitation pending', child({ status: 'pending', decided_by_user_id: null }), undefined, false],
    ['manual game, said yes before the organiser', child({ decided_by_user_id: TEAMMATE }), undefined, true],
    ['organiser approved the team, teammate never answered', child({ decided_by_user_id: ORGANISER }), null, false],
    ['organiser approved the team, teammate confirmed since', child({ decided_by_user_id: ORGANISER }), '2026-09-29T10:00:00.000Z', true],
    ['e-mail invitee who joined through the team page', child({ decided_by_user_id: CAPTAIN }), '2026-09-29T10:00:00.000Z', true],
    ['declined', child({ status: 'rejected', decided_by_user_id: TEAMMATE }), undefined, false],
    ['withdrawn, even with a confirmed roster row', child({ status: 'withdrawn', decided_by_user_id: TEAMMATE }), '2026-09-29T10:00:00.000Z', false],
  ] as const)('%s', (_label, row, rosterAcceptedAt, expected) => {
    expect(hasAcceptedTeamInvite(row, rosterAcceptedAt)).toBe(expected);
  });
});

/**
 * #2440: the teammates under a captain are read inside the captain's game.
 * `team_request_id` is not bound to the same game in the database, so a row
 * from another game must not count as a teammate (or be marked with the team).
 */
describe('readCaptainTeam', () => {
  it('reads only the rows in the captain\'s game', async () => {
    const GAME = '55555555-5555-5555-5555-555555555555';
    const CAPTAIN_REQUEST = '66666666-6666-6666-6666-666666666666';
    const admin = buildSupabaseMock([{ data: [], error: null }]);

    expect(await readCaptainTeam(admin as never, GAME, CAPTAIN_REQUEST)).toEqual({
      ok: true,
      accepted: [],
      unanswered: [],
    });
    const filters = admin.__fromCalls
      .filter((c) => c.table === 'game_registration_requests' && c.method === 'eq')
      .map((c) => c.args);
    expect(filters).toContainEqual(['team_request_id', CAPTAIN_REQUEST]);
    expect(filters).toContainEqual(['game_id', GAME]);
  });
});

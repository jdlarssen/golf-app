import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

/**
 * Type A for the facts behind the league link page (#2662), with the
 * fail-closed rule from #1863: a read error is an error, never an empty list.
 * Each table gets its own result list (`byTable`), so the order in which the
 * parallel reads claim their result does not matter.
 */

vi.mock('server-only', () => ({}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

import { getLeagueJoinContext } from './getLeagueJoinContext';

const ME = 'player-1';
const CODE = 'abcd2345';

const LEAGUE = {
  id: 'league-1',
  name: 'Vinterliga',
  status: 'draft',
  format: 'stableford',
  is_simulator: true,
  group_id: null,
  courses: { name: 'Trackman' },
};

const ROUNDS = [
  { sequence: 1, opens_at: '2026-11-09T00:00:00Z', closes_at: '2026-11-15T22:59:00Z' },
  { sequence: 2, opens_at: '2026-11-16T00:00:00Z', closes_at: '2026-11-22T22:59:00Z' },
];

function client(over: Partial<Record<'leagues' | 'league_rounds' | 'league_players' | 'users', unknown>> = {}) {
  return buildSupabaseMock([], {}, {
    byTable: {
      leagues: [(over.leagues ?? { data: LEAGUE, error: null }) as never],
      league_rounds: [(over.league_rounds ?? { data: ROUNDS, error: null }) as never],
      league_players: [(over.league_players ?? { data: [{ user_id: 'other' }], error: null }) as never],
      users: [(over.users ?? { data: { profile_completed_at: '2026-01-01' }, error: null }) as never],
    },
  });
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe('getLeagueJoinContext', () => {
  it('gathers the league, its rounds, the count and the facts', async () => {
    adminMock = client();
    const ctx = await getLeagueJoinContext(CODE, ME);
    expect(ctx).toEqual({
      league: LEAGUE,
      rounds: [
        { sequence: 1, opensAt: '2026-11-09T00:00:00Z', closesAt: '2026-11-15T22:59:00Z' },
        { sequence: 2, opensAt: '2026-11-16T00:00:00Z', closesAt: '2026-11-22T22:59:00Z' },
      ],
      participantCount: 1,
      facts: {
        leagueExists: true,
        status: 'draft',
        signedIn: true,
        profileCompleted: true,
        alreadyJoined: false,
      },
    });
  });

  it('sees that the player is already in', async () => {
    adminMock = client({ league_players: { data: [{ user_id: ME }, { user_id: 'other' }], error: null } });
    const { participantCount, facts } = await getLeagueJoinContext(CODE, ME);
    expect(participantCount).toBe(2);
    expect(facts.alreadyJoined).toBe(true);
  });

  it('a stranger (no session) gets the league without reading any user', async () => {
    adminMock = client();
    const { league, facts } = await getLeagueJoinContext(CODE, null);
    expect(league?.id).toBe('league-1');
    expect(facts).toMatchObject({ signedIn: false, profileCompleted: false, alreadyJoined: false });
    expect(adminMock.__fromCalls.some((c) => c.table === 'users')).toBe(false);
  });

  it('a code of the wrong shape never reaches the DB', async () => {
    adminMock = client();
    const { league, facts } = await getLeagueJoinContext('ABCD2345', ME);
    expect(league).toBeNull();
    expect(facts.leagueExists).toBe(false);
    expect(adminMock.__fromCalls).toHaveLength(0);
  });

  it('an unknown or switched-off code → no league', async () => {
    adminMock = client({ leagues: { data: null, error: null } });
    const { league, facts } = await getLeagueJoinContext(CODE, ME);
    expect(league).toBeNull();
    expect(facts.leagueExists).toBe(false);
  });

  it('a club league behind a code → no league (members join through the club)', async () => {
    adminMock = client({ leagues: { data: { ...LEAGUE, group_id: 'club-1' }, error: null } });
    const { league, facts } = await getLeagueJoinContext(CODE, ME);
    expect(league).toBeNull();
    expect(facts.leagueExists).toBe(false);
  });

  it.each(['leagues', 'league_rounds', 'league_players', 'users'] as const)(
    'a read error on %s is thrown, not read as empty',
    async (table) => {
      adminMock = client({ [table]: { data: null, error: { message: 'boom' } } });
      await expect(getLeagueJoinContext(CODE, ME)).rejects.toThrow(/read failed/);
    },
  );
});

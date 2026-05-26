import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const playerRows = vi.fn<() => { data: Row[] | null }>();
const requestRows = vi.fn<() => { data: Row[] | null }>();
const openGamesRows = vi.fn<() => { data: Row[] | null }>();
const notInArg = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'game_players') {
        return {
          select: () => ({
            eq: () => Promise.resolve(playerRows()),
          }),
        };
      }
      if (table === 'game_registration_requests') {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve(requestRows()),
            }),
          }),
        };
      }
      // games
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              order: () => ({
                limit: () => {
                  return {
                    not: (...args: unknown[]) => {
                      notInArg(...args);
                      return Promise.resolve(openGamesRows());
                    },
                    then: (resolve: (v: unknown) => unknown) =>
                      Promise.resolve(openGamesRows()).then(resolve),
                  };
                },
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

beforeEach(() => {
  playerRows.mockReset();
  requestRows.mockReset();
  openGamesRows.mockReset();
  notInArg.mockReset();
});

describe('getDiscoverableGames', () => {
  it('returnerer tomme lister når bruker ikke har data', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.openGames).toEqual([]);
    expect(result.pendingRequests).toEqual([]);
  });

  it('mapper open-game-rad til DiscoverableOpenGame med course-navn', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({
      data: [
        {
          id: 'g1',
          name: 'Sommercup',
          short_id: 'k7m3p9qx',
          scheduled_tee_off_at: '2026-06-01T10:00:00Z',
          courses: { name: 'Hauger' },
        },
      ],
    });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.openGames).toEqual([
      {
        id: 'g1',
        name: 'Sommercup',
        short_id: 'k7m3p9qx',
        scheduled_tee_off_at: '2026-06-01T10:00:00Z',
        course_name: 'Hauger',
      },
    ]);
  });

  it('ekskluderer spill bruker allerede er påmeldt', async () => {
    playerRows.mockReturnValue({ data: [{ game_id: 'g1' }, { game_id: 'g2' }] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    await getDiscoverableGames('u1');

    expect(notInArg).toHaveBeenCalledWith('id', 'in', expect.stringContaining('g1'));
    expect(notInArg).toHaveBeenCalledWith('id', 'in', expect.stringContaining('g2'));
  });

  it('ekskluderer også spill med pending/approved request', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({
      data: [
        {
          id: 'r1',
          game_id: 'g3',
          status: 'pending',
          team_name: null,
          is_team_captain: false,
          created_at: '2026-05-26T12:00:00Z',
          games: { name: 'Klubbcup', short_id: 'abcd1234' },
        },
      ],
    });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    await getDiscoverableGames('u1');

    expect(notInArg).toHaveBeenCalledWith('id', 'in', expect.stringContaining('g3'));
  });

  it('mapper pending request til PendingRequest-shape', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({
      data: [
        {
          id: 'r1',
          game_id: 'g3',
          status: 'pending',
          team_name: 'Skogen',
          is_team_captain: true,
          created_at: '2026-05-26T12:00:00Z',
          games: { name: 'Klubbcup', short_id: 'abcd1234' },
        },
      ],
    });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.pendingRequests).toEqual([
      {
        id: 'r1',
        game_id: 'g3',
        short_id: 'abcd1234',
        game_name: 'Klubbcup',
        team_name: 'Skogen',
        is_team_captain: true,
        created_at: '2026-05-26T12:00:00Z',
      },
    ]);
  });

  it('inkluderer kun pending (ikke approved) i pendingRequests-listen', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({
      data: [
        {
          id: 'r1',
          game_id: 'g1',
          status: 'pending',
          team_name: null,
          is_team_captain: false,
          created_at: '2026-05-26T10:00:00Z',
          games: { name: 'Spill A', short_id: 'aaaa1111' },
        },
        {
          id: 'r2',
          game_id: 'g2',
          status: 'approved',
          team_name: null,
          is_team_captain: false,
          created_at: '2026-05-26T11:00:00Z',
          games: { name: 'Spill B', short_id: 'bbbb2222' },
        },
      ],
    });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.pendingRequests).toHaveLength(1);
    expect(result.pendingRequests[0].id).toBe('r1');
  });
});

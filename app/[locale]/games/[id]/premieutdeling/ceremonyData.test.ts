import { describe, it, expect, vi, beforeEach } from 'vitest';

// Owner 22.11 («Skjul den»): when nobody won, the prize-giving is hidden.
// `ceremonyOpenFor` is the one answer every entry reads (game home, admin page,
// remote, TV). Type A over a mocked result build.

vi.mock('server-only', () => ({}));
const buildModeResultForGame = vi.fn();
vi.mock('@/lib/scoring/buildModeResultForGame', () => ({
  buildModeResultForGame: (...args: unknown[]) => buildModeResultForGame(...args),
}));
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({}) }));
vi.mock('../leaderboard/leaderboardContext', () => ({ fetchSideWinners: vi.fn(async () => []) }));

import { ceremonyOpenFor } from './ceremonyData';

const game = (over: Record<string, unknown> = {}) =>
  ({
    id: 'g1',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1 },
    course_id: 'c1',
    hole_segment: 'full',
    source_game_id: null,
    league_round_id: null,
    status: 'finished',
    ...over,
  }) as never;

const solo = (points: number[]) => ({
  kind: 'stableford',
  variant: 'solo',
  holes: [],
  players: points.map((p, i) => ({
    userId: `u${i}`,
    totalPoints: p,
    holesPlayed: 18,
    rank: points.filter((q) => q > p).length + 1,
    tiedWith: [],
    decidedBy: null,
  })),
});

describe('ceremonyOpenFor', () => {
  beforeEach(() => buildModeResultForGame.mockReset());

  it('hides the prize-giving when everyone ended on zero', async () => {
    buildModeResultForGame.mockResolvedValue(solo([0, 0, 0]));
    expect(await ceremonyOpenFor(game())).toBe(false);
  });

  it('keeps it when someone won', async () => {
    buildModeResultForGame.mockResolvedValue(solo([34, 30, 0]));
    expect(await ceremonyOpenFor(game())).toBe(true);
  });

  it('modified stableford: everyone on 0 is a tie, so it stays', async () => {
    buildModeResultForGame.mockResolvedValue(solo([0, 0]));
    expect(await ceremonyOpenFor(game({ game_mode: 'modified_stableford' }))).toBe(true);
  });

  it('builds no result for a format or flight without one, or a game still running', async () => {
    expect(await ceremonyOpenFor(game({ game_mode: 'singles_matchplay' }))).toBe(false);
    expect(await ceremonyOpenFor(game({ league_round_id: 'r1' }))).toBe(false);
    expect(await ceremonyOpenFor(game({ status: 'active' }))).toBe(true);
    expect(buildModeResultForGame).not.toHaveBeenCalled();
  });
});

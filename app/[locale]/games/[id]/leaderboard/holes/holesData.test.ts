import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchHolesAndScores } from './holesData';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: vi.fn(),
}));
vi.mock('@/lib/auth/userId', () => ({
  getProxyVerifiedUserId: vi.fn(),
}));
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(async () => 'no'),
}));
vi.mock('@/lib/games/getGameWithPlayers', () => ({
  getGameWithPlayers: vi.fn(),
}));

const HOLES = [
  {
    hole_number: 1,
    par_mens: 4,
    par_ladies: 4,
    par_juniors: 4,
    stroke_index: 1,
  },
];
const SCORES = [{ user_id: 'user-1', hole_number: 1, strokes: 5 }];

/**
 * Minimal chainable mock covering the two query shapes fetchHolesAndScores
 * issues: `course_holes.select(...).eq(...).order(...).returns()` and
 * `scores.select(...).eq(...).returns()`. Captures the `game_id` the
 * scores fetch is filtered on — the load-bearing assertion for #1631.
 */
function makeSupabase() {
  const captured: { scoresGameId: string | null; holesCourseId: string | null } =
    { scoresGameId: null, holesCourseId: null };
  const client = {
    from: (table: 'course_holes' | 'scores') => {
      if (table === 'course_holes') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => {
              captured.holesCourseId = val;
              return {
                order: () => ({
                  returns: () =>
                    Promise.resolve({ data: HOLES, error: null }),
                }),
              };
            },
          }),
        };
      }
      return {
        select: () => ({
          eq: (_col: string, val: string) => {
            captured.scoresGameId = val;
            return {
              returns: () => Promise.resolve({ data: SCORES, error: null }),
            };
          },
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { client, captured };
}

function mockGwp(sourceGameId: string | null) {
  vi.mocked(getGameWithPlayers).mockResolvedValue({
    game: { id: 'game-1', source_game_id: sourceGameId },
    players: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('fetchHolesAndScores', () => {
  beforeEach(() => {
    vi.mocked(getGameWithPlayers).mockReset();
  });

  it('a host game (source_game_id null) reads its own scores (byte-identical pre-#1631 behavior)', async () => {
    mockGwp(null);
    const { client, captured } = makeSupabase();
    const result = await fetchHolesAndScores(client, 'game-1', 'course-1');
    expect(captured.scoresGameId).toBe('game-1');
    expect(captured.holesCourseId).toBe('course-1');
    expect(result.rawScores).toEqual(SCORES);
    expect(result.rawHoles).toEqual(HOLES);
  });

  it('a derived game reads scores from its host game (#1631)', async () => {
    mockGwp('host-1');
    const { client, captured } = makeSupabase();
    const result = await fetchHolesAndScores(client, 'derived-1', 'course-1');
    expect(captured.scoresGameId).toBe('host-1');
    expect(result.rawScores).toEqual(SCORES);
  });
});

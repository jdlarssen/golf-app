import { describe, it, expect } from 'vitest';
import { getRoundScoresForGames } from './getRoundScoresForGames';

const USER = 'user-1';

/**
 * Minimal chainable mock covering the three query shapes this helper
 * issues: `games.select('id, source_game_id').in('id', ids)`,
 * `scores.select(...).eq(...).in(...).not(...)`, and
 * `game_players.select(...).eq(...).in(...)`. `data` per table backs the
 * terminal call in each chain.
 */
function makeSupabase(data: {
  games: { id: string; source_game_id: string | null }[];
  scores: { game_id: string; strokes: number }[];
  game_players: { game_id: string; course_handicap: number | null }[];
}) {
   
  const client = {
    from: (table: keyof typeof data) => {
      if (table === 'games') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: data.games, error: null }),
          }),
        };
      }
      if (table === 'scores') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                not: () => Promise.resolve({ data: data.scores, error: null }),
              }),
            }),
          }),
        };
      }
      // game_players
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: data.game_players, error: null }),
          }),
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return client;
}

describe('getRoundScoresForGames', () => {
  it('returns an empty entry per id when given no games', async () => {
    const supabase = makeSupabase({ games: [], scores: [], game_players: [] });
    const result = await getRoundScoresForGames(supabase, USER, []);
    expect(result.size).toBe(0);
  });

  it('a non-derived game reads its own scores (byte-identical pre-#1441 behavior)', async () => {
    const supabase = makeSupabase({
      games: [{ id: 'g1', source_game_id: null }],
      scores: [
        { game_id: 'g1', strokes: 4 },
        { game_id: 'g1', strokes: 5 },
      ],
      game_players: [{ game_id: 'g1', course_handicap: 10 }],
    });

    const result = await getRoundScoresForGames(supabase, USER, ['g1']);

    expect(result.get('g1')).toEqual({ strokes: [4, 5], courseHandicap: 10 });
  });

  it('a derived game reads the host’s scores but keeps its OWN course_handicap', async () => {
    const supabase = makeSupabase({
      games: [{ id: 'derived-1', source_game_id: 'host-1' }],
      scores: [
        { game_id: 'host-1', strokes: 4 },
        { game_id: 'host-1', strokes: 5 },
      ],
      game_players: [{ game_id: 'derived-1', course_handicap: 12 }],
    });

    const result = await getRoundScoresForGames(supabase, USER, ['derived-1']);

    expect(result.get('derived-1')).toEqual({
      strokes: [4, 5],
      courseHandicap: 12,
    });
  });

  it('fans a shared host’s scores out to every requested id that redirects to it', async () => {
    const supabase = makeSupabase({
      games: [
        { id: 'host-1', source_game_id: null },
        { id: 'derived-1', source_game_id: 'host-1' },
      ],
      scores: [{ game_id: 'host-1', strokes: 4 }],
      game_players: [
        { game_id: 'host-1', course_handicap: 8 },
        { game_id: 'derived-1', course_handicap: 12 },
      ],
    });

    const result = await getRoundScoresForGames(supabase, USER, [
      'host-1',
      'derived-1',
    ]);

    expect(result.get('host-1')).toEqual({ strokes: [4], courseHandicap: 8 });
    expect(result.get('derived-1')).toEqual({ strokes: [4], courseHandicap: 12 });
  });
});

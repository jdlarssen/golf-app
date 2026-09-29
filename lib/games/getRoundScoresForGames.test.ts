import { describe, it, expect } from 'vitest';
import { getRoundScoresForGames } from './getRoundScoresForGames';
import type { GameMode } from '@/lib/scoring/modes/types';

const USER = 'user-1';

/**
 * Minimal chainable mock covering the query shapes this helper issues:
 * `games.select(...).in('id', ids)` (answered with the rows whose id is in
 * `ids`, so the follow-up host lookup gets only the hosts),
 * `scores.select(...).eq(...).in(...).not(...)`, and
 * `game_players.select(...).eq(...).in(...)`. `data` per table backs the
 * terminal call in each chain.
 */
function makeSupabase(data: {
  games: { id: string; source_game_id: string | null; game_mode: GameMode }[];
  scores: { game_id: string; strokes: number }[];
  game_players: { game_id: string; course_handicap: number | null }[];
}) {
   
  const client = {
    from: (table: keyof typeof data) => {
      if (table === 'games') {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) =>
              Promise.resolve({
                data: data.games.filter((g) => ids.includes(g.id)),
                error: null,
              }),
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
      games: [{ id: 'g1', source_game_id: null, game_mode: 'solo_strokeplay' }],
      scores: [
        { game_id: 'g1', strokes: 4 },
        { game_id: 'g1', strokes: 5 },
      ],
      game_players: [{ game_id: 'g1', course_handicap: 10 }],
    });

    const result = await getRoundScoresForGames(supabase, USER, ['g1']);

    expect(result.get('g1')).toEqual({
      strokes: [4, 5],
      courseHandicap: 10,
      teamBall: false,
    });
  });

  it('a derived game reads the host’s scores but keeps its OWN course_handicap', async () => {
    const supabase = makeSupabase({
      games: [
        { id: 'derived-1', source_game_id: 'host-1', game_mode: 'singles_matchplay' },
        { id: 'host-1', source_game_id: null, game_mode: 'fourball_matchplay' },
      ],
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
      teamBall: false,
    });
  });

  it('fans a shared host’s scores out to every requested id that redirects to it', async () => {
    const supabase = makeSupabase({
      games: [
        { id: 'host-1', source_game_id: null, game_mode: 'fourball_matchplay' },
        { id: 'derived-1', source_game_id: 'host-1', game_mode: 'singles_matchplay' },
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

    expect(result.get('host-1')).toEqual({
      strokes: [4],
      courseHandicap: 8,
      teamBall: false,
    });
    expect(result.get('derived-1')).toEqual({
      strokes: [4],
      courseHandicap: 12,
      teamBall: false,
    });
  });
});

// #2273: where the team shares one ball, every stroke lies on the captain.
// Hjem must not show that as anyone's own round, so the entry carries
// `teamBall` and no strokes, for the captain and the teammate alike.
describe('getRoundScoresForGames — team-ball rounds (#2273)', () => {
  it.each<GameMode>(['texas_scramble', 'foursomes_matchplay', 'patsome'])(
    '%s: teamBall with no strokes for the captain and the teammate',
    async (mode) => {
      const games = [{ id: 'g1', source_game_id: null, game_mode: mode }];
      const captain = makeSupabase({
        games,
        scores: [
          { game_id: 'g1', strokes: 4 },
          { game_id: 'g1', strokes: 3 },
        ],
        game_players: [{ game_id: 'g1', course_handicap: 6 }],
      });
      const teammate = makeSupabase({
        games,
        scores: [],
        game_players: [{ game_id: 'g1', course_handicap: 20 }],
      });

      const forCaptain = await getRoundScoresForGames(captain, 'captain', ['g1']);
      const forTeammate = await getRoundScoresForGames(teammate, 'teammate', ['g1']);

      expect(forCaptain.get('g1')).toEqual({
        strokes: [],
        courseHandicap: 6,
        teamBall: true,
      });
      expect(forTeammate.get('g1')).toEqual({
        strokes: [],
        courseHandicap: 20,
        teamBall: true,
      });
    },
  );

  it('a derived game takes its host’s mode: a team-ball host makes it a team round', async () => {
    const supabase = makeSupabase({
      games: [
        { id: 'derived-1', source_game_id: 'host-1', game_mode: 'singles_matchplay' },
        { id: 'host-1', source_game_id: null, game_mode: 'texas_scramble' },
      ],
      scores: [{ game_id: 'host-1', strokes: 4 }],
      game_players: [{ game_id: 'derived-1', course_handicap: 12 }],
    });

    const result = await getRoundScoresForGames(supabase, USER, ['derived-1']);

    expect(result.get('derived-1')).toEqual({
      strokes: [],
      courseHandicap: 12,
      teamBall: true,
    });
  });

  it('a derived game whose host row is not readable falls back to its own mode', async () => {
    const supabase = makeSupabase({
      games: [
        { id: 'derived-1', source_game_id: 'host-1', game_mode: 'foursomes_matchplay' },
      ],
      scores: [{ game_id: 'host-1', strokes: 4 }],
      game_players: [{ game_id: 'derived-1', course_handicap: 12 }],
    });

    const result = await getRoundScoresForGames(supabase, USER, ['derived-1']);

    expect(result.get('derived-1')).toEqual({
      strokes: [],
      courseHandicap: 12,
      teamBall: true,
    });
  });

  it('a mixed list flags only the team-ball game', async () => {
    const supabase = makeSupabase({
      games: [
        { id: 'solo', source_game_id: null, game_mode: 'solo_strokeplay' },
        { id: 'scramble', source_game_id: null, game_mode: 'texas_scramble' },
      ],
      scores: [
        { game_id: 'solo', strokes: 5 },
        { game_id: 'scramble', strokes: 3 },
      ],
      game_players: [],
    });

    const result = await getRoundScoresForGames(supabase, USER, ['solo', 'scramble']);

    expect(result.get('solo')).toEqual({ strokes: [5], courseHandicap: null, teamBall: false });
    expect(result.get('scramble')).toEqual({ strokes: [], courseHandicap: null, teamBall: true });
  });
});

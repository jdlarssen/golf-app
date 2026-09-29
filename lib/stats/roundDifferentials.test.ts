import { describe, it, expect } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { TeeBoxRatings } from '@/lib/games/teeRating';
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';
import {
  computeDifferentials,
  type DifferentialDeps,
  type DifferentialGame,
} from './roundDifferentials';

// Type A (#2273). In a team-ball format the captain's 18 «own» holes are the
// team's ball: the historikk page must neither show a differential for that
// round (live or frozen) nor lazy-freeze one.

const TEE: TeeBoxRatings = {
  slope_mens: 113,
  course_rating_mens: 72,
  par_total_mens: 72,
  slope_ladies: null,
  course_rating_ladies: null,
  par_total_ladies: null,
  slope_juniors: null,
  course_rating_juniors: null,
  par_total_juniors: null,
};

const HOLES = new Map<number, CourseHoleRow>(
  Array.from({ length: 18 }, (_, i) => [
    i + 1,
    { hole_number: i + 1, par_mens: 4, par_ladies: 4, par_juniors: 4, stroke_index: i + 1 },
  ]),
);

function game(
  id: string,
  gameMode: GameMode,
  frozen: number | null,
): DifferentialGame {
  return {
    id,
    game_mode: gameMode,
    course_id: 'course-1',
    tee_box_id: 'tee-1',
    course_handicap: 18,
    score_differential: frozen,
    holeCount: 18,
  };
}

/** Full data for every game: 18 × 5 on par-72, slope 113, CR 72 → 18.0. */
function deps(games: DifferentialGame[]): DifferentialDeps {
  return {
    teeById: new Map([['tee-1', TEE]]),
    genderByGame: new Map(games.map((g) => [g.id, 'mens' as const])),
    holesByCourse: new Map([['course-1', HOLES]]),
    scoresByGame: new Map(
      games.map((g) => [
        g.id,
        Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, strokes: 5 })),
      ]),
    ),
  };
}

describe('computeDifferentials — team-ball rounds (#2273)', () => {
  it.each<GameMode>(['texas_scramble', 'foursomes_matchplay', 'patsome'])(
    '%s: no differential and nothing to freeze, frozen or not',
    (mode) => {
      const games = [game('frozen', mode, 12.3), game('live', mode, null)];

      const { byGame, toFreeze } = computeDifferentials(games, deps(games));

      expect(byGame.size).toBe(0);
      expect(toFreeze).toEqual([]);
    },
  );

  it('own-ball rounds keep their differential: frozen wins, live is queued to freeze', () => {
    const games = [
      game('frozen', 'solo_strokeplay', 12.3),
      game('live', 'solo_strokeplay', null),
      game('bestball', 'best_ball', null),
    ];

    const { byGame, toFreeze } = computeDifferentials(games, deps(games));

    expect(byGame).toEqual(
      new Map([
        ['frozen', 12.3],
        ['live', 18],
        ['bestball', 18],
      ]),
    );
    expect(toFreeze).toEqual([
      { gameId: 'live', differential: 18 },
      { gameId: 'bestball', differential: 18 },
    ]);
  });

  it('a mixed history drops only the team-ball round', () => {
    const games = [
      game('solo', 'solo_strokeplay', null),
      game('scramble', 'texas_scramble', 9.9),
    ];

    const { byGame, toFreeze } = computeDifferentials(games, deps(games));

    expect([...byGame.keys()]).toEqual(['solo']);
    expect(toFreeze.map((f) => f.gameId)).toEqual(['solo']);
  });

  it('no games → empty result', () => {
    const { byGame, toFreeze } = computeDifferentials([], deps([]));
    expect(byGame.size).toBe(0);
    expect(toFreeze).toEqual([]);
  });
});

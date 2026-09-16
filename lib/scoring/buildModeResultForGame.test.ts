import { describe, it, expect } from 'vitest';
import {
  buildModeResultForGame,
  buildModeResultFromData,
  type GameForScoring,
} from './buildModeResultForGame';
import { createAdminClientMock } from '@/lib/supabase/testing/adminClientMock';
import type { CourseHoleRow, ScoreRow } from '@/lib/supabase/queryFragments';
import type { BestBallResult, StablefordSoloResult } from './modes/types';

// #1441: buildModeResultFromData scopes course_holes (and, defensively,
// scores) down to game.hole_segment before building the ScoringContext —
// so a front9/back9 HOST's own result summary reflects its 9 holes, and a
// DERIVED game's summary (built from the host's scores, redirected by the
// caller before this function ever sees them) does too.

const HOLES_18: CourseHoleRow[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  par_ladies: 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

const player = (userId: string, teamNumber: number) => ({
  user_id: userId,
  team_number: teamNumber,
  flight_number: null,
  course_handicap: 0,
  tee_gender: 'mens' as const,
  withdrawn_at: null,
  users: { name: userId, nickname: null },
});

const scoreRow = (userId: string, holeNumber: number, strokes: number): ScoreRow => ({
  user_id: userId,
  hole_number: holeNumber,
  strokes,
});

const baseGame: Omit<GameForScoring, 'hole_segment' | 'source_game_id'> = {
  id: 'game-1',
  game_mode: 'best_ball',
  mode_config: { team_size: 2 } as unknown as GameForScoring['mode_config'],
  course_id: 'course-1',
};

describe('buildModeResultFromData — #1441 hole_segment scoping', () => {
  it('omitting hole_segment behaves exactly like "full" — all 18 holes in scope', () => {
    const scores: ScoreRow[] = Array.from({ length: 18 }, (_, i) =>
      scoreRow('p1', i + 1, 4),
    ).concat(Array.from({ length: 18 }, (_, i) => scoreRow('p2', i + 1, 4)));

    const result = buildModeResultFromData(
      baseGame,
      [player('p1', 1), player('p2', 2)],
      HOLES_18,
      scores,
    ) as BestBallResult;

    expect(result.kind).toBe('best_ball');
    expect(result.teams[0].holes).toHaveLength(18);
    expect(result.teams[0].missingHoles).toEqual([]);
  });

  it('back9 scopes course_holes to 10-18 and ignores front-9 score rows', () => {
    const game: GameForScoring = { ...baseGame, hole_segment: 'back9' };
    // Deliberately include front-9 rows too (as if callers forgot to
    // redirect/scope scores) — they must never leak into the back9 result.
    const scores: ScoreRow[] = [
      ...[1, 2, 3].map((h) => scoreRow('p1', h, 9)), // out-of-scope noise
      ...Array.from({ length: 9 }, (_, i) => scoreRow('p1', i + 10, 4)),
      ...Array.from({ length: 9 }, (_, i) => scoreRow('p2', i + 10, 4)),
    ];

    const result = buildModeResultFromData(
      game,
      [player('p1', 1), player('p2', 1)],
      HOLES_18,
      scores,
    ) as BestBallResult;

    expect(result.kind).toBe('best_ball');
    expect(result.teams[0].holes.map((h) => h.holeNumber)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    expect(result.teams[0].missingHoles).toEqual([]);
  });

  it('front9 scopes course_holes to 1-9', () => {
    const game: GameForScoring = { ...baseGame, hole_segment: 'front9' };
    const scores: ScoreRow[] = [
      ...Array.from({ length: 9 }, (_, i) => scoreRow('p1', i + 1, 4)),
      ...Array.from({ length: 9 }, (_, i) => scoreRow('p2', i + 1, 4)),
    ];

    const result = buildModeResultFromData(
      game,
      [player('p1', 1), player('p2', 1)],
      HOLES_18,
      scores,
    ) as BestBallResult;

    expect(result.teams[0].holes.map((h) => h.holeNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });
});

// #1894: the finish pipeline persists this result. A scores read cut at the
// PostgREST row cap (1 000) would score the last players on too few holes.
describe('buildModeResultForGame — scores past the row cap', () => {
  it('scores every player on all 18 holes when the game has 1 008 score rows', async () => {
    const userIds = Array.from({ length: 56 }, (_, i) => `p${i + 1}`);
    const scores = userIds.flatMap((id) =>
      Array.from({ length: 18 }, (_, h) => scoreRow(id, h + 1, 4)),
    );
    const fake = createAdminClientMock({
      respond: (op) => {
        if (op.table === 'game_players') return { data: userIds.map((id) => player(id, 0)) };
        if (op.table === 'course_holes') return { data: HOLES_18 };
        if (op.table === 'scores') {
          const [from, to] = op.range ?? [0, scores.length];
          return { data: scores.slice(from, Math.min(to + 1, from + 1000)) };
        }
        throw new Error(`unexpected query: ${op.table}`);
      },
    });

    const result = (await buildModeResultForGame(
      fake.client as unknown as Parameters<typeof buildModeResultForGame>[0],
      {
        ...baseGame,
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
      },
    )) as StablefordSoloResult;

    expect(result.players.map((p) => p.holesPlayed)).toEqual(userIds.map(() => 18));
  });
});

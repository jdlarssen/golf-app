import { describe, it, expect } from 'vitest';
import {
  buildContextForMode,
  buildModeResultFromData,
  type GameForScoring,
} from './buildModeResultFromData';
import { buildUniformContext } from './context/buildUniformContext';
import type { CourseHoleRow, ScoreRow } from '@/lib/supabase/queryFragments';
import type { BestBallResult, GameModeConfig } from './modes/types';

// #2228: the format switch has one home outside `server-only`, so the native
// app calls it instead of keeping its own copy.

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
  course_handicap: 0,
  tee_gender: 'mens' as const,
  withdrawn_at: null as string | null,
  users: { name: userId, nickname: null },
});

const scoreRow = (userId: string, holeNumber: number, strokes: number): ScoreRow => ({
  user_id: userId,
  hole_number: holeNumber,
  strokes,
});

describe('buildContextForMode', () => {
  it('builds a wolf context with an empty choice list when no choices are passed', () => {
    const ctx = buildContextForMode({
      gameId: 'game-1',
      gameMode: 'wolf',
      modeConfig: { kind: 'wolf', wolf_scoring: 'net' } as GameModeConfig,
      players: [player('a', 1), player('b', 2), player('c', 3)],
      holesRows: HOLES_18,
      scoresRows: [],
      extras: {},
    });

    expect(ctx.game.game_mode).toBe('wolf');
    expect(ctx.wolfChoices).toStrictEqual([]);
  });

  it('gives texas scramble the same context as buildUniformContext', () => {
    const modeConfig: GameModeConfig = {
      kind: 'texas_scramble',
      team_size: 2,
      teams_count: 2,
      team_handicap_pct: 25,
    };
    const players = [
      { ...player('a', 1), withdrawn_at: '2026-09-17T10:00:00Z' },
      player('b', 1),
      player('c', 2),
      player('d', 2),
    ];
    const scores: ScoreRow[] = [
      ...Array.from({ length: 9 }, (_, i) => scoreRow('a', i + 1, 4)),
      ...Array.from({ length: 3 }, (_, i) => scoreRow('b', i + 10, 5)),
      ...Array.from({ length: 12 }, (_, i) => scoreRow('c', i + 1, 5)),
    ];

    const ctx = buildContextForMode({
      gameId: 'game-1',
      gameMode: 'texas_scramble',
      modeConfig,
      players,
      holesRows: HOLES_18,
      scoresRows: scores,
      extras: {},
    });

    expect(ctx).toStrictEqual(
      buildUniformContext({
        gameId: 'game-1',
        gameMode: 'texas_scramble',
        modeConfig,
        players,
        holesRows: HOLES_18,
        scoresRows: scores,
      }),
    );
  });
});

describe('buildModeResultFromData', () => {
  it('back9 scopes course_holes to 10-18 and ignores front-9 score rows', () => {
    const game: GameForScoring = {
      id: 'game-1',
      game_mode: 'best_ball',
      mode_config: { team_size: 2 } as unknown as GameForScoring['mode_config'],
      course_id: 'course-1',
      hole_segment: 'back9',
    };
    const scores: ScoreRow[] = [
      ...[1, 2, 3].map((h) => scoreRow('p1', h, 9)),
      ...Array.from({ length: 9 }, (_, i) => scoreRow('p1', i + 10, 4)),
      ...Array.from({ length: 9 }, (_, i) => scoreRow('p2', i + 10, 4)),
    ];

    const result = buildModeResultFromData(
      game,
      [
        { ...player('p1', 1), flight_number: null },
        { ...player('p2', 1), flight_number: null },
      ],
      HOLES_18,
      scores,
    ) as BestBallResult;

    expect(result.kind).toBe('best_ball');
    expect(result.teams[0].holes.map((h) => h.holeNumber)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    expect(result.teams[0].missingHoles).toEqual([]);
  });
});

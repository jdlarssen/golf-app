import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from './index';
import type { ScoringContext } from './modes/types';

describe('computeLeaderboard — mode-router', () => {
  it('delegerer best_ball_netto til bestBallNetto.compute', () => {
    const ctx: ScoringContext = {
      game: {
        id: 'g',
        game_mode: 'best_ball_netto',
        mode_config: { kind: 'best_ball_netto', team_size: 2, teams_count: 4 },
      },
      players: [
        { userId: 'p1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'p2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'p3', teamNumber: 2, flightNumber: 1, courseHandicap: 0 },
        { userId: 'p4', teamNumber: 2, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        par: 4,
        strokeIndex: i + 1,
      })),
      scores: [],
    };

    const result = computeLeaderboard(ctx);
    expect(result.kind).toBe('best_ball_netto');
    if (result.kind === 'best_ball_netto') {
      expect(result.teams.length).toBe(2);
    }
  });

  it('delegerer stableford til stableford.compute', () => {
    const ctx: ScoringContext = {
      game: {
        id: 'g',
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
      },
      players: [
        { userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: [{ number: 1, par: 4, strokeIndex: 1 }],
      scores: [{ userId: 'u1', holeNumber: 1, gross: 4 }],
    };

    const result = computeLeaderboard(ctx);
    expect(result.kind).toBe('stableford');
    if (result.kind === 'stableford' && result.variant === 'solo') {
      expect(result.players).toEqual([
        { userId: 'u1', totalPoints: 2, rank: 1, holesPlayed: 1, tiedWith: [] },
      ]);
    } else {
      throw new Error('expected stableford solo result');
    }
  });

  it('delegerer singles_matchplay til singlesMatchplay.compute', () => {
    const ctx: ScoringContext = {
      game: {
        id: 'g',
        game_mode: 'singles_matchplay',
        mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
      },
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'b', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      ],
      holes: [{ number: 1, par: 4, strokeIndex: 1 }],
      scores: [
        { userId: 'a', holeNumber: 1, gross: 4 },
        { userId: 'b', holeNumber: 1, gross: 5 },
      ],
    };

    const result = computeLeaderboard(ctx);
    expect(result.kind).toBe('singles_matchplay');
    if (result.kind === 'singles_matchplay') {
      expect(result.sides[0].userId).toBe('a');
      expect(result.sides[1].userId).toBe('b');
      expect(result.holesUp).toBe(1);
      expect(result.holes[0].result).toBe('side1_wins');
    } else {
      throw new Error('expected singles_matchplay result');
    }
  });
});

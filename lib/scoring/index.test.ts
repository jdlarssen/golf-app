import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from './index';
import type { ScoringContext } from './modes/types';

describe('computeLeaderboard — mode-router', () => {
  it('delegerer best_ball til bestBall.compute', () => {
    const ctx: ScoringContext = {
      game: {
        id: 'g',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
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
    expect(result.kind).toBe('best_ball');
    if (result.kind === 'best_ball') {
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
        { userId: 'u1', totalPoints: 2, rank: 1, holesPlayed: 1, tiedWith: [], decidedBy: null },
      ]);
    } else {
      throw new Error('expected stableford solo result');
    }
  });

  it('delegerer modified_stableford til modifiedStableford.compute (pro-tabell, kind: stableford)', () => {
    const ctx: ScoringContext = {
      game: {
        id: 'g',
        game_mode: 'modified_stableford',
        mode_config: { kind: 'modified_stableford', team_size: 1, points_table: 'modified' },
      },
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 }],
      holes: [{ number: 1, par: 4, strokeIndex: 1 }],
      scores: [{ userId: 'u1', holeNumber: 1, gross: 6 }], // dobbeltbogey → −3
    };

    const result = computeLeaderboard(ctx);
    // Gjenbruker stableford-resultatet → kind: 'stableford'.
    expect(result.kind).toBe('stableford');
    if (result.kind === 'stableford' && result.variant === 'solo') {
      expect(result.players[0].totalPoints).toBe(-3);
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

  it('delegerer solo_strokeplay til soloStrokeplay.compute', () => {
    const ctx: ScoringContext = {
      game: {
        id: 'g',
        game_mode: 'solo_strokeplay',
        mode_config: { kind: 'solo_strokeplay', team_size: 1 },
      },
      players: [
        { userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'u2', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: [{ number: 1, par: 4, strokeIndex: 1 }],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
      ],
    };

    const result = computeLeaderboard(ctx);
    expect(result.kind).toBe('solo_strokeplay');
    if (result.kind === 'solo_strokeplay') {
      expect(result.players[0].userId).toBe('u1');
      expect(result.players[0].totalNetStrokes).toBe(4);
      expect(result.players[0].rank).toBe(1);
      expect(result.players[1].userId).toBe('u2');
      expect(result.players[1].totalNetStrokes).toBe(5);
      expect(result.players[1].rank).toBe(2);
    } else {
      throw new Error('expected solo_strokeplay result');
    }
  });
});

// #2579: every result form the new boards read carries `decidedBy` from
// `rankTeams`. Same three entrants everywhere: b wins, a is level with b on
// total but loses the back nine, c is one stroke (one point) worse.
describe('computeLeaderboard — decidedBy carried through', () => {
  const holes = Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
  const gross: Record<'a' | 'b' | 'c', (hole: number) => number> = {
    a: () => 4,
    b: (hole) => (hole === 1 ? 5 : hole === 10 ? 3 : 4),
    c: (hole) => (hole === 1 ? 5 : 4),
  };
  const ids = ['a', 'b', 'c'] as const;
  const ctxFor = (
    game_mode: ScoringContext['game']['game_mode'],
    mode_config: ScoringContext['game']['mode_config'],
    teams: boolean,
  ): ScoringContext => ({
    game: { id: 'g', game_mode, mode_config },
    players: ids.map((userId, i) => ({
      userId,
      teamNumber: teams ? i + 1 : null,
      flightNumber: 1,
      courseHandicap: 0,
    })),
    holes,
    scores: ids.flatMap((userId) =>
      holes.map((h) => ({ userId, holeNumber: h.number, gross: gross[userId](h.number) })),
    ),
  });
  const byTeam = (teams: { teamNumber: number; decidedBy?: unknown }[]) =>
    Object.fromEntries(teams.map((t) => [ids[t.teamNumber - 1], t.decidedBy]));
  const byUser = (players: { userId: string; decidedBy?: unknown }[]) =>
    Object.fromEntries(players.map((p) => [p.userId, p.decidedBy]));

  it.each([
    [
      'stableford solo',
      ctxFor('stableford', { kind: 'stableford', team_size: 1, points_table: 'standard' }, false),
    ],
    [
      'stableford team',
      ctxFor('stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }, true),
    ],
    ['solo_strokeplay', ctxFor('solo_strokeplay', { kind: 'solo_strokeplay', team_size: 1 }, false)],
    [
      'texas_scramble',
      ctxFor(
        'texas_scramble',
        { kind: 'texas_scramble', team_size: 2, teams_count: 3, team_handicap_pct: 25 },
        true,
      ),
    ],
    ['best_ball', ctxFor('best_ball', { kind: 'best_ball', team_size: 2, teams_count: 3 }, true)],
    [
      'shamble',
      ctxFor(
        'shamble',
        {
          kind: 'shamble',
          team_size: 3,
          teams_count: 3,
          shamble_variant: 'champagne',
          shamble_count: 1,
          shamble_scoring: 'gross',
        } as never,
        true,
      ),
    ],
  ])('%s', (_name, ctx) => {
    const result = computeLeaderboard(ctx);
    const decided =
      result.kind === 'stableford'
        ? result.variant === 'solo'
          ? byUser(result.players)
          : byTeam(result.teams)
        : result.kind === 'solo_strokeplay'
          ? byUser(result.players)
          : result.kind === 'texas_scramble' ||
              result.kind === 'best_ball' ||
              result.kind === 'shamble'
            ? byTeam(result.teams)
            : null;
    expect(decided).toEqual({ a: 'back9', b: null, c: 'total' });
  });
});

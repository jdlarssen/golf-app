import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from '@/lib/scoring';
import type {
  BestBallResult,
  GameModeConfig,
  ScoringContext,
  TexasScrambleResult,
} from '@/lib/scoring/modes/types';
import { resultStanding, type TeamBoardResult } from './resultBoard';
import {
  bestBallHoleCard,
  scrambleHoleCard,
  teamDisplayUnit,
  teamHoleTones,
  teamLiveBoard,
  withoutLatestHolePerTeam,
} from './teamLiveBoard';

// Type A (#2579): the live team board's own logic. Ranks, totals and N come
// from the engine and from resultBoard.ts (tested there); this tests the
// tone per hole, the unit, the movement since the team's latest hole and the
// «DITT LAG PÅ HULL N» models.

const teamName = (n: number) => `Lag ${n}`;

type Plan = Record<string, { team: number; ch?: number; gross: (number | null)[] }>;

function ctx(
  game_mode: ScoringContext['game']['game_mode'],
  mode_config: GameModeConfig,
  plan: Plan,
  pars: number[] = [4, 4, 4],
): ScoringContext {
  return {
    game: { id: 'g', game_mode, mode_config },
    players: Object.entries(plan).map(([userId, p]) => ({
      userId,
      teamNumber: p.team,
      flightNumber: 1,
      courseHandicap: p.ch ?? 0,
    })),
    holes: pars.map((par, i) => ({ number: i + 1, par, strokeIndex: i + 1 })),
    scores: Object.entries(plan).flatMap(([userId, p]) =>
      p.gross.flatMap((gross, i) => (gross === null ? [] : [{ userId, holeNumber: i + 1, gross }])),
    ),
  };
}

// Team 1 plays three holes: one under, par, two over. Team 2 plays one, a bogey.
const plan: Plan = {
  a1: { team: 1, gross: [3, 4, 6] },
  a2: { team: 1, gross: [3, 4, 6] },
  b1: { team: 2, gross: [5, null, null] },
  b2: { team: 2, gross: [5, null, null] },
};

const FORMATS: [string, ScoringContext, number, 'net' | 'gross' | 'points'][] = [
  ['texas', ctx('texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 0 }, plan), 13, 'net'],
  ['best ball', ctx('best_ball', { kind: 'best_ball', team_size: 2, teams_count: 2 }, plan), 13, 'net'],
  [
    'shamble, net',
    ctx('shamble', { kind: 'shamble', team_size: 3, teams_count: 2, shamble_variant: 'champagne', shamble_count: 1, shamble_scoring: 'net' }, plan),
    13,
    'net',
  ],
  [
    'shamble, gross',
    ctx('shamble', { kind: 'shamble', team_size: 3, teams_count: 2, shamble_variant: 'champagne', shamble_count: 1, shamble_scoring: 'gross' }, plan),
    13,
    'gross',
  ],
  // Stableford: 3 + 2 + 0 points; the tone follows the lowest net.
  ['team stableford', ctx('stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }, plan), 5, 'points'],
];

describe('teamLiveBoard — total, unit and tone per format', () => {
  it.each(FORMATS)('%s', (_name, context, total, unit) => {
    const result = computeLeaderboard(context) as TeamBoardResult;
    const board = teamLiveBoard(result, null, teamName);
    expect(teamDisplayUnit(result)).toBe(unit);
    const t1 = board.rows.find((r) => r.teamNumber === 1)!;
    const t2 = board.rows.find((r) => r.teamNumber === 2)!;
    expect(t1.total).toBe(total);
    expect(t1.tones.map((h) => h.tone)).toEqual(['under', 'par', 'over2']);
    expect(t2.tones.map((h) => h.tone)).toEqual(['over1', 'unset', 'unset']);
    expect(t1.recent).toEqual(['under', 'par', 'over2']);
    expect(t2.recent).toEqual(['over1']);
  });
});

describe('teamLiveBoard — the tone is net, and the better partner’s points in team stableford', () => {
  // One stroke on every hole: CH 18 for the player (best ball, stableford), or
  // team handicap 18 in texas (50 % of 18 + 18). Gross 4, 5, 6 on par 4 is net
  // 3, 4, 5: under, par, bogey, where gross would say par, bogey, double.
  const rest = { b1: { team: 2, gross: [4, 4, 4] }, b2: { team: 2, gross: [4, 4, 4] } };
  it.each([
    [
      'texas',
      ctx('texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 50 }, {
        a1: { team: 1, ch: 18, gross: [4, 5, 6] },
        a2: { team: 1, ch: 18, gross: [4, 5, 6] },
        ...rest,
      }),
    ],
    [
      // The mate's ball (CH 0, net 5, 6, 7) never counts; the team's gross
      // (4, 5, 6) would give the gross tones.
      'best ball',
      ctx('best_ball', { kind: 'best_ball', team_size: 2, teams_count: 2 }, {
        a1: { team: 1, ch: 18, gross: [4, 5, 6] },
        a2: { team: 1, gross: [5, 6, 7] },
        ...rest,
      }),
    ],
  ])('%s: the tone follows the team’s net', (_name, context) => {
    const board = teamLiveBoard(computeLeaderboard(context) as TeamBoardResult, null, teamName);
    expect(board.rows.find((r) => r.teamNumber === 1)!.tones.map((h) => h.tone)).toEqual(['under', 'par', 'over1']);
  });

  it('team stableford: the points of the better partner on each hole', () => {
    // a1 (CH 18) nets 3, 4, 5 (3, 2, 1 points); a2 (CH 0) nets 3, 6, 4 (3, 0,
    // 2). The team gets 3, 2, 2. The first player's, the worse player's or
    // the gross scores all give other tones.
    const context = ctx('stableford', { kind: 'stableford', team_size: 2, points_table: 'standard' }, {
      a1: { team: 1, ch: 18, gross: [4, 5, 6] },
      a2: { team: 1, gross: [3, 6, 4] },
      ...rest,
    });
    const board = teamLiveBoard(computeLeaderboard(context) as TeamBoardResult, null, teamName);
    expect(board.rows.find((r) => r.teamNumber === 1)!.tones.map((h) => h.tone)).toEqual(['under', 'par', 'par']);
  });
});

describe('teamHoleTones — team stableford follows the points the team got', () => {
  // A mixed team on a hole that is par 4 from the men's tee and par 5 from the
  // ladies'. The team's points are the better partner's (`teamPoints`), so the
  // tone is read from those points, in the game's own table.
  function mixed(kind: 'stableford' | 'modified_stableford', he: number, she: number): ScoringContext {
    return {
      game: {
        id: 'g',
        game_mode: kind,
        mode_config:
          kind === 'stableford'
            ? { kind, team_size: 2, points_table: 'standard' }
            : { kind, team_size: 2, points_table: 'modified' },
      },
      players: [
        { userId: 'he', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
        { userId: 'she', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'ladies' },
        { userId: 'x', teamNumber: 2, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
        { userId: 'y', teamNumber: 2, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
      ],
      holes: [{ number: 1, par: 4, parByGender: { mens: 4, ladies: 5, juniors: 4 }, strokeIndex: 1 }],
      scores: [
        { userId: 'he', holeNumber: 1, gross: he },
        { userId: 'she', holeNumber: 1, gross: she },
        { userId: 'x', holeNumber: 1, gross: 4 },
        { userId: 'y', holeNumber: 1, gross: 4 },
      ],
    };
  }
  const toneOf = (context: ScoringContext, table: 'standard' | 'modified') =>
    teamHoleTones(computeLeaderboard(context) as TeamBoardResult, 1, table).map((h) => h.tone);

  it('standard: he makes a bogey (1), she a par (2), and the team’s 2 points are a par', () => {
    expect(toneOf(mixed('stableford', 5, 5), 'standard')).toEqual(['par']);
  });

  it('modified: her birdie gives the team 2 points, a birdie in that table', () => {
    expect(toneOf(mixed('modified_stableford', 4, 4), 'modified')).toEqual(['under']);
  });

  it('modified: only the partners who played count, so a lone double bogey stays over', () => {
    // The engine counts a partner without a score as 0 points, and in the
    // modified table 0 is a par: the team's max would read par over a −3.
    const context = mixed('modified_stableford', 6, 4);
    const lone = { ...context, scores: context.scores.filter((sc) => sc.userId !== 'she') };
    expect(toneOf(lone, 'modified')).toEqual(['over2']);
  });

  it('a hole nobody on the team has played has no tone, though it scores 0', () => {
    const context = mixed('stableford', 5, 5);
    const unplayed = { ...context, scores: context.scores.filter((sc) => sc.userId === 'x' || sc.userId === 'y') };
    expect(toneOf(unplayed, 'standard')).toEqual(['unset']);
  });
});

describe('teamLiveBoard — movement since each team’s latest hole', () => {
  // After hole 1 team 2 leads (4 against 5); after hole 2 team 1 leads (8 against 9).
  const moving: Plan = {
    a1: { team: 1, gross: [5, 3] },
    a2: { team: 1, gross: [5, 3] },
    b1: { team: 2, gross: [4, 5] },
    b2: { team: 2, gross: [4, 5] },
  };
  const config: GameModeConfig = { kind: 'best_ball', team_size: 2, teams_count: 2 };
  const now = ctx('best_ball', config, moving, [4, 4]);
  const teamOf = (userId: string) => (userId.startsWith('a') ? 1 : 2);

  it('drops every member’s row on the team’s latest hole', () => {
    const rows = now.scores.map((s) => ({ user_id: s.userId, hole_number: s.holeNumber, strokes: s.gross }));
    expect(withoutLatestHolePerTeam(rows, teamOf).map((r) => r.hole_number)).toEqual([1, 1, 1, 1]);
  });

  it('is the place before minus the place now', () => {
    const previous = { ...now, scores: now.scores.filter((s) => s.holeNumber === 1) };
    const board = teamLiveBoard(
      computeLeaderboard(now) as TeamBoardResult,
      computeLeaderboard(previous) as TeamBoardResult,
      teamName,
    );
    expect(board.rows.map((r) => [r.teamNumber, r.movement])).toEqual([
      [1, 1],
      [2, -1],
    ]);
  });

  it('has no movement before a team has two holes, or without a previous result', () => {
    const one = ctx('best_ball', config, { ...moving, a1: { team: 1, gross: [5, null] }, a2: { team: 1, gross: [5, null] } }, [4, 4]);
    const board = teamLiveBoard(computeLeaderboard(one) as TeamBoardResult, null, teamName);
    expect(board.rows.map((r) => r.movement)).toEqual([null, null]);
  });

  it('gives no gap between teams with a different number of holes', () => {
    const one = ctx('best_ball', config, { ...moving, a1: { team: 1, gross: [5, null] }, a2: { team: 1, gross: [5, null] } }, [4, 4]);
    const board = teamLiveBoard(computeLeaderboard(one) as TeamBoardResult, null, teamName);
    expect(resultStanding(board, (r) => r.teamNumber, 1)?.gap).toBeNull();
  });
});

describe('«DITT LAG PÅ HULL N» — the model per format', () => {
  // Scramble: gross strokes and the word on gross. Best ball: CH 18 gives a
  // stroke on every hole, so gross 7 on a par 5 is net 6, a bogey on net (a
  // double on gross), and the mate's net 7 does not count. The number and the
  // word always describe the same score.
  it.each([
    [
      'scramble',
      () =>
        scrambleHoleCard(
          computeLeaderboard(
            ctx('texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 0 }, {
              ...plan,
              a1: { team: 1, gross: [3, 4, 3] },
              a2: { team: 1, gross: [3, 4, 3] },
            }),
          ) as TexasScrambleResult,
          1,
        ),
      { holeNumber: 3, strokes: 3, term: 'birdie', overPar: -1 },
    ],
    [
      'best ball',
      () =>
        bestBallHoleCard(
          computeLeaderboard(
            ctx(
              'best_ball',
              { kind: 'best_ball', team_size: 2, teams_count: 2 },
              {
                k: { team: 1, ch: 18, gross: [7] },
                d: { team: 1, ch: 0, gross: [7] },
                x: { team: 2, gross: [5] },
                y: { team: 2, gross: [5] },
              },
              [5],
            ),
          ) as BestBallResult,
          1,
        ),
      { holeNumber: 1, net: 6, term: 'bogey', overPar: 1, contributorIds: ['k'] },
    ],
  ])('%s', (_name, card, expected) => {
    expect(card()).toEqual(expected);
  });
});

describe('scrambleHoleCard — no card', () => {
  const texas = computeLeaderboard(
    ctx('texas_scramble', { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 0 }, {
      ...plan,
      a1: { team: 1, gross: [3, 4, 3] },
      a2: { team: 1, gross: [3, 4, 3] },
    }),
  ) as TexasScrambleResult;

  it('is null for a team without a played hole, or no team', () => {
    const none = { ...texas, teams: texas.teams.map((t) => ({ ...t, holes: t.holes.map((h) => ({ ...h, teamGross: null, teamNet: null })) })) };
    expect(scrambleHoleCard(none, 1)).toBeNull();
    expect(scrambleHoleCard(texas, 9)).toBeNull();
  });
});

describe('bestBallHoleCard — the first half', () => {
  it('never reaches past hole 9 on a board clipped to the first half', () => {
    const twelve: Plan = {
      k: { team: 1, gross: Array(12).fill(4) },
      d: { team: 1, gross: Array(12).fill(5) },
      x: { team: 2, gross: Array(12).fill(5) },
      y: { team: 2, gross: Array(12).fill(5) },
    };
    const full = ctx('best_ball', { kind: 'best_ball', team_size: 2, teams_count: 2 }, twelve, Array(12).fill(4));
    const open = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const clipped = computeLeaderboard({
      ...full,
      holes: full.holes.filter((h) => open.has(h.number)),
      scores: full.scores.filter((s) => open.has(s.holeNumber)),
    }) as BestBallResult;
    expect(bestBallHoleCard(clipped, 1)?.holeNumber).toBe(9);
    const board = teamLiveBoard(clipped, null, teamName);
    expect(board.holesPlayed).toBe(9);
    expect(Math.max(...board.rows.flatMap((r) => r.tones.map((h) => h.holeNumber)))).toBe(9);
  });
});

import { describe, it, expect } from 'vitest';
import { computeLeagueStandings } from './computeLeagueStandings';
import type { LeagueStandingsConfig, LeagueRoundInput } from './types';

const cfg = (over: Partial<LeagueStandingsConfig> = {}): LeagueStandingsConfig => ({
  standingsModel: 'total',
  missedRoundPolicy: 'penalty',
  penaltyKind: 'worst_plus_one',
  penaltyFixedOverPar: null,
  ...over,
});

const score = (userId: string, netToPar: number, deliveredOutsideWindow = false) => ({
  userId,
  netToPar,
  deliveredOutsideWindow,
});

const round = (roundId: string, sequence: number, scores: LeagueRoundInput['scores']): LeagueRoundInput => ({
  roundId,
  sequence,
  scores,
});

const rowOf = (res: ReturnType<typeof computeLeagueStandings>, userId: string) =>
  res.rows.find((r) => r.userId === userId)!;

describe('computeLeagueStandings — total model', () => {
  it('sums net-to-par; missed round → worst-in-round + 1 penalty', () => {
    const rounds = [
      round('r1', 1, [score('A', 2), score('B', 5), score('C', 10)]),
      round('r2', 2, [score('A', 3), score('B', 1)]), // C missed; worst played = 3 → penalty 4
    ];
    const res = computeLeagueStandings(cfg(), rounds, ['A', 'B', 'C']);

    expect(rowOf(res, 'A').value).toBe(5); // 2 + 3
    expect(rowOf(res, 'B').value).toBe(6); // 5 + 1
    expect(rowOf(res, 'C').value).toBe(14); // 10 + (3 + 1)
    expect(res.rows.map((r) => r.userId)).toEqual(['A', 'B', 'C']);
    expect(res.rows.map((r) => r.rank)).toEqual([1, 2, 3]);

    const cMissed = rowOf(res, 'C').perRound.find((c) => c.roundId === 'r2')!;
    expect(cMissed).toMatchObject({ netToPar: 4, penalised: true });
  });

  it('fixed penalty uses penaltyFixedOverPar for a missed round', () => {
    const rounds = [
      round('r1', 1, [score('A', 2), score('C', 10)]),
      round('r2', 2, [score('A', 3)]), // C missed
    ];
    const res = computeLeagueStandings(
      cfg({ penaltyKind: 'fixed', penaltyFixedOverPar: 8 }),
      rounds,
      ['A', 'C'],
    );
    expect(rowOf(res, 'C').value).toBe(18); // 10 + 8
    expect(rowOf(res, 'A').value).toBe(5);
  });

  it('must_play_all leaves players who missed a round unranked and last', () => {
    const rounds = [
      round('r1', 1, [score('A', 2), score('B', 5), score('C', 10)]),
      round('r2', 2, [score('A', 3), score('B', 1)]), // C missed
    ];
    const res = computeLeagueStandings(cfg({ missedRoundPolicy: 'must_play_all' }), rounds, ['A', 'B', 'C']);

    expect(rowOf(res, 'A').ranked).toBe(true);
    expect(rowOf(res, 'B').ranked).toBe(true);
    expect(rowOf(res, 'C').ranked).toBe(false);
    expect(rowOf(res, 'C').rank).toBeNull();
    expect(res.rows[res.rows.length - 1].userId).toBe('C'); // unranked sorted last
    expect(rowOf(res, 'A').rank).toBe(1);
    expect(rowOf(res, 'B').rank).toBe(2);
  });

  it('breaks ties by countback on the most recent round (lower is better)', () => {
    const rounds = [
      round('r1', 1, [score('A', 5), score('B', 3)]),
      round('r2', 2, [score('A', 1), score('B', 3)]), // totals tie at 6
    ];
    const res = computeLeagueStandings(cfg(), rounds, ['A', 'B']);
    expect(rowOf(res, 'A').value).toBe(6);
    expect(rowOf(res, 'B').value).toBe(6);
    expect(res.rows[0].userId).toBe('A'); // A won the last round (1 < 3)
    expect(rowOf(res, 'A').rank).toBe(1);
    expect(rowOf(res, 'B').rank).toBe(2);
  });

  it('dedupes multiple scores for the same player in a round to the best (lowest)', () => {
    const rounds = [round('r1', 1, [score('A', 5), score('A', 2), score('B', 4)])];
    const res = computeLeagueStandings(cfg(), rounds, ['A', 'B']);
    expect(rowOf(res, 'A').value).toBe(2);
    expect(rowOf(res, 'A').rank).toBe(1);
  });

  it('ignores rounds with no results (no penalty, null cells)', () => {
    const rounds = [
      round('r1', 1, [score('A', 2), score('B', 4)]),
      round('r2', 2, []), // nobody played
    ];
    const res = computeLeagueStandings(cfg(), rounds, ['A', 'B']);
    expect(rowOf(res, 'A').value).toBe(2);
    expect(rowOf(res, 'A').roundsPlayed).toBe(1);
    const aR2 = rowOf(res, 'A').perRound.find((c) => c.roundId === 'r2')!;
    expect(aR2).toMatchObject({ netToPar: null, penalised: false });
  });

  it('penalises a player who played nothing under the penalty policy', () => {
    const rounds = [round('r1', 1, [score('A', 2)])];
    const res = computeLeagueStandings(cfg(), rounds, ['A', 'B']);
    expect(rowOf(res, 'B').value).toBe(3); // worst (2) + 1
    expect(rowOf(res, 'B').ranked).toBe(true);
    expect(rowOf(res, 'A').rank).toBe(1);
  });

  it('carries the delivered-outside-window flag onto the round cell', () => {
    const rounds = [round('r1', 1, [score('A', 2, true)])];
    const res = computeLeagueStandings(cfg(), rounds, ['A']);
    const cell = rowOf(res, 'A').perRound.find((c) => c.roundId === 'r1')!;
    expect(cell.deliveredOutsideWindow).toBe(true);
  });
});

describe('computeLeagueStandings — average model', () => {
  it('ranks by mean net-to-par over played rounds (no penalty)', () => {
    const rounds = [
      round('r1', 1, [score('A', 2), score('B', 6)]),
      round('r2', 2, [score('A', 4)]), // B missed
    ];
    const res = computeLeagueStandings(cfg({ standingsModel: 'average' }), rounds, ['A', 'B']);
    expect(rowOf(res, 'A').value).toBe(3); // (2 + 4) / 2
    expect(rowOf(res, 'B').value).toBe(6); // 6 / 1
    expect(rowOf(res, 'A').rank).toBe(1);
    expect(rowOf(res, 'B').rank).toBe(2);
  });

  it('marks a player with zero played rounds as unranked', () => {
    const rounds = [round('r1', 1, [score('A', 2)])];
    const res = computeLeagueStandings(cfg({ standingsModel: 'average' }), rounds, ['A', 'B']);
    expect(rowOf(res, 'B').ranked).toBe(false);
    expect(rowOf(res, 'A').rank).toBe(1);
  });
});

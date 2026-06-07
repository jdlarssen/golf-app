import { describe, it, expect } from 'vitest';
import { computeLeagueStandings } from './computeLeagueStandings';
import type { LeagueStandingsConfig, LeagueRoundInput } from './types';

const cfg = (over: Partial<LeagueStandingsConfig> = {}): LeagueStandingsConfig => ({
  standingsModel: 'total',
  missedRoundPolicy: 'penalty',
  penaltyKind: 'worst_plus_one',
  penaltyFixedOverPar: null,
  bestNCount: null,
  ...over,
});

// gross defaults to net so net-only tests need no extra metric; pass { gross } to differ.
const score = (
  userId: string,
  netToPar: number,
  opts: { gross?: number; outside?: boolean } = {},
) => ({
  userId,
  netToPar,
  grossToPar: opts.gross ?? netToPar,
  deliveredOutsideWindow: opts.outside ?? false,
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
    expect(cMissed).toMatchObject({ toPar: 4, penalised: true });
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
    expect(aR2).toMatchObject({ toPar: null, penalised: false });
  });

  it('penalises a player who played nothing under the penalty policy', () => {
    const rounds = [round('r1', 1, [score('A', 2)])];
    const res = computeLeagueStandings(cfg(), rounds, ['A', 'B']);
    expect(rowOf(res, 'B').value).toBe(3); // worst (2) + 1
    expect(rowOf(res, 'B').ranked).toBe(true);
    expect(rowOf(res, 'A').rank).toBe(1);
  });

  it('carries the delivered-outside-window flag onto the round cell', () => {
    const rounds = [round('r1', 1, [score('A', 2, { outside: true })])];
    const res = computeLeagueStandings(cfg(), rounds, ['A']);
    const cell = rowOf(res, 'A').perRound.find((c) => c.roundId === 'r1')!;
    expect(cell.deliveredOutsideWindow).toBe(true);
  });
});

describe('computeLeagueStandings — gross metric', () => {
  it('ranks on gross-to-par when metric is "gross" (distinct from net)', () => {
    const rounds = [
      // A is the better net player but a worse gross player than B.
      round('r1', 1, [score('A', 2, { gross: 12 }), score('B', 5, { gross: 7 })]),
      round('r2', 2, [score('A', 3, { gross: 13 }), score('B', 1, { gross: 4 })]),
    ];
    const net = computeLeagueStandings(cfg(), rounds, ['A', 'B'], 'net');
    expect(net.rows[0].userId).toBe('A'); // net 5 < 6

    const gross = computeLeagueStandings(cfg(), rounds, ['A', 'B'], 'gross');
    expect(rowOf(gross, 'A').value).toBe(25); // 12 + 13
    expect(rowOf(gross, 'B').value).toBe(11); // 7 + 4
    expect(gross.rows[0].userId).toBe('B'); // gross 11 < 25
    const aCell = rowOf(gross, 'A').perRound.find((c) => c.roundId === 'r1')!;
    expect(aCell.toPar).toBe(12); // cell shows gross under gross metric
  });

  it('computes the penalty from the active metric', () => {
    const rounds = [
      round('r1', 1, [score('A', 2, { gross: 9 }), score('B', 4, { gross: 11 })]),
      round('r2', 2, [score('A', 3, { gross: 10 })]), // B missed; worst gross = 10 → penalty 11
    ];
    const gross = computeLeagueStandings(cfg(), rounds, ['A', 'B'], 'gross');
    expect(rowOf(gross, 'B').value).toBe(22); // 11 + (10 + 1)
  });
});

describe('computeLeagueStandings — best_n model', () => {
  const bestN = (n: number, over: Partial<LeagueStandingsConfig> = {}) =>
    cfg({ standingsModel: 'best_n', bestNCount: n, ...over });

  it('sums only the N best (lowest) rounds, dropping worse ones', () => {
    const rounds = [
      round('r1', 1, [score('A', 5), score('B', 2)]),
      round('r2', 2, [score('A', 1), score('B', 2)]),
      round('r3', 3, [score('A', 8), score('B', 2)]),
    ];
    const res = computeLeagueStandings(bestN(2), rounds, ['A', 'B']);
    expect(rowOf(res, 'A').value).toBe(6); // best 2 of {5,1,8} = 1 + 5
    expect(rowOf(res, 'B').value).toBe(4); // best 2 of {2,2,2} = 2 + 2
    expect(rowOf(res, 'A').roundsPlayed).toBe(3);
  });

  it('penalty-fills up to N when a player has played fewer than N rounds', () => {
    const rounds = [
      round('r1', 1, [score('A', 3), score('B', 4)]),
      round('r2', 2, [score('A', 2), score('B', 6)]),
      round('r3', 3, [score('A', 5), score('B', 1)]),
    ];
    // C played nothing: each round penalty = worst-in-round + 1 → r1:5, r2:7, r3:6.
    const res = computeLeagueStandings(bestN(3), rounds, ['A', 'B', 'C']);
    expect(rowOf(res, 'A').value).toBe(10); // 3 + 2 + 5
    expect(rowOf(res, 'C').value).toBe(18); // best 3 of penalties {5,7,6} = 5 + 6 + 7
    expect(rowOf(res, 'C').ranked).toBe(true); // penalty-fill keeps them ranked, last
    expect(rowOf(res, 'C').roundsPlayed).toBe(0);
    expect(res.rows[res.rows.length - 1].userId).toBe('C');
  });

  it('mixes played rounds with penalty fill when played < N', () => {
    const rounds = [
      round('r1', 1, [score('A', 2), score('B', 9)]),
      round('r2', 2, [score('A', 3), score('B', 9)]),
      round('r3', 3, [score('A', 4)]), // B missed; worst = 4 → penalty 5
    ];
    // B: played {9,9} + penalty {5} → best 3 of {9,9,5} = 5 + 9 + 9 = 23
    const res = computeLeagueStandings(bestN(3), rounds, ['A', 'B']);
    expect(rowOf(res, 'B').value).toBe(23);
  });

  it('uses fixed penalty for the fill when penaltyKind is fixed', () => {
    const rounds = [
      round('r1', 1, [score('A', 2), score('B', 3)]),
      round('r2', 2, [score('A', 4)]), // B missed
    ];
    const res = computeLeagueStandings(bestN(2, { penaltyKind: 'fixed', penaltyFixedOverPar: 10 }), rounds, ['A', 'B']);
    expect(rowOf(res, 'B').value).toBe(13); // 3 + 10
  });

  it('caps N at the number of rounds with results (N too high → sum all)', () => {
    const rounds = [round('r1', 1, [score('A', 4), score('B', 6)])];
    const res = computeLeagueStandings(bestN(5), rounds, ['A', 'B']);
    expect(rowOf(res, 'A').value).toBe(4); // only one round exists
    expect(rowOf(res, 'B').value).toBe(6);
  });

  it('marks a player unranked only when no round has results yet', () => {
    const rounds = [round('r1', 1, []), round('r2', 2, [])];
    const res = computeLeagueStandings(bestN(2), rounds, ['A']);
    expect(rowOf(res, 'A').ranked).toBe(false);
  });

  it('leaves per-round cells as played-or-null (no penalty display) under best_n', () => {
    const rounds = [
      round('r1', 1, [score('A', 3), score('B', 4)]),
      round('r2', 2, [score('A', 2)]), // B missed
    ];
    const res = computeLeagueStandings(bestN(2), rounds, ['A', 'B']);
    const bMissed = rowOf(res, 'B').perRound.find((c) => c.roundId === 'r2')!;
    expect(bMissed).toMatchObject({ toPar: null, penalised: false });
  });
});

describe('computeLeagueStandings — points model', () => {
  const points = (over: Partial<LeagueStandingsConfig> = {}) =>
    cfg({ standingsModel: 'points', ...over });

  it('awards descending points by placement and sums them, highest wins', () => {
    const rounds = [
      round('r1', 1, [score('A', 2), score('B', 5), score('C', 10)]), // A=3, B=2, C=1
      round('r2', 2, [score('A', 3), score('B', 1)]), // B=2, A=1; C missed → 0
    ];
    const res = computeLeagueStandings(points(), rounds, ['A', 'B', 'C']);
    expect(rowOf(res, 'A').value).toBe(4); // 3 + 1
    expect(rowOf(res, 'B').value).toBe(4); // 2 + 2
    expect(rowOf(res, 'C').value).toBe(1); // 1 + 0
    // A & B tie at 4; countback on most recent round (r2): B=2 > A=1 → B first.
    expect(res.rows[0].userId).toBe('B');
    expect(res.rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    const aR1 = rowOf(res, 'A').perRound.find((c) => c.roundId === 'r1')!;
    expect(aR1.points).toBe(3);
  });

  it('splits points by the average of tied placements', () => {
    const rounds = [round('r1', 1, [score('A', 4), score('B', 4), score('C', 9)])];
    const res = computeLeagueStandings(points(), rounds, ['A', 'B', 'C']);
    expect(rowOf(res, 'A').value).toBe(2.5); // (3 + 2) / 2
    expect(rowOf(res, 'B').value).toBe(2.5);
    expect(rowOf(res, 'C').value).toBe(1);
  });

  it('gives 0 points for a missed round (cell null) and leaves a no-show unranked', () => {
    const rounds = [round('r1', 1, [score('A', 2), score('B', 5)])]; // A=2, B=1
    const res = computeLeagueStandings(points(), rounds, ['A', 'B', 'C']);
    expect(rowOf(res, 'A').value).toBe(2);
    expect(rowOf(res, 'B').value).toBe(1);
    expect(rowOf(res, 'C').ranked).toBe(false);
    expect(rowOf(res, 'C').value).toBe(0);
    expect(res.rows[res.rows.length - 1].userId).toBe('C');
    const cCell = rowOf(res, 'C').perRound.find((c) => c.roundId === 'r1')!;
    expect(cCell.points).toBeNull();
    expect(rowOf(res, 'A').rank).toBe(1);
  });

  it('assigns placement on the active metric (net vs gross differ)', () => {
    const rounds = [round('r1', 1, [score('A', 2, { gross: 12 }), score('B', 5, { gross: 7 })])];
    const net = computeLeagueStandings(points(), rounds, ['A', 'B'], 'net');
    expect(rowOf(net, 'A').value).toBe(2); // A wins net → 2 pts
    expect(net.rows[0].userId).toBe('A');

    const gross = computeLeagueStandings(points(), rounds, ['A', 'B'], 'gross');
    expect(rowOf(gross, 'B').value).toBe(2); // B wins gross → 2 pts
    expect(gross.rows[0].userId).toBe('B');
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

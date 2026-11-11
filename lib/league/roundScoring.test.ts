import { describe, it, expect } from 'vitest';
import { computeFlightCard, computeFlightRoundValues, type FlightScoringInput } from './roundScoring';
import { computeLeagueStandings } from './computeLeagueStandings';
import { compute as computeStableford } from '@/lib/scoring/modes/stableford';
import type { ScoringPlayer, ScoringHole, ScoringHoleScore } from '@/lib/scoring/modes/types';
import type { LeagueFormat, StandingsMetric } from './types';

// 3-hull-bane, total par 11 (4/4/3). Spillere har courseHandicap 0 så netto =
// brutto og stableford-poeng er trivielle å regne for hånd (par→2, bogey→1
// standard; par→0, bogey→−1 modifisert).
const HOLES: ScoringHole[] = [
  { number: 1, par: 4, strokeIndex: 1 },
  { number: 2, par: 4, strokeIndex: 2 },
  { number: 3, par: 3, strokeIndex: 3 },
];
const TEE_PAR = 11;

const player = (userId: string): ScoringPlayer => ({
  userId,
  teamNumber: 1,
  flightNumber: 1,
  courseHandicap: 0,
  teeGender: 'mens',
});

const card = (userId: string, strokes: (number | null)[]): ScoringHoleScore[] =>
  strokes.map((gross, i) => ({ userId, holeNumber: i + 1, gross }));

const input = (format: LeagueFormat, over: Partial<FlightScoringInput> = {}): FlightScoringInput => ({
  format,
  gameId: 'g1',
  players: [player('A'), player('B')],
  holes: HOLES,
  // A plays par-par-par (11), B plays bogey-bogey-bogey (14).
  scores: [...card('A', [4, 4, 3]), ...card('B', [5, 5, 4])],
  parByUser: new Map([
    ['A', TEE_PAR],
    ['B', TEE_PAR],
  ]),
  deliveredOutsideWindow: false,
  finishedAt: null,
  ...over,
});

const byUser = (rows: ReturnType<typeof computeFlightRoundValues>, userId: string) =>
  rows.find((r) => r.userId === userId)!;

describe('computeFlightRoundValues — stroke', () => {
  it('maps to net/gross mot-par (total strokes − tee par)', () => {
    const rows = computeFlightRoundValues(input('stroke'));
    expect(byUser(rows, 'A')).toMatchObject({ net: 0, gross: 0 }); // 11 − 11
    expect(byUser(rows, 'B')).toMatchObject({ net: 3, gross: 3 }); // 14 − 11
  });

  it('drops a player whose tee par is unknown', () => {
    const rows = computeFlightRoundValues(
      input('stroke', { parByUser: new Map([['A', TEE_PAR]]) }), // B missing
    );
    expect(rows.map((r) => r.userId)).toEqual(['A']);
  });
});

describe('computeFlightRoundValues — stableford', () => {
  it('maps to stableford points; with no handicap strokes gross equals net', () => {
    const rows = computeFlightRoundValues(input('stableford'));
    // A: 3× par = 3×2 = 6. B: 3× bogey = 3×1 = 3.
    expect(byUser(rows, 'A')).toMatchObject({ net: 6, gross: 6 });
    expect(byUser(rows, 'B')).toMatchObject({ net: 3, gross: 3 });
  });

  it('#2638: gross stableford is the points without handicap strokes', () => {
    // H has course handicap 3: one stroke on each of the three holes. Three
    // bogeys are three net pars (3×2 = 6) but three gross bogeys (3×1 = 3).
    const rows = computeFlightRoundValues(
      input('stableford', {
        players: [{ ...player('H'), courseHandicap: 3 }],
        scores: card('H', [5, 5, 4]),
        parByUser: new Map([['H', TEE_PAR]]),
      }),
    );
    expect(byUser(rows, 'H')).toMatchObject({ net: 6, gross: 3 });
  });

  it('#2638: modified stableford gross also drops the strokes', () => {
    const rows = computeFlightRoundValues(
      input('modified_stableford', {
        players: [{ ...player('H'), courseHandicap: 3 }],
        scores: card('H', [5, 5, 4]),
        parByUser: new Map([['H', TEE_PAR]]),
      }),
    );
    // Net: three net pars = 0. Gross: three bogeys = −3.
    expect(byUser(rows, 'H')).toMatchObject({ net: 0, gross: -3 });
  });
});

describe('computeFlightRoundValues — a flight of one (#2638, simulator league)', () => {
  it.each(['stroke', 'stableford', 'modified_stableford'] as LeagueFormat[])(
    '%s: scores the one player who took the round alone',
    (format) => {
      const rows = computeFlightRoundValues(
        input(format, {
          players: [player('A')],
          scores: card('A', [4, 4, 3]),
          parByUser: new Map([['A', TEE_PAR]]),
        }),
      );
      expect(rows.map((r) => r.userId)).toEqual(['A']);
    },
  );
});

describe('computeFlightRoundValues — modified_stableford', () => {
  it('maps to modified points (par→0, bogey→−1)', () => {
    const rows = computeFlightRoundValues(input('modified_stableford'));
    expect(byUser(rows, 'A')).toMatchObject({ net: 0, gross: 0 }); // 3× par
    expect(byUser(rows, 'B')).toMatchObject({ net: -3, gross: -3 }); // 3× bogey
  });
});

describe('computeFlightRoundValues — complete-card rule', () => {
  it.each(['stroke', 'stableford', 'modified_stableford'] as LeagueFormat[])(
    '%s: excludes an incomplete card',
    (format) => {
      const rows = computeFlightRoundValues(
        input(format, {
          players: [player('A'), player('C')],
          scores: [...card('A', [4, 4, 3]), ...card('C', [4, 4, null])], // C only 2 holes
          parByUser: new Map([
            ['A', TEE_PAR],
            ['C', TEE_PAR],
          ]),
        }),
      );
      expect(rows.map((r) => r.userId)).toEqual(['A']);
    },
  );
});

describe('computeFlightRoundValues — flag passthrough', () => {
  it('stamps deliveredOutsideWindow on every produced row', () => {
    const rows = computeFlightRoundValues(input('stableford', { deliveredOutsideWindow: true }));
    expect(rows.every((r) => r.deliveredOutsideWindow)).toBe(true);
  });

  it("#2214: stamps the flight's finishedAt on every produced row, both formats", () => {
    const at = '2026-06-15T18:00:00Z';
    const rows = [
      ...computeFlightRoundValues(input('stroke', { finishedAt: at })),
      ...computeFlightRoundValues(input('stableford', { finishedAt: at })),
    ];
    expect(rows.map((r) => r.finishedAt)).toEqual([at, at, at, at]);
  });

  it('#2815: stamps the flight game on every produced row, both formats', () => {
    const rows = [
      ...computeFlightRoundValues(input('stroke', { gameId: 'flight-7' })),
      ...computeFlightRoundValues(input('stableford', { gameId: 'flight-7' })),
    ];
    expect(rows.map((r) => r.gameId)).toEqual(['flight-7', 'flight-7', 'flight-7', 'flight-7']);
  });
});

describe('computeFlightCard — the card behind a cell (#2815)', () => {
  // H plays 5-5-4 off course handicap 2: one stroke on SI 1 and SI 2, none on SI 3.
  // Net 4-4-4 against par 4-4-3: par, par, bogey.
  const H = { ...player('H'), courseHandicap: 2 };
  const flight = (format: LeagueFormat) =>
    input(format, {
      players: [H, player('A')],
      scores: [...card('H', [5, 5, 4]), ...card('A', [4, 4, 3])],
      parByUser: new Map([
        ['H', TEE_PAR],
        ['A', TEE_PAR],
      ]),
    });

  /** The value the season table shows for H in this round, on the axis. */
  const cellValue = (format: LeagueFormat, metric: StandingsMetric) => {
    const standings = computeLeagueStandings(
      {
        standingsModel: 'total',
        missedRoundPolicy: 'penalty',
        penaltyKind: 'worst_plus_one',
        penaltyFixedOverPar: null,
        bestNCount: null,
        pointsBased: format !== 'stroke',
      },
      [{ roundId: 'r1', sequence: 1, scores: computeFlightRoundValues(flight(format)), windowOpen: false }],
      ['H', 'A'],
      metric,
    );
    return standings.rows.find((r) => r.userId === 'H')!.perRound[0].value;
  };

  it('stroke play, net: the card adds up to the cell — net strokes minus par', () => {
    const c = computeFlightCard(flight('stroke'), 'H', 'net')!;
    expect({
      value: c.value,
      cell: cellValue('stroke', 'net'),
      fromCard: c.grid.totals.netto! - TEE_PAR,
      brutto: c.grid.totals.brutto,
      netPerHole: c.grid.halves.flatMap((h) => h.cells.map((cell) => cell.net)),
      points: c.grid.totals.points,
      playingHandicap: c.playingHandicap,
    }).toEqual({ value: 1, cell: 1, fromCard: 1, brutto: 14, netPerHole: [4, 4, 4], points: null, playingHandicap: 2 });
  });

  it('stroke play, gross: the card adds up to the gross cell, with no handicap strokes', () => {
    const c = computeFlightCard(flight('stroke'), 'H', 'gross')!;
    expect({
      value: c.value,
      cell: cellValue('stroke', 'gross'),
      fromCard: c.grid.totals.brutto - TEE_PAR,
      netto: c.grid.totals.netto,
      playingHandicap: c.playingHandicap,
    }).toEqual({ value: 3, cell: 3, fromCard: 3, netto: 14, playingHandicap: null });
  });

  it.each([
    ['stableford', 'net', 5],
    ['stableford', 'gross', 3],
    ['modified_stableford', 'net', -1],
    ['modified_stableford', 'gross', -3],
  ] as Array<[LeagueFormat, StandingsMetric, number]>)(
    '%s, %s: the points on the card add up to the cell',
    (format, metric, expected) => {
      const c = computeFlightCard(flight(format), 'H', metric)!;
      expect({ value: c.value, cell: cellValue(format, metric), fromCard: c.grid.totals.points }).toEqual({
        value: expected,
        cell: expected,
        fromCard: expected,
      });
    },
  );

  it("stableford: the points per hole are the engine's hole rows", () => {
    const c = computeFlightCard(flight('stableford'), 'H', 'net')!;
    const engine = computeStableford({
      game: { id: 'g1', game_mode: 'stableford', mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' } },
      players: [H],
      holes: HOLES,
      scores: card('H', [5, 5, 4]),
    });
    if (engine.variant !== 'solo') throw new Error('expected the solo variant');
    expect(c.grid.halves.flatMap((h) => h.cells.map((cell) => cell.points))).toEqual(
      engine.holes.map((h) => h.perPlayer[0].points),
    );
  });

  it('no card when the table has no value for the player: an incomplete card, an unknown tee par, a player not in the flight', () => {
    expect([
      computeFlightCard(input('stroke', { scores: [...card('A', [4, 4, null]), ...card('B', [5, 5, 4])] }), 'A', 'net'),
      computeFlightCard(input('stroke', { parByUser: new Map([['B', TEE_PAR]]) }), 'A', 'net'),
      computeFlightCard(input('stroke'), 'Z', 'net'),
    ]).toEqual([null, null, null]);
  });
});

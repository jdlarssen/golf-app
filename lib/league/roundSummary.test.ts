import { describe, expect, it } from 'vitest';
import type { LeagueSnapshot } from './getLigaSnapshot';
import { buildRoundSummary } from './roundSummary';

/**
 * Type A (#2979): the numbers of a round that has closed, read from the
 * league snapshot (the same table the league page shows). Nothing is computed
 * again here: the places and the gaps are the only arithmetic.
 */

const NOW = Date.parse('2026-11-23T06:41:00Z');
const DAY = 24 * 60 * 60 * 1000;

type Cell = { value: number | null; penalised?: boolean };
type PlayerSpec = { id: string; name: string | null; nickname?: string | null; rank: number | null; value: number; cells: Cell[] };

function snapshot(opts: {
  format?: string;
  model?: string;
  bestN?: number | null;
  simulator?: boolean;
  /** closes_at per round as an offset from NOW, in days. */
  closes: number[];
  players: PlayerSpec[];
  scoring?: 'net' | 'gross';
}): LeagueSnapshot {
  const rounds = opts.closes.map((offset, i) => ({
    id: `r${i + 1}`,
    sequence: i + 1,
    label: `Runde ${i + 1}`,
    opensAt: new Date(NOW + offset * DAY - 14 * DAY).toISOString(),
    closesAt: new Date(NOW + offset * DAY).toISOString(),
    courseName: i === 0 ? 'Byneset North' : 'Stiklestad',
  }));
  const rows = opts.players.map((p) => ({
    userId: p.id,
    value: p.value,
    roundsPlayed: p.cells.filter((c) => c.value !== null && !c.penalised).length,
    ranked: p.rank !== null,
    rank: p.rank,
    perRound: p.cells.map((c, i) => ({
      roundId: `r${i + 1}`,
      value: c.value,
      points: null,
      penalised: c.penalised ?? false,
      deliveredOutsideWindow: false,
      gameId: c.value !== null && !c.penalised ? `g-${p.id}-${i + 1}` : null,
    })),
  }));
  const table = { rows };
  return {
    league: {
      name: 'Vinterliga 2026-2027',
      format: opts.format ?? 'stableford',
      standings_model: opts.model ?? 'best_n',
      best_n_count: opts.bestN === undefined ? 8 : opts.bestN,
      is_simulator: opts.simulator ?? true,
    },
    rounds,
    participants: opts.players.map((p) => ({
      userId: p.id,
      name: p.name,
      nickname: p.nickname ?? null,
      acceptedAt: null,
      hasPlayed: true,
    })),
    standings: opts.scoring === 'gross' ? { net: null, gross: table } : { net: table, gross: null },
  } as unknown as LeagueSnapshot;
}

/** Round 1 has closed and round 2 is the one that opens. */
const stableford = (players: PlayerSpec[]) => snapshot({ closes: [-1, 13], players });

describe('buildRoundSummary', () => {
  it('a points league: the round best first, shared places, and the gap to the best', () => {
    const s = buildRoundSummary(
      stableford([
        { id: 'dina', name: 'Dina Marie Dal', rank: 1, value: 44, cells: [{ value: 44 }, { value: null }] },
        { id: 'frida', name: 'Frida Foss', rank: 3, value: 42, cells: [{ value: 42 }, { value: null }] },
        { id: 'emil', name: 'Emil Eng', nickname: 'Emmi', rank: 2, value: 43, cells: [{ value: 43 }, { value: null }] },
        { id: 'hege', name: 'Hege', nickname: 'Hegga', rank: 3, value: 42, cells: [{ value: 42 }, { value: null }] },
        { id: 'ivar', name: 'Ivar', nickname: 'Ivo', rank: null, value: 0, cells: [{ value: null }, { value: null }] },
      ]),
      'r2',
      NOW,
    )!;

    expect(s.round.map((r) => [r.place, r.userId, r.value, r.behind])).toEqual([
      [1, 'dina', 44, 0],
      [2, 'emil', 43, 1],
      [3, 'frida', 42, 2],
      [3, 'hege', 42, 2],
    ]);
    expect(s.table.map((r) => [r.place, r.userId, r.value, r.behind])).toEqual([
      [1, 'dina', 44, 0],
      [2, 'emil', 43, 1],
      [3, 'frida', 42, 2],
      [3, 'hege', 42, 2],
    ]);
    // One name per player, the same every time: first name and the initial of
    // the last name (the owner 23.11), a single name as it is.
    expect(s.round.map((r) => r.name)).toEqual(['Dina D.', 'Emil E.', 'Frida F.', 'Hege']);
    expect(s).toMatchObject({
      leagueName: 'Vinterliga 2026-2027',
      roundId: 'r1',
      roundLabel: 'Runde 1',
      courseName: 'Byneset North',
      simulator: true,
      pointsBased: true,
      model: 'best_n',
      roundsPlayed: 1,
      roundsTotal: 2,
      countingRounds: 8,
      playersInLeague: 5,
      playedThisRound: 4,
    });
  });

  it('a stroke league: lowest to par is best, and the table keeps the snapshot’s rank and value', () => {
    const s = buildRoundSummary(
      snapshot({
        format: 'stroke',
        model: 'total',
        bestN: null,
        simulator: false,
        closes: [-15, -1, 13],
        players: [
          { id: 'a', name: 'Anne', rank: 2, value: 3, cells: [{ value: -2 }, { value: 5 }, { value: null }] },
          { id: 'b', name: 'Bo', rank: 1, value: 1, cells: [{ value: 4 }, { value: -3 }, { value: null }] },
          { id: 'c', name: null, nickname: 'Kalle', rank: 3, value: 9, cells: [{ value: 4 }, { value: 5 }, { value: null }] },
        ],
      }),
      'r3',
      NOW,
    )!;

    // Round 2 is the one that closed last: Bo −3, then Anne and Kalle on +5.
    expect(s.roundId).toBe('r2');
    expect(s.round.map((r) => [r.place, r.userId, r.value, r.behind])).toEqual([
      [1, 'b', -3, 0],
      [2, 'a', 5, 8],
      [2, 'c', 5, 8],
    ]);
    expect(s.table.map((r) => [r.place, r.userId, r.value, r.behind])).toEqual([
      [1, 'b', 1, 0],
      [2, 'a', 3, 2],
      [3, 'c', 9, 8],
    ]);
    // Without a name the nickname stands in.
    expect(s.round[2]!.name).toBe('Kalle');
    expect(s).toMatchObject({ pointsBased: false, simulator: false, roundsPlayed: 2, roundsTotal: 3, countingRounds: null });
  });

  it('a penalty score is not a played round, and an unranked player is not in the table', () => {
    const s = buildRoundSummary(
      snapshot({
        format: 'stroke',
        model: 'total',
        closes: [-1, 13],
        players: [
          { id: 'a', name: 'Anne', rank: 1, value: 2, cells: [{ value: 2 }, { value: null }] },
          { id: 'b', name: 'Bo', rank: 2, value: 3, cells: [{ value: 3, penalised: true }, { value: null }] },
          { id: 'c', name: 'Cato', rank: null, value: 0, cells: [{ value: null }, { value: null }] },
        ],
      }),
      'r2',
      NOW,
    )!;
    expect(s.round.map((r) => r.userId)).toEqual(['a']);
    expect(s.table.map((r) => r.userId)).toEqual(['a', 'b']);
    expect(s.playedThisRound).toBe(1);
  });

  it('a gross-only league reads the gross table', () => {
    const s = buildRoundSummary(
      snapshot({
        scoring: 'gross',
        closes: [-1, 13],
        players: [{ id: 'a', name: 'Anne', rank: 1, value: 30, cells: [{ value: 30 }, { value: null }] }],
      }),
      'r2',
      NOW,
    )!;
    expect(s.table).toHaveLength(1);
  });

  it('the round that closes exactly now counts as closed', () => {
    const s = buildRoundSummary(
      snapshot({
        closes: [0, 14],
        players: [{ id: 'a', name: 'Anne', rank: 1, value: 30, cells: [{ value: 30 }, { value: null }] }],
      }),
      'r2',
      NOW,
    );
    expect(s?.roundId).toBe('r1');
  });

  it.each([
    ['the first round of the league has nothing before it', 'r1', [13, 27]],
    ['the round before it has not closed', 'r2', [1, 13]],
  ])('no summary: %s', (_name, opening, closes) => {
    expect(
      buildRoundSummary(
        snapshot({
          closes,
          players: [{ id: 'a', name: 'Anne', rank: 1, value: 30, cells: [{ value: 30 }, { value: null }] }],
        }),
        opening,
        NOW,
      ),
    ).toBeNull();
  });

  it('no summary: nobody played the round before, or the opening round is unknown', () => {
    const empty = stableford([
      { id: 'a', name: 'Anne', rank: null, value: 0, cells: [{ value: null }, { value: null }] },
    ]);
    expect(buildRoundSummary(empty, 'r2', NOW)).toBeNull();
    expect(buildRoundSummary(empty, 'ukjent', NOW)).toBeNull();
  });
});

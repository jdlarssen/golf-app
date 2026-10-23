import { describe, it, expect } from 'vitest';
import { rankTeams, rankingHolesByNumber, ranksByNetToPar, UNPLAYED_PADDING } from './tiebreaker';
import type { GameModeConfig } from './modes/types';

describe('rankTeams', () => {
  it('orders by total ascending', () => {
    const teams = [
      { id: 1, holes: Array.from({ length: 18 }, () => 4) },  // 72
      { id: 2, holes: Array.from({ length: 18 }, () => 3) },  // 54
    ];
    expect(rankTeams(teams).map((t) => t.id)).toEqual([2, 1]);
  });

  it('tiebreaker by back 9', () => {
    const front = Array.from({ length: 9 }, () => 4);
    const teams = [
      { id: 1, holes: [...front, ...Array.from({ length: 9 }, () => 4)] },  // 72 total, back 9 = 36
      { id: 2, holes: [...front.map(() => 5), ...Array.from({ length: 9 }, () => 3)] },  // 72 total, back 9 = 27
    ];
    expect(rankTeams(teams).map((t) => t.id)).toEqual([2, 1]);
  });

  it('cascades to back 6 when back 9 ties', () => {
    // Same total (66), same back 9 sum (30), different back 6 sum (18 vs 19).
    // Holes 1-9 identical; holes 10-12 absorb the difference so back-9 stays equal
    // while back-6 differs.
    const teams = [
      // total 66, back 9 = 30, back 6 = 18
      { id: 1, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4,  3, 3, 3, 3, 3, 3] },
      // total 66, back 9 = 30, back 6 = 19
      { id: 2, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  3, 4, 4,  3, 3, 3, 4, 3, 3] },
    ];
    const result = rankTeams(teams);
    expect(result.map((t) => t.id)).toEqual([1, 2]);  // team 1 has lower back 6
  });

  it('cascades to back 3 when back 9 and back 6 tie', () => {
    // Same total (72), same back 9 (36), same back 6 (24), different back 3 (9 vs 15).
    // Holes 1-12 identical; holes 13-15 vs 16-18 split differently to keep back-6 equal.
    const teams = [
      // back 6 holes = [5,5,5,3,3,3] → back-3 = 9
      { id: 1, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4,  5, 5, 5, 3, 3, 3] },
      // back 6 holes = [3,3,3,5,5,5] → back-3 = 15
      { id: 2, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4,  3, 3, 3, 5, 5, 5] },
    ];
    const result = rankTeams(teams);
    expect(result.map((t) => t.id)).toEqual([1, 2]);  // team 1 has lower back 3
  });

  it('cascades to hole 18 when back 9 / 6 / 3 tie', () => {
    // Same total (73), back 9 (37), back 6 (25), back 3 (13); different hole 18 (3 vs 4).
    // Holes 1-15 identical; holes 16-18 sum to 13 both but with different hole-18 values.
    const teams = [
      // holes 16-18 = [5,5,3] → hole 18 = 3
      { id: 1, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4,  4, 4, 4,  5, 5, 3] },
      // holes 16-18 = [4,5,4] → hole 18 = 4
      { id: 2, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4,  4, 4, 4,  4, 5, 4] },
    ];
    const result = rankTeams(teams);
    expect(result.map((t) => t.id)).toEqual([1, 2]);  // team 1 has lower hole 18
  });

  it('marks teams as tied when all tiebreakers match', () => {
    const holes = [
      ...Array.from({ length: 9 }, () => 4),
      ...Array.from({ length: 9 }, () => 4),
    ];
    const teams = [
      { id: 1, holes: [...holes] },
      { id: 2, holes: [...holes] },
    ];
    const result = rankTeams(teams);
    expect(result[0].tiedWith).toContain(2);
    expect(result[1].tiedWith).toContain(1);
    expect(result[0].rank).toBe(result[1].rank);  // shared rank for full tie
  });

  it('shares the same rank between fully-tied teams', () => {
    const holes = [
      ...Array.from({ length: 9 }, () => 4),
      ...Array.from({ length: 9 }, () => 4),
    ];
    const teams = [
      { id: 1, holes: [...holes] },
      { id: 2, holes: [...holes] },
      { id: 3, holes: Array.from({ length: 18 }, () => 5) },  // worse total
    ];
    const result = rankTeams(teams);
    // Teams 1 and 2 are tied at rank 1; team 3 gets rank 3 (NOT 2)
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
    expect(result[2].rank).toBe(3);
    // tiedWith also correctly populated
    expect(result[0].tiedWith).toEqual([result[1].id]);
    expect(result[1].tiedWith).toEqual([result[0].id]);
    expect(result[2].tiedWith).toEqual([]);
  });

  it('sets rank starting at 1', () => {
    const teams = [
      { id: 1, holes: Array.from({ length: 18 }, () => 4) },
      { id: 2, holes: Array.from({ length: 18 }, () => 3) },
    ];
    const result = rankTeams(teams);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });
});

// #2579: the finished board says «avgjort på siste ni» under a row that was
// level on total. `decidedBy` names the step that split a row from the row
// directly above it in sorted order.
describe('rankTeams — decidedBy', () => {
  const flat = (n: number) => Array.from({ length: 18 }, () => n);
  // Each pair: the row that ends up first, then the one it beat on `step`.
  it.each([
    ['total', flat(3), flat(4)],
    ['back9', [...flat(5).slice(0, 9), ...flat(3).slice(0, 9)], flat(4)],
    [
      'back6',
      [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3],
      [4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 3, 3, 3, 4, 3, 3],
    ],
    [
      'back3',
      [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 3, 3, 3],
      [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 5, 5, 5],
    ],
    [
      'hole18',
      [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 3],
      [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4],
    ],
  ] as const)('%s: names the step on the lower row, null on the first', (step, winner, runnerUp) => {
    const result = rankTeams([
      { id: 2, holes: [...runnerUp] },
      { id: 1, holes: [...winner] },
    ]);
    expect(result.map((r) => [r.id, r.decidedBy])).toEqual([
      [1, null],
      [2, step],
    ]);
  });

  it('is null on a true tie (the row above is in tiedWith)', () => {
    const result = rankTeams([
      { id: 1, holes: flat(4) },
      { id: 2, holes: flat(4) },
    ]);
    expect(result.map((r) => r.decidedBy)).toEqual([null, null]);
    expect(result[1].tiedWith).toEqual([1]);
  });

  it('compares each row with the row directly above, not with the leader', () => {
    // 1: 72 (back9 27) · 2: 72 (back9 36) · 3: 73.
    const result = rankTeams([
      { id: 3, holes: [5, ...flat(4).slice(1)] },
      { id: 2, holes: flat(4) },
      { id: 1, holes: [...flat(5).slice(0, 9), ...flat(3).slice(0, 9)] },
    ]);
    expect(result.map((r) => [r.id, r.decidedBy])).toEqual([
      [1, null],
      [2, 'back9'],
      [3, 'total'],
    ]);
  });

  it('is null for a single row', () => {
    expect(rankTeams([{ id: 1, holes: flat(4) }])[0].decidedBy).toBeNull();
  });
});

// #2217 (D5): the ranking array is indexed on HOLE NUMBER, not position, so the
// back9/back6/back3/hole-18 tiers read real data for a segment game. One home
// for the rule bestBall.ts (#1441 D11) and lib/leaderboard.ts both feed rankTeams.
describe('rankingHolesByNumber', () => {
  const rows = (numbers: number[], net: (n: number) => number | null) =>
    numbers.map((holeNumber) => ({ holeNumber, teamNet: net(holeNumber) }));
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

  it('maps a full round slot i to hole i+1', () => {
    expect(rankingHolesByNumber(rows(range(1, 18), (n) => n))).toEqual(range(1, 18));
  });

  it('puts a back9 game on slots 9–17 and fills slots 0–8 with 0', () => {
    const arr = rankingHolesByNumber(rows(range(10, 18), (n) => n + 100));
    expect(arr).toHaveLength(18);
    expect(arr.slice(0, 9)).toEqual(Array(9).fill(0));
    expect(arr.slice(9, 18)).toEqual(range(110, 118));
  });

  it('puts a front9 game on slots 0–8 and fills slots 9–17 with 0', () => {
    const arr = rankingHolesByNumber(rows(range(1, 9), () => 4));
    expect(arr.slice(0, 9)).toEqual(Array(9).fill(4));
    expect(arr.slice(9, 18)).toEqual(Array(9).fill(0));
  });

  it('pads only the in-scope holes of a team with no score in scope', () => {
    const arr = rankingHolesByNumber(rows(range(10, 18), () => null));
    expect(arr.slice(0, 9)).toEqual(Array(9).fill(0));
    expect(arr.slice(9, 18)).toEqual(Array(9).fill(UNPLAYED_PADDING));
  });

  it('counts a missing in-scope hole as 0 once the team has played any hole', () => {
    const arr = rankingHolesByNumber(rows(range(10, 18), (n) => (n === 12 ? null : 4)));
    expect(arr[11]).toBe(0);
    expect(arr.filter((v) => v === 4)).toHaveLength(8);
    expect(arr).not.toContain(UNPLAYED_PADDING);
  });

  it('reads the hole number, not the input order', () => {
    const shuffled = [
      { holeNumber: 18, teamNet: 5 },
      { holeNumber: 10, teamNet: 3 },
    ];
    const arr = rankingHolesByNumber(shuffled);
    expect(arr[9]).toBe(3);
    expect(arr[17]).toBe(5);
  });

  it('lets rankTeams break a back9 tie on the last holes', () => {
    // Equal total 36; team 1 is better on 13–18.
    const team1 = rankingHolesByNumber(
      rows(range(10, 18), (n) => (n <= 12 ? 6 : 3)),
    );
    const team2 = rankingHolesByNumber(
      rows(range(10, 18), () => 4),
    );
    const ranked = rankTeams([
      { id: 1, holes: team1 },
      { id: 2, holes: team2 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});

describe('ranksByNetToPar (#2253, #2625)', () => {
  // The one question every surface asks: does this game rank on net to par?
  // Solo strokeplay (#2253) and the team strokeplay formats (#2625) answer yes
  // when the flag was stamped at creation; every other game answers no.
  const flaggable: GameModeConfig[] = [
    { kind: 'solo_strokeplay', team_size: 1 },
    { kind: 'best_ball', team_size: 2, teams_count: 2 },
    { kind: 'texas_scramble', team_size: 4, teams_count: 2, team_handicap_pct: 10 },
    { kind: 'ambrose', team_size: 4, teams_count: 2, team_handicap_pct: 12.5 },
    { kind: 'florida_scramble', team_size: 3, teams_count: 2, team_handicap_pct: 15 },
    {
      kind: 'shamble',
      team_size: 4,
      teams_count: 2,
      shamble_variant: 'shamble',
      shamble_count: 2,
      shamble_scoring: 'net',
    },
  ];

  it.each(flaggable.map((c) => [c.kind, c] as const))('%s: true with the flag, false without', (_kind, config) => {
    expect(ranksByNetToPar({ ...config, ranking: 'net_to_par' } as GameModeConfig)).toBe(true);
    expect(ranksByNetToPar(config)).toBe(false);
  });

  it.each([
    { kind: 'stableford', team_size: 1, points_table: 'standard' },
    { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
    { kind: 'nassau', team_size: 1 },
  ])('$kind: false even with a stray flag', (config) => {
    expect(ranksByNetToPar({ ...config, ranking: 'net_to_par' } as unknown as GameModeConfig)).toBe(false);
  });
});

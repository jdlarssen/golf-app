// Type A tests — pure logic, assertion-rik.
// Shamble / Champagne Scramble (#285): lag-format, best N av M per hull.

import { describe, it, expect } from 'vitest';
import { compute } from './shamble';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from './types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function par4Holes(count: number): ScoringHole[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

function makePlayer(
  userId: string,
  teamNumber: number,
  courseHandicap = 0,
): ScoringPlayer {
  return { userId, teamNumber, flightNumber: teamNumber, courseHandicap };
}

/** Bygg scores-rader for ett hull fra [userId, gross]-par. */
function holeScores(
  holeNumber: number,
  entries: Array<[string, number]>,
): ScoringHoleScore[] {
  return entries.map(([userId, gross]) => ({ userId, holeNumber, gross }));
}

function makeCtx(opts: {
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
  variant?: 'shamble' | 'champagne';
  count?: 1 | 2 | 3;
  scoring?: 'gross' | 'net';
  teamSize?: 3 | 4;
  /** Lar oss teste defensive fallback ved manglende/feil felt. */
  modeConfigOverride?: Record<string, unknown>;
}): ScoringContext {
  const modeConfig = opts.modeConfigOverride
    ? (opts.modeConfigOverride as never)
    : ({
        kind: 'shamble',
        team_size: opts.teamSize ?? 4,
        teams_count: 1,
        shamble_variant: opts.variant ?? 'champagne',
        shamble_count: opts.count ?? 2,
        shamble_scoring: opts.scoring ?? 'gross',
      } as never);
  return {
    // game_mode er irrelevant for compute() (den leser kun mode_config.kind);
    // 'shamble' wires inn i GameMode-unionen i neste chunk.
    game: { id: 'g1', game_mode: 'best_ball', mode_config: modeConfig },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

function teamCell(
  result: ReturnType<typeof compute>,
  holeNumber: number,
  teamNumber: number,
) {
  const row = result.holes.find((h) => h.holeNumber === holeNumber)!;
  return row.teams.find((t) => t.teamNumber === teamNumber)!;
}

function teamLine(result: ReturnType<typeof compute>, teamNumber: number) {
  return result.teams.find((t) => t.teamNumber === teamNumber)!;
}

// ---------------------------------------------------------------------------
// Case 1 — Discriminated shape
// ---------------------------------------------------------------------------

describe('shamble.compute — discriminated shape', () => {
  it('ekko-er variant/count/scoring/teamSize fra mode_config', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 1),
        makePlayer('u4', 1),
      ],
      holes: par4Holes(18),
      scores: [],
      variant: 'champagne',
      count: 3,
      scoring: 'net',
      teamSize: 4,
    });
    const result = compute(ctx);
    expect(result.kind).toBe('shamble');
    expect(result.variant).toBe('champagne');
    expect(result.count).toBe(3);
    expect(result.scoring).toBe('net');
    expect(result.teamSize).toBe(4);
    expect(result.holes).toHaveLength(18);
    expect(result.teams).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Case 2 — Best-N-sum (gross), lag à 4: scores [4,5,5,6]
// ---------------------------------------------------------------------------

describe('shamble.compute — best N av 4 (gross)', () => {
  const players = [
    makePlayer('u1', 1),
    makePlayer('u2', 1),
    makePlayer('u3', 1),
    makePlayer('u4', 1),
  ];
  const scores = holeScores(1, [
    ['u1', 4],
    ['u2', 5],
    ['u3', 5],
    ['u4', 6],
  ]);

  it.each([
    [1, 4],
    [2, 9],
    [3, 14],
  ])('count=%i → teamScore %i', (count, expected) => {
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores,
      variant: 'champagne',
      count: count as 1 | 2 | 3,
      scoring: 'gross',
    });
    const cell = teamCell(compute(ctx), 1, 1);
    expect(cell.pending).toBe(false);
    expect(cell.teamScore).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Case 3 — Lag à 3: scores [5,4,6]
// ---------------------------------------------------------------------------

describe('shamble.compute — best N av 3 (gross)', () => {
  const players = [
    makePlayer('u1', 1),
    makePlayer('u2', 1),
    makePlayer('u3', 1),
  ];
  const scores = holeScores(1, [
    ['u1', 5],
    ['u2', 4],
    ['u3', 6],
  ]);

  it.each([
    [1, 4],
    [2, 9],
  ])('count=%i → teamScore %i', (count, expected) => {
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores,
      variant: 'champagne',
      count: count as 1 | 2 | 3,
      scoring: 'gross',
      teamSize: 3,
    });
    expect(teamCell(compute(ctx), 1, 1).teamScore).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Case 4 — Tie på grensa: [4,4,5,6] count=2 → 8, begge 4-ere telles
// ---------------------------------------------------------------------------

describe('shamble.compute — tie på counted-grensa', () => {
  it('to like laveste telles begge (4+4=8)', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 1),
        makePlayer('u4', 1),
      ],
      holes: par4Holes(1),
      scores: holeScores(1, [
        ['u1', 4],
        ['u2', 4],
        ['u3', 5],
        ['u4', 6],
      ]),
      variant: 'champagne',
      count: 2,
      scoring: 'gross',
    });
    const cell = teamCell(compute(ctx), 1, 1);
    expect(cell.teamScore).toBe(8);
    const counted = cell.perPlayer
      .filter((p) => p.counted)
      .map((p) => p.userId)
      .sort();
    expect(counted).toEqual(['u1', 'u2']);
  });

  it('alle like (5,5,5,5) count=2 → 10, nøyaktig 2 telles', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 1),
        makePlayer('u4', 1),
      ],
      holes: par4Holes(1),
      scores: holeScores(1, [
        ['u1', 5],
        ['u2', 5],
        ['u3', 5],
        ['u4', 5],
      ]),
      variant: 'champagne',
      count: 2,
      scoring: 'gross',
    });
    const cell = teamCell(compute(ctx), 1, 1);
    expect(cell.teamScore).toBe(10);
    expect(cell.perPlayer.filter((p) => p.counted)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Case 5 — Netto vs brutto flipper hvilken score som telles
// ---------------------------------------------------------------------------

describe('shamble.compute — netto vs brutto', () => {
  // p1: hcp 0, gross 4 → net 4. p2: hcp 18, gross 4 → net 3 (1 slag på SI 1).
  const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 18)];
  const scores = holeScores(1, [
    ['u1', 4],
    ['u2', 4],
  ]);

  it('brutto: best 1 = 4', () => {
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores,
      variant: 'champagne',
      count: 1,
      scoring: 'gross',
    });
    expect(teamCell(compute(ctx), 1, 1).teamScore).toBe(4);
  });

  it('netto: best 1 = 3 (p2 får 1 slag)', () => {
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores,
      variant: 'champagne',
      count: 1,
      scoring: 'net',
    });
    const cell = teamCell(compute(ctx), 1, 1);
    expect(cell.teamScore).toBe(3);
    expect(cell.perPlayer.find((p) => p.userId === 'u2')!.counted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Case 6 — Pending: < count medlemmer har gross
// ---------------------------------------------------------------------------

describe('shamble.compute — pending hull', () => {
  it('lag à 4, count=2, bare 1 har tastet → pending, teamScore null, teller ikke', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 1),
        makePlayer('u4', 1),
      ],
      holes: par4Holes(1),
      scores: holeScores(1, [['u1', 4]]),
      variant: 'champagne',
      count: 2,
      scoring: 'gross',
    });
    const result = compute(ctx);
    const cell = teamCell(result, 1, 1);
    expect(cell.pending).toBe(true);
    expect(cell.teamScore).toBeNull();
    const line = teamLine(result, 1);
    expect(line.holesCounted).toBe(0);
    expect(line.totalScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Case 7 — Count-klamp + Champagne velger antall
// ---------------------------------------------------------------------------

describe('shamble.compute — count-klamp', () => {
  it('Champagne count=3 på lag à 3 → alle 3 telles (5+4+6=15)', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 1),
      ],
      holes: par4Holes(1),
      scores: holeScores(1, [
        ['u1', 5],
        ['u2', 4],
        ['u3', 6],
      ]),
      variant: 'champagne',
      count: 3,
      scoring: 'gross',
      teamSize: 3,
    });
    const result = compute(ctx);
    expect(result.count).toBe(3);
    expect(teamCell(result, 1, 1).teamScore).toBe(15);
  });

  it('Champagne count=2 på lag à 4 → count forblir 2', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 1),
        makePlayer('u4', 1),
      ],
      holes: par4Holes(1),
      scores: [],
      variant: 'champagne',
      count: 2,
      teamSize: 4,
    });
    expect(compute(ctx).count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Case 8 — Shamble-preset låser count til 2
// ---------------------------------------------------------------------------

describe('shamble.compute — Shamble-variant låser count=2', () => {
  it('variant=shamble ignorerer config-count og bruker best 2', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 1),
        makePlayer('u4', 1),
      ],
      holes: par4Holes(1),
      scores: holeScores(1, [
        ['u1', 4],
        ['u2', 5],
        ['u3', 5],
        ['u4', 6],
      ]),
      variant: 'shamble',
      count: 3, // skal ignoreres
      scoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.variant).toBe('shamble');
    expect(result.count).toBe(2);
    expect(teamCell(result, 1, 1).teamScore).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Case 9 — Fler-hull-total
// ---------------------------------------------------------------------------

describe('shamble.compute — fler-hull-total', () => {
  it('summerer ikke-pending hull, holesCounted teller dem', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 1),
        makePlayer('u4', 1),
      ],
      holes: par4Holes(2),
      scores: [
        ...holeScores(1, [
          ['u1', 4],
          ['u2', 5],
          ['u3', 5],
          ['u4', 6],
        ]), // best 2 → 9
        ...holeScores(2, [
          ['u1', 3],
          ['u2', 4],
          ['u3', 5],
          ['u4', 5],
        ]), // best 2 → 7
      ],
      variant: 'champagne',
      count: 2,
      scoring: 'gross',
    });
    const line = teamLine(compute(ctx), 1);
    expect(line.totalScore).toBe(16);
    expect(line.holesCounted).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Case 10 — To lag: rangering + tiedWith
// ---------------------------------------------------------------------------

describe('shamble.compute — to-lags rangering', () => {
  const base = (t2Score: [string, number][]) =>
    makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 2),
        makePlayer('u4', 2),
      ],
      holes: par4Holes(1),
      scores: [
        ...holeScores(1, [
          ['u1', 4],
          ['u2', 5],
        ]), // lag 1: 9
        ...holeScores(1, t2Score),
      ],
      variant: 'champagne',
      count: 2,
      scoring: 'gross',
    });

  it('lavest total vinner: lag 1 (9) < lag 2 (10)', () => {
    const result = compute(
      base([
        ['u3', 5],
        ['u4', 5],
      ]),
    );
    expect(teamLine(result, 1).rank).toBe(1);
    expect(teamLine(result, 2).rank).toBe(2);
    // teams-array sortert på rank ASC.
    expect(result.teams[0].teamNumber).toBe(1);
  });

  it('returnerer teams rangert, ikke i teamNumber-rekkefølge (#1591)', () => {
    // Lag 2 (8) < lag 1 (9): rank-rekkefølgen er motsatt av teamNumber-
    // rekkefølgen, så podiet kan plukke vinneren på indeks 0 uten å sortere.
    const result = compute(
      base([
        ['u3', 4],
        ['u4', 4],
      ]),
    );
    expect(result.teams.map((t) => t.teamNumber)).toEqual([2, 1]);
    expect(result.teams.map((t) => t.rank)).toEqual([1, 2]);
  });

  it('likt total → begge rank 1, tiedWith hverandre', () => {
    const result = compute(
      base([
        ['u3', 4],
        ['u4', 5],
      ]),
    ); // lag 2: 9 = lag 1
    expect(teamLine(result, 1).rank).toBe(1);
    expect(teamLine(result, 2).rank).toBe(1);
    expect(teamLine(result, 1).tiedWith).toContain(2);
    expect(teamLine(result, 2).tiedWith).toContain(1);
  });
});

// ---------------------------------------------------------------------------
// Case 11 — Defensive defaults
// ---------------------------------------------------------------------------

describe('shamble.compute — defensive defaults', () => {
  it('tomt mode_config → variant=shamble, count=2, scoring=net, ingen throw', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 1),
        makePlayer('u4', 1),
      ],
      holes: par4Holes(1),
      scores: holeScores(1, [
        ['u1', 4],
        ['u2', 5],
        ['u3', 5],
        ['u4', 6],
      ]),
      modeConfigOverride: {},
    });
    const result = compute(ctx);
    expect(result.variant).toBe('shamble');
    expect(result.count).toBe(2);
    expect(result.scoring).toBe('net');
    expect(teamCell(result, 1, 1).teamScore).toBe(9); // hcp 0 → net = gross
  });

  it('perPlayer dekker ALLE teammedlemmer', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1', 1),
        makePlayer('u2', 1),
        makePlayer('u3', 1),
      ],
      holes: par4Holes(1),
      scores: holeScores(1, [
        ['u1', 5],
        ['u2', 4],
        ['u3', 6],
      ]),
      variant: 'champagne',
      count: 2,
      scoring: 'gross',
      teamSize: 3,
    });
    expect(teamCell(compute(ctx), 1, 1).perPlayer).toHaveLength(3);
  });
});

describe('shamble.compute — lag uten skår rangeres sist (#635)', () => {
  it('lag uten registrerte skår rangeres sist, ikke som vinner', () => {
    // Lag 1 spiller alle 18 hull (best 2 av 4 = 4+4 = 8/hull → total 144).
    // Lag 2 har ingen skår.
    const players = [
      makePlayer('a1', 1),
      makePlayer('a2', 1),
      makePlayer('a3', 1),
      makePlayer('a4', 1),
      makePlayer('b1', 2),
      makePlayer('b2', 2),
      makePlayer('b3', 2),
      makePlayer('b4', 2),
    ];
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push(
        ...holeScores(h, [
          ['a1', 4],
          ['a2', 4],
          ['a3', 4],
          ['a4', 4],
        ]),
      );
    }
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores,
      teamSize: 4,
      count: 2,
      scoring: 'gross',
    });
    const result = compute(ctx);
    const team1 = teamLine(result, 1);
    const team2 = teamLine(result, 2);
    expect(team1.rank).toBe(1);
    expect(team2.rank).toBe(2);
    // Vist total upåvirket av padding.
    expect(team1.totalScore).toBe(144);
  });
});

describe('shamble.compute — flere enn fire lag (#2148)', () => {
  it('ti lag à fire rangeres alle, lag 10 vinner', () => {
    const players: ScoringPlayer[] = [];
    const scores: ScoringHoleScore[] = [];
    for (let team = 1; team <= 10; team++) {
      const ids = [0, 1, 2, 3].map((m) => `t${String(team).padStart(2, '0')}-${m}`);
      ids.forEach((id) => players.push(makePlayer(id, team)));
      for (let h = 1; h <= 18; h++) {
        const gross = h === 1 ? 4 + (10 - team) : 4;
        scores.push(...holeScores(h, ids.map((id) => [id, gross] as [string, number])));
      }
    }
    const result = compute(makeCtx({ players, holes: par4Holes(18), scores }));
    expect(result.teams).toHaveLength(10);
    const ranked = [...result.teams].sort((a, b) => a.rank - b.rank);
    expect(ranked.map((t) => t.teamNumber)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(ranked.map((t) => t.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

// ---------------------------------------------------------------------------
// #2569 — ujevne lag. Et lag teller sine N beste uansett størrelse (eierens
// svar 18.10: «Laget teller sine beste som de andre»). Laget på 3 har ett valg
// mindre, men ingen fantomscore. Validatoren sørger for at N ≤ minste lag.
// ---------------------------------------------------------------------------

describe('shamble.compute — ujevne lag (#2569)', () => {
  it('Shamble «2 beste» à 4: laget på 3 teller 2 av sine 3 (4+5=9)', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('a1', 1),
        makePlayer('a2', 1),
        makePlayer('a3', 1),
        makePlayer('a4', 1),
        makePlayer('b1', 2),
        makePlayer('b2', 2),
        makePlayer('b3', 2),
      ],
      holes: par4Holes(1),
      scores: holeScores(1, [
        ['a1', 3],
        ['a2', 4],
        ['a3', 6],
        ['a4', 7],
        ['b1', 6],
        ['b2', 4],
        ['b3', 5],
      ]),
      variant: 'shamble',
      scoring: 'gross',
      teamSize: 4,
    });
    const result = compute(ctx);
    expect(teamCell(result, 1, 1).teamScore).toBe(7);
    expect(teamCell(result, 1, 2).teamScore).toBe(9);
  });

  it('Champagne «3 beste» à 4: alle tre på laget med 3 teller (6+4+5=15)', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('a1', 1),
        makePlayer('a2', 1),
        makePlayer('a3', 1),
        makePlayer('a4', 1),
        makePlayer('b1', 2),
        makePlayer('b2', 2),
        makePlayer('b3', 2),
      ],
      holes: par4Holes(1),
      scores: holeScores(1, [
        ['a1', 3],
        ['a2', 4],
        ['a3', 6],
        ['a4', 7],
        ['b1', 6],
        ['b2', 4],
        ['b3', 5],
      ]),
      variant: 'champagne',
      count: 3,
      scoring: 'gross',
      teamSize: 4,
    });
    const result = compute(ctx);
    expect(teamCell(result, 1, 1).teamScore).toBe(13);
    expect(teamCell(result, 1, 2).teamScore).toBe(15);
    expect(teamCell(result, 1, 2).pending).toBe(false);
  });
});

describe('shamble.compute — ranking: net_to_par (#2625)', () => {
  // #2625: a new shamble game ranks on the team score against par over the
  // holes each team has played. A shamble hole counts `count` balls, so the
  // par it is measured against is `count × par` — the same rule the board's
  // hole tones use. Without the flag: today's rule.
  const config = (count: 1 | 2 | 3, flagged: boolean) => ({
    kind: 'shamble',
    team_size: 3,
    teams_count: 2,
    shamble_variant: count === 2 ? 'shamble' : 'champagne',
    shamble_count: count,
    shamble_scoring: 'gross',
    ...(flagged ? { ranking: 'net_to_par' } : {}),
  });
  const players = [
    makePlayer('a1', 1),
    makePlayer('a2', 1),
    makePlayer('a3', 1),
    makePlayer('b1', 2),
    makePlayer('b2', 2),
    makePlayer('b3', 2),
  ];
  /** One team's holes from 1: best-two sum per hole, the third ball never counts. */
  function teamCard(ids: [string, string, string], bestTwo: number[]): ScoringHoleScore[] {
    return bestTwo.flatMap((sum, i) => {
      const low = Math.floor(sum / 2);
      return holeScores(i + 1, [
        [ids[0], low],
        [ids[1], sum - low],
        [ids[2], 9],
      ]);
    });
  }
  // The issue's example in shamble (best 2, par 4 → 8 per hole): team 1
  // 19 after 3 holes (−5), team 2 41 after 6 holes (−7).
  const issueScores = [
    ...teamCard(['a1', 'a2', 'a3'], [6, 6, 7]),
    ...teamCard(['b1', 'b2', 'b3'], [7, 7, 7, 7, 7, 6]),
  ];
  const ctx = (count: 1 | 2 | 3, flagged: boolean, scores: ScoringHoleScore[]) =>
    makeCtx({ players, holes: par4Holes(18), scores, modeConfigOverride: config(count, flagged) });

  it('the issue example: team 2 (−7 after 6) ranks ahead of team 1 (−5 after 3) with the flag', () => {
    const result = compute(ctx(2, true, issueScores));
    expect(result.teams.map((t) => [t.teamNumber, t.rank, t.toPar, t.totalScore])).toEqual([
      [2, 1, -7, 41],
      [1, 2, -5, 19],
    ]);
    expect(result.ranking).toBe('net_to_par');
  });

  it('without the flag the same round keeps today’s order', () => {
    const result = compute(ctx(2, false, issueScores));
    expect(
      result.teams.map(({ teamNumber, rank, tiedWith, decidedBy, totalScore, holesCounted }) => ({
        teamNumber,
        rank,
        tiedWith,
        decidedBy,
        totalScore,
        holesCounted,
      })),
    ).toEqual([
      { teamNumber: 1, rank: 1, tiedWith: [], decidedBy: null, totalScore: 19, holesCounted: 3 },
      { teamNumber: 2, rank: 2, tiedWith: [], decidedBy: 'total', totalScore: 41, holesCounted: 6 },
    ]);
    expect(result.ranking).toBe('net_total');
  });

  it.each([
    [1, -1],
    [2, -1],
    [3, 2],
  ] as const)('count %i: toPar is Σ (team score − count × par) = %i, null without a hole', (count, expected) => {
    // Two par-4 holes, balls 3/4/5 and 4/4/6. Best 1: 3 + 4 = 7 against
    // 2 × 4. Best 2: 7 + 8 = 15 against 2 × 8. Best 3: 12 + 14 = 26 against
    // 2 × 12.
    const scores = [
      ...holeScores(1, [['a1', 3], ['a2', 4], ['a3', 5]]),
      ...holeScores(2, [['a1', 4], ['a2', 4], ['a3', 6]]),
    ];
    const result = compute(ctx(count, false, scores));
    expect(teamLine(result, 1).toPar).toBe(expected);
    expect(teamLine(result, 2).toPar).toBeNull();
  });

  it('a team without a single hole still ranks last with the flag (#635)', () => {
    const result = compute(ctx(2, true, teamCard(['a1', 'a2', 'a3'], [10, 10, 10])));
    expect(result.teams.map((t) => [t.teamNumber, t.rank, t.toPar])).toEqual([
      [1, 1, 6],
      [2, 2, null],
    ]);
  });

  it('a finished round ranks the same with and without the flag', () => {
    const sumFor = (seed: number, hole: number) => 6 + ((seed * 7 + hole * 5) % 4);
    const field = [1, 2, 3, 4].flatMap((team) => [
      makePlayer(`t${team}a`, team),
      makePlayer(`t${team}b`, team),
      makePlayer(`t${team}c`, team),
    ]);
    const seeds: Record<number, number> = { 1: 1, 2: 2, 3: 2, 4: 5 };
    const scores = [1, 2, 3, 4].flatMap((team) =>
      teamCard(
        [`t${team}a`, `t${team}b`, `t${team}c`],
        Array.from({ length: 18 }, (_, i) => sumFor(seeds[team], i + 1)),
      ),
    );
    const shape = (flagged: boolean) =>
      compute(
        makeCtx({ players: field, holes: par4Holes(18), scores, modeConfigOverride: config(2, flagged) }),
      ).teams.map(({ teamNumber, rank, tiedWith, decidedBy }) => ({ teamNumber, rank, tiedWith, decidedBy }));
    const withFlag = shape(true);
    expect(withFlag).toEqual(shape(false));
    expect(withFlag.find((t) => t.teamNumber === 2)!.tiedWith).toEqual([3]);
  });
});

describe('shamble.compute — net_to_par tie-break on a part-played round (#2625)', () => {
  // Same shape as the scramble test, best 2 of 3: a hole's par is 2 × par.
  const PARS = [5, 3, 4, 4, 4, 3, 5, 3, 4, 5, 4, 4, 3, 4, 5, 4, 4, 4];
  const holes: ScoringHole[] = PARS.map((par, i) => ({ number: i + 1, par, strokeIndex: i + 1 }));
  const players = [1, 2, 3, 4, 5].flatMap((team) => [
    makePlayer(`t${team}a`, team),
    makePlayer(`t${team}b`, team),
    makePlayer(`t${team}c`, team),
  ]);
  /** Two balls at par, one of them `delta` off; the third ball never counts. */
  const card = (team: number, from: number, deltas: number[]): ScoringHoleScore[] =>
    deltas.flatMap((d, i) => {
      const par = PARS[from + i - 1];
      return holeScores(from + i, [
        [`t${team}a`, par],
        [`t${team}b`, par + d],
        [`t${team}c`, 9],
      ]);
    });
  const scores = [
    ...card(1, 1, [1, 0, 0, 0, 0]),
    ...card(2, 1, [0, 0, 0, 0, 0, 0, 0, 0, -1]),
    ...card(3, 10, [1, 0, 0]),
    ...card(4, 1, [1, -1]),
    ...card(5, 1, [0, 0, 0]),
  ];

  it('ranks on to par, shares the place at E, and splits +1 on the back nine', () => {
    const result = compute(
      makeCtx({
        players,
        holes,
        scores,
        modeConfigOverride: {
          kind: 'shamble',
          team_size: 3,
          teams_count: 5,
          shamble_variant: 'shamble',
          shamble_count: 2,
          shamble_scoring: 'gross',
          ranking: 'net_to_par',
        },
      }),
    );
    expect(result.teams.map((t) => [t.teamNumber, t.toPar, t.rank, t.tiedWith, t.decidedBy])).toEqual([
      [2, -1, 1, [], null],
      [4, 0, 2, [5], 'total'],
      [5, 0, 2, [4], null],
      [1, 1, 4, [], 'total'],
      [3, 1, 5, [], 'back9'],
    ]);
  });
});

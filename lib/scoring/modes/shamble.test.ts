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

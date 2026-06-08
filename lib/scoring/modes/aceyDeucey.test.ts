import { describe, it, expect } from 'vitest';
import { compute } from './aceyDeucey';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function par4Holes(count: number): ScoringHole[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

function makeCtx(opts: {
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
  aceyDeuceyScoring?: 'gross' | 'net';
}): ScoringContext {
  return {
    game: {
      id: 'g1',
      game_mode: 'acey_deucey',
      mode_config: {
        kind: 'acey_deucey',
        team_size: 1,
        acey_deucey_scoring: opts.aceyDeuceyScoring ?? 'gross',
      } as never,
    },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

function soloPlayer(userId: string, courseHandicap = 0): ScoringPlayer {
  return {
    userId,
    teamNumber: null,
    flightNumber: null,
    courseHandicap,
  };
}

/** Build score-array for ONE player across holes 1..n. */
function scoresFor(userId: string, gross: (number | null)[]): ScoringHoleScore[] {
  return gross.map((g, i) => ({
    userId,
    holeNumber: i + 1,
    gross: g,
  }));
}

// ---------------------------------------------------------------------------
// Discriminated shape
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — discriminated shape', () => {
  it('returns kind=acey_deucey with correct scoring', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores: [],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.kind).toBe('acey_deucey');
    expect(result.scoring).toBe('gross');
    expect(result.holes).toHaveLength(18);
    expect(result.players).toHaveLength(4);
  });

  it('reflects net scoring from mode_config', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(2),
      scores: [],
      aceyDeuceyScoring: 'net',
    });
    expect(compute(ctx).scoring).toBe('net');
  });
});

// ---------------------------------------------------------------------------
// Core scoring cases (gross mode, no handicap)
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — unique ace + unique deuce', () => {
  it('gross [3,4,5,6] → +3/0/0/−3', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        ...scoresFor('u1', [3]),
        ...scoresFor('u2', [4]),
        ...scoresFor('u3', [5]),
        ...scoresFor('u4', [6]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const hole = result.holes[0];
    expect(hole.scored).toBe(true);
    expect(hole.aceUserId).toBe('u1');
    expect(hole.deuceUserId).toBe('u4');
    expect(hole.pointsByPlayer['u1']).toBe(3);
    expect(hole.pointsByPlayer['u2']).toBe(0);
    expect(hole.pointsByPlayer['u3']).toBe(0);
    expect(hole.pointsByPlayer['u4']).toBe(-3);
  });

  it('two middles both get 0 — e.g. [3,4,4,6]', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        ...scoresFor('u1', [3]),
        ...scoresFor('u2', [4]),
        ...scoresFor('u3', [4]),
        ...scoresFor('u4', [6]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const hole = result.holes[0];
    expect(hole.aceUserId).toBe('u1');
    expect(hole.deuceUserId).toBe('u4');
    expect(hole.pointsByPlayer['u1']).toBe(3);
    expect(hole.pointsByPlayer['u2']).toBe(0);
    expect(hole.pointsByPlayer['u3']).toBe(0);
    expect(hole.pointsByPlayer['u4']).toBe(-3);
  });
});

// ---------------------------------------------------------------------------
// Tied lowest voids ace only
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — tied lowest voids ace only', () => {
  it('[3,3,4,5] → no ace, deuce −3 to u4', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        ...scoresFor('u1', [3]),
        ...scoresFor('u2', [3]),
        ...scoresFor('u3', [4]),
        ...scoresFor('u4', [5]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const hole = result.holes[0];
    expect(hole.aceUserId).toBeNull();
    expect(hole.deuceUserId).toBe('u4');
    expect(hole.pointsByPlayer['u1']).toBe(0);
    expect(hole.pointsByPlayer['u2']).toBe(0);
    expect(hole.pointsByPlayer['u3']).toBe(0);
    expect(hole.pointsByPlayer['u4']).toBe(-3);
  });
});

// ---------------------------------------------------------------------------
// Tied highest voids deuce only
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — tied highest voids deuce only', () => {
  it('[3,4,5,5] → ace +3 to u1, no deuce', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        ...scoresFor('u1', [3]),
        ...scoresFor('u2', [4]),
        ...scoresFor('u3', [5]),
        ...scoresFor('u4', [5]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const hole = result.holes[0];
    expect(hole.aceUserId).toBe('u1');
    expect(hole.deuceUserId).toBeNull();
    expect(hole.pointsByPlayer['u1']).toBe(3);
    expect(hole.pointsByPlayer['u2']).toBe(0);
    expect(hole.pointsByPlayer['u3']).toBe(0);
    expect(hole.pointsByPlayer['u4']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Both sides tied
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — both sides tied', () => {
  it('[3,3,5,5] → all 0', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        ...scoresFor('u1', [3]),
        ...scoresFor('u2', [3]),
        ...scoresFor('u3', [5]),
        ...scoresFor('u4', [5]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const hole = result.holes[0];
    expect(hole.aceUserId).toBeNull();
    expect(hole.deuceUserId).toBeNull();
    expect(Object.values(hole.pointsByPlayer).every((p) => p === 0)).toBe(true);
  });

  it('[4,4,4,4] all equal → all 0', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        ...scoresFor('u1', [4]),
        ...scoresFor('u2', [4]),
        ...scoresFor('u3', [4]),
        ...scoresFor('u4', [4]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const hole = result.holes[0];
    expect(hole.aceUserId).toBeNull();
    expect(hole.deuceUserId).toBeNull();
    expect(Object.values(hole.pointsByPlayer).every((p) => p === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Three-way ties
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — three-way ties', () => {
  it('[3,3,3,5] three tied lowest → no ace, deuce −3 to u4', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        ...scoresFor('u1', [3]),
        ...scoresFor('u2', [3]),
        ...scoresFor('u3', [3]),
        ...scoresFor('u4', [5]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const hole = result.holes[0];
    expect(hole.aceUserId).toBeNull();
    expect(hole.deuceUserId).toBe('u4');
    expect(hole.pointsByPlayer['u1']).toBe(0);
    expect(hole.pointsByPlayer['u2']).toBe(0);
    expect(hole.pointsByPlayer['u3']).toBe(0);
    expect(hole.pointsByPlayer['u4']).toBe(-3);
  });

  it('[3,5,5,5] three tied highest → ace +3 to u1, no deuce', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        ...scoresFor('u1', [3]),
        ...scoresFor('u2', [5]),
        ...scoresFor('u3', [5]),
        ...scoresFor('u4', [5]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const hole = result.holes[0];
    expect(hole.aceUserId).toBe('u1');
    expect(hole.deuceUserId).toBeNull();
    expect(hole.pointsByPlayer['u1']).toBe(3);
    expect(hole.pointsByPlayer['u2']).toBe(0);
    expect(hole.pointsByPlayer['u3']).toBe(0);
    expect(hole.pointsByPlayer['u4']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Incomplete hole → no distribution; later holes still award (no freeze)
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — incomplete hole does not freeze', () => {
  it('hole 1 has null for u4 → scored=false, hole 2 fully scored awards points', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(2),
      scores: [
        // Hole 1: u4 missing
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
        // u4 has no score for hole 1
        // Hole 2: all present [4,5,6,7]
        { userId: 'u1', holeNumber: 2, gross: 4 },
        { userId: 'u2', holeNumber: 2, gross: 5 },
        { userId: 'u3', holeNumber: 2, gross: 6 },
        { userId: 'u4', holeNumber: 2, gross: 7 },
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);

    // Hole 1: incomplete → scored=false, all 0
    const hole1 = result.holes[0];
    expect(hole1.scored).toBe(false);
    expect(hole1.aceUserId).toBeNull();
    expect(hole1.deuceUserId).toBeNull();
    expect(Object.values(hole1.pointsByPlayer).every((p) => p === 0)).toBe(true);

    // Hole 2: fully scored → awards points (proves no freeze)
    const hole2 = result.holes[1];
    expect(hole2.scored).toBe(true);
    expect(hole2.aceUserId).toBe('u1');
    expect(hole2.deuceUserId).toBe('u4');
    expect(hole2.pointsByPlayer['u1']).toBe(3);
    expect(hole2.pointsByPlayer['u4']).toBe(-3);
  });
});

// ---------------------------------------------------------------------------
// Net vs gross flips ace/deuce
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — net vs gross changes outcome', () => {
  it('gross [4,4,4,4] → all tied; net flips when handicaps differ on SI=1 hole', () => {
    // SI=1 hole. Players have CH: u1=18, u2=0, u3=0, u4=0.
    // On SI=1 hole, strokesForHole(18, 1) = 1, strokesForHole(0, 1) = 0.
    // Gross scores all 4 → tied gross, no ace/deuce.
    // Net: u1 gets 1 stroke → net = 4-1 = 3; u2/u3/u4 net = 4. u1 is unique ace.
    const hole: ScoringHole = { number: 1, par: 4, strokeIndex: 1 };
    const players = [
      soloPlayer('u1', 18),
      soloPlayer('u2', 0),
      soloPlayer('u3', 0),
      soloPlayer('u4', 0),
    ];

    // GROSS mode: all have gross 4 → all tied → no ace/deuce
    const grossCtx = makeCtx({
      players,
      holes: [hole],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 4 },
        { userId: 'u4', holeNumber: 1, gross: 4 },
      ],
      aceyDeuceyScoring: 'gross',
    });
    const grossResult = compute(grossCtx);
    expect(grossResult.holes[0].aceUserId).toBeNull();

    // NET mode: u1 (CH=18) gets 1 stroke on SI=1. net=3, others net=4.
    // u1 is unique ace (+3), u2/u3/u4 are tied highest → no deuce.
    const netCtx = makeCtx({
      players,
      holes: [hole],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 4 },
        { userId: 'u4', holeNumber: 1, gross: 4 },
      ],
      aceyDeuceyScoring: 'net',
    });
    const netResult = compute(netCtx);
    expect(netResult.holes[0].aceUserId).toBe('u1');
    expect(netResult.holes[0].deuceUserId).toBeNull(); // u2/u3/u4 tied highest
    expect(netResult.holes[0].pointsByPlayer['u1']).toBe(3);
    expect(netResult.holes[0].pointsByPlayer['u2']).toBe(0);
    expect(netResult.holes[0].pointsByPlayer['u3']).toBe(0);
    expect(netResult.holes[0].pointsByPlayer['u4']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Negative running total
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — negative running total', () => {
  it('player who is deuce on two holes ends at −6', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(2),
      scores: [
        // Hole 1: u4 is deuce [3,4,5,6]
        ...scoresFor('u1', [3, 3]),
        ...scoresFor('u2', [4, 4]),
        ...scoresFor('u3', [5, 5]),
        ...scoresFor('u4', [6, 6]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const u4 = result.players.find((p) => p.userId === 'u4')!;
    expect(u4.total).toBe(-6);
    expect(u4.deuces).toBe(2);

    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u1.total).toBe(6);
    expect(u1.aces).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Ranking + tiebreak
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — ranking and tiebreak', () => {
  it('total desc; equal total → more aces ranks higher; still-equal → tiedWith', () => {
    // Hole 1: u1 ace (+3), u4 deuce (−3)
    // Hole 2: u2 ace (+3), u4 deuce (−3)
    // Totals: u1=3, u2=3, u3=0, u4=−6
    // u1 has 1 ace, u2 has 1 ace → tied at rank 1
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(2),
      scores: [
        // Hole 1: [3,4,5,6]
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
        { userId: 'u4', holeNumber: 1, gross: 6 },
        // Hole 2: [4,3,5,6] → u2 is ace
        { userId: 'u1', holeNumber: 2, gross: 4 },
        { userId: 'u2', holeNumber: 2, gross: 3 },
        { userId: 'u3', holeNumber: 2, gross: 5 },
        { userId: 'u4', holeNumber: 2, gross: 6 },
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);

    const p = (uid: string) => result.players.find((pl) => pl.userId === uid)!;
    expect(p('u1').total).toBe(3);
    expect(p('u2').total).toBe(3);
    expect(p('u3').total).toBe(0);
    expect(p('u4').total).toBe(-6);

    // u1 and u2 both have 1 ace each → same tiebreak → same rank, tiedWith populated
    expect(p('u1').rank).toBe(1);
    expect(p('u2').rank).toBe(1);
    expect(p('u1').tiedWith).toContain('u2');
    expect(p('u2').tiedWith).toContain('u1');

    // u3 ranks 3rd (after the tied pair)
    expect(p('u3').rank).toBe(3);
    expect(p('u4').rank).toBe(4);
  });

  it('more aces breaks a total tie — same total, more aces ranks higher', () => {
    // A player's total = 3·aces − 3·deuces, so two players can reach the same
    // total with different ace counts. Here u1 and u2 both finish at +3, but
    // u1 got there with 2 aces + 1 deuce while u2 had a single ace. u1 must
    // rank above u2 (aces tiebreak), and they must NOT be listed as tied.
    //   Hole 1: [3,4,5,6] → u1 ace (+3), u4 deuce (−3)
    //   Hole 2: [3,4,5,6] → u1 ace (+3), u4 deuce (−3)
    //   Hole 3: u1=6, u2=3, u3=4, u4=5 → u2 ace (+3), u1 deuce (−3)
    // Totals: u1=+3 (2 aces, 1 deuce), u2=+3 (1 ace), u3=0, u4=−6 (2 deuces)
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(3),
      scores: [
        ...scoresFor('u1', [3, 3, 6]),
        ...scoresFor('u2', [4, 4, 3]),
        ...scoresFor('u3', [5, 5, 4]),
        ...scoresFor('u4', [6, 6, 5]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const p = (uid: string) => result.players.find((pl) => pl.userId === uid)!;

    expect(p('u1').total).toBe(3);
    expect(p('u1').aces).toBe(2);
    expect(p('u2').total).toBe(3);
    expect(p('u2').aces).toBe(1);

    // Same total, but u1 has more aces → u1 ranks above u2, and they are NOT tied.
    expect(p('u1').rank).toBe(1);
    expect(p('u2').rank).toBe(2);
    expect(p('u1').tiedWith).not.toContain('u2');
    expect(p('u2').tiedWith).not.toContain('u1');

    expect(p('u3').rank).toBe(3);
    expect(p('u4').rank).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// aces/deuces counters
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — aces and deuces counters', () => {
  it('counts aces and deuces correctly over multiple holes', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    const ctx = makeCtx({
      players,
      holes: par4Holes(3),
      scores: [
        // Hole 1: u1 ace, u4 deuce
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
        { userId: 'u4', holeNumber: 1, gross: 6 },
        // Hole 2: u2 ace, u4 deuce
        { userId: 'u1', holeNumber: 2, gross: 4 },
        { userId: 'u2', holeNumber: 2, gross: 3 },
        { userId: 'u3', holeNumber: 2, gross: 5 },
        { userId: 'u4', holeNumber: 2, gross: 6 },
        // Hole 3: tied lowest [3,3,5,6] → no ace, u4 deuce
        { userId: 'u1', holeNumber: 3, gross: 3 },
        { userId: 'u2', holeNumber: 3, gross: 3 },
        { userId: 'u3', holeNumber: 3, gross: 5 },
        { userId: 'u4', holeNumber: 3, gross: 6 },
      ],
      aceyDeuceyScoring: 'gross',
    });
    const result = compute(ctx);
    const p = (uid: string) => result.players.find((pl) => pl.userId === uid)!;
    expect(p('u1').aces).toBe(1);
    expect(p('u2').aces).toBe(1);
    expect(p('u3').aces).toBe(0);
    expect(p('u4').aces).toBe(0);
    expect(p('u4').deuces).toBe(3); // deuce on all 3 holes
    expect(p('u4').total).toBe(-9);
  });
});

// ---------------------------------------------------------------------------
// perPlayer per-hull exposure (#496 PR 5 — format-bevisst «Hull for hull»)
// ---------------------------------------------------------------------------

describe('aceyDeucey.compute — perPlayer per-hull exposure', () => {
  it('exposes gross, effectiveScore and points per player on a scored hole', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    // Hull 1: u1 unik lavest (ace +3), u4 unik høyest (deuce −3), u2/u3 midt (0).
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        ...scoresFor('u1', [3]),
        ...scoresFor('u2', [4]),
        ...scoresFor('u3', [4]),
        ...scoresFor('u4', [6]),
      ],
      aceyDeuceyScoring: 'gross',
    });
    const hole = compute(ctx).holes[0];
    expect(hole.scored).toBe(true);
    const cell = (uid: string) => hole.perPlayer.find((c) => c.userId === uid)!;
    expect(cell('u1')).toEqual({ userId: 'u1', gross: 3, effectiveScore: 3, points: 3 });
    expect(cell('u2')).toEqual({ userId: 'u2', gross: 4, effectiveScore: 4, points: 0 });
    expect(cell('u3')).toEqual({ userId: 'u3', gross: 4, effectiveScore: 4, points: 0 });
    expect(cell('u4')).toEqual({ userId: 'u4', gross: 6, effectiveScore: 6, points: -3 });
    // perPlayer følger ctx.players-rekkefølge.
    expect(hole.perPlayer.map((c) => c.userId)).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('exposes null effectiveScore + 0 points for an unfinished hole', () => {
    const players = ['u1', 'u2', 'u3', 'u4'].map((id) => soloPlayer(id));
    // Kun u1 har tastet → scored=false, ingen poeng deles ut.
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [...scoresFor('u1', [4])],
      aceyDeuceyScoring: 'gross',
    });
    const hole = compute(ctx).holes[0];
    expect(hole.scored).toBe(false);
    const cell = (uid: string) => hole.perPlayer.find((c) => c.userId === uid)!;
    expect(cell('u1')).toEqual({ userId: 'u1', gross: 4, effectiveScore: 4, points: 0 });
    expect(cell('u2')).toEqual({
      userId: 'u2',
      gross: null,
      effectiveScore: null,
      points: 0,
    });
  });

  it('reflects net allocation in effectiveScore', () => {
    // u1 har courseHandicap 18 → ett slag på SI-1-hull → netto = brutto − 1.
    const players = [
      soloPlayer('u1', 18),
      soloPlayer('u2', 0),
      soloPlayer('u3', 0),
      soloPlayer('u4', 0),
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(1), // hull 1 har strokeIndex 1
      scores: [
        ...scoresFor('u1', [5]),
        ...scoresFor('u2', [4]),
        ...scoresFor('u3', [5]),
        ...scoresFor('u4', [6]),
      ],
      aceyDeuceyScoring: 'net',
    });
    const cell = compute(ctx).holes[0].perPlayer.find((c) => c.userId === 'u1')!;
    expect(cell.gross).toBe(5);
    expect(cell.effectiveScore).toBe(4); // netto reflekterer HCP-slaget
  });
});

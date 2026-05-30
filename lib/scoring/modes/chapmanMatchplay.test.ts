import { describe, it, expect } from 'vitest';
import { compute } from './chapmanMatchplay';
import { chapmanSideHandicap } from './foursomesMatchplay';
import type {
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from './types';

// ---------------------------------------------------------------------------
// Fixtures. Speiler foursomesMatchplay.test.ts — Chapman deler scoring-kjernen,
// så vi tester KUN det Chapman-spesifikke: 60/40-side-handicapet og at
// compute() returnerer kind:'foursomes_matchplay'. Vi re-asserter ikke hele
// matchplay-pipelinen (det dekkes av foursomes-suiten).
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
  allowancePct?: number;
}): ScoringContext {
  const config: GameModeConfig = {
    kind: 'chapman_matchplay',
    team_size: 2,
    teams_count: 2,
    allowance_pct: opts.allowancePct ?? 100,
  };
  return {
    game: {
      id: 'g-chapman',
      game_mode: 'chapman_matchplay',
      mode_config: config,
    },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

// ---------------------------------------------------------------------------
// 60/40-side-handicap-formel
// ---------------------------------------------------------------------------

describe('chapmanSideHandicap — WHS 60/40', () => {
  it.each([
    // [lav, høy, forventet] — round(0.6×lav + 0.4×høy)
    [10, 20, 14], // USGA-eksempel
    [20, 10, 14], // order-independent
    [0, 0, 0],
    [5, 5, 5], // like → samme
    [8, 14, 10], // round(0.6×8 + 0.4×14) = round(4.8+5.6) = round(10.4) = 10
    [3, 8, 5], // round(1.8 + 3.2) = round(5.0) = 5
    [7, 12, 9], // round(4.2 + 4.8) = round(9.0) = 9
  ])('chapmanSideHandicap(%i, %i) = %i', (a, b, expected) => {
    expect(chapmanSideHandicap(a, b)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// compute() — Chapman-spesifikk handicap-pipeline
// ---------------------------------------------------------------------------

describe('compute — Chapman matchplay', () => {
  it('returnerer kind: foursomes_matchplay (deler view-laget)', () => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const r = compute(makeCtx({ players, holes: par4Holes(1), scores: [] }));
    expect(r.kind).toBe('foursomes_matchplay');
    expect(r.sides).toHaveLength(2);
  });

  it('side-HCP = 60/40, ikke sum: combinedCourseHandicap holder 60/40-verdien', () => {
    // side1: 10 + 20 → round(0.6×10 + 0.4×20) = 14   (sum ville vært 30)
    // side2: 5 + 5   → 5                              (sum ville vært 10)
    // diff = 9, allowance 100 % → 9 strokes til side 1 (høyt lag)
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
    ];
    const r = compute(
      makeCtx({ players, holes: par4Holes(18), scores: [], allowancePct: 100 }),
    );
    expect(r.sides[0].combinedCourseHandicap).toBe(14);
    expect(r.sides[1].combinedCourseHandicap).toBe(5);
    expect(r.sides[0].effectiveExtraHandicap).toBe(9); // diff 14-5 = 9
    expect(r.sides[1].effectiveExtraHandicap).toBe(0); // lavlaget får 0
  });

  it('allowance 0 % → brutto matchplay (begge sider 0 strokes)', () => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 28 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 2 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 4 },
    ];
    const r = compute(
      makeCtx({
        players,
        holes: par4Holes(1),
        scores: [
          { userId: 'a1', holeNumber: 1, gross: 5 },
          { userId: 'b1', holeNumber: 1, gross: 4 },
        ],
        allowancePct: 0,
      }),
    );
    expect(r.sides[0].effectiveExtraHandicap).toBe(0);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
    expect(r.holes[0].side1Extra).toBe(0);
    expect(r.holes[0].side2Extra).toBe(0);
    // Side 2 vinner brutto 4 < 5
    expect(r.holes[0].result).toBe('side2_wins');
  });

  it('like 60/40-side-HCP trass i ulik sum → begge 0 strokes (gross-only)', () => {
    // side1: 10 + 20 → 14 ; side2: 12 + 17 → round(0.6×12+0.4×17) = round(7.2+6.8)=14
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 12 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 17 },
    ];
    const r = compute(
      makeCtx({ players, holes: par4Holes(1), scores: [], allowancePct: 100 }),
    );
    expect(r.sides[0].combinedCourseHandicap).toBe(14);
    expect(r.sides[1].combinedCourseHandicap).toBe(14);
    expect(r.sides[0].effectiveExtraHandicap).toBe(0);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
  });

  it('defensiv: feil mode_config.kind → fallback til 100 % allowance', () => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
    ];
    const ctx = makeCtx({ players, holes: par4Holes(18), scores: [] });
    // Overstyr config med feil kind for å treffe fallback-grenen
    ctx.game.mode_config = {
      kind: 'foursomes_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 0,
    } as GameModeConfig;
    const r = compute(ctx);
    // Fallback 100 % → diff 14-5 = 9 strokes til side 1 (IKKE 0 fra config)
    expect(r.sides[0].effectiveExtraHandicap).toBe(9);
  });

  it('feil spiller-fordeling → defensiv empty shell (ingen kast)', () => {
    const r = compute(
      makeCtx({
        players: [
          { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        ],
        holes: par4Holes(18),
        scores: [],
      }),
    );
    expect(r.kind).toBe('foursomes_matchplay');
    expect(r.holes).toEqual([]);
    expect(r.result).toBeNull();
  });
});

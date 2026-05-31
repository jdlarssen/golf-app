import { describe, it, expect } from 'vitest';
import { compute } from './gruesomeMatchplay';
import { combinedSideHandicap } from './foursomesMatchplay';
import type {
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from './types';

// ---------------------------------------------------------------------------
// Fixtures. Speiler chapmanMatchplay.test.ts — Gruesome deler scoring-kjernen
// med foursomes, så vi tester KUN det Gruesome-spesifikke: sum-side-handicap
// (IKKE 60/40 som chapman), korrekt kind-retur, allowance og defensiv fallback.
//
// Nøkkel-case som skiller gruesome fra chapman:
//   Gruesome bruker sum: side1 10+20 = 30, side2 5+5 = 10 → diff 20
//   Chapman bruker 60/40: side1 round(0.6×10+0.4×20)=14, side2 5 → diff 9
// Dette betyr at resultatet på hull der diff-en avgjør HVEM som vinner kan
// avvike mellom formatene.
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
    kind: 'gruesome_matchplay',
    team_size: 2,
    teams_count: 2,
    allowance_pct: opts.allowancePct ?? 50,
  };
  return {
    game: {
      id: 'g-gruesome',
      game_mode: 'gruesome_matchplay',
      mode_config: config,
    },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

// ---------------------------------------------------------------------------
// combinedSideHandicap — sum-formel (kontrast til chapmanSideHandicap 60/40)
// ---------------------------------------------------------------------------

describe('combinedSideHandicap — sum (brukt av gruesome og foursomes)', () => {
  it.each([
    // [a, b, forventet sum]
    [10, 20, 30],
    [20, 10, 30], // order-independent
    [0, 0, 0],
    [5, 5, 10],
    [8, 14, 22],
    [3, 8, 11],
  ])('combinedSideHandicap(%i, %i) = %i', (a, b, expected) => {
    expect(combinedSideHandicap(a, b)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// compute() — Gruesome-spesifikk handicap-pipeline
// ---------------------------------------------------------------------------

describe('compute — Gruesome matchplay', () => {
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

  it('side-HCP = sum, IKKE 60/40: gir annet resultat enn chapman', () => {
    // side1: 10 + 20 → sum = 30 (chapman ville gitt 14)
    // side2: 5 + 5   → sum = 10  (chapman ville gitt 5)
    // diff  = 20; allowance 50 % → 10 strokes til side 1 (høyt lag)
    // Chapman: diff = 9; allowance 100 % → 9 strokes
    // Dette er en klar forskjell som viser at gruesome bruker sum.
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
    ];
    const r = compute(
      makeCtx({ players, holes: par4Holes(18), scores: [], allowancePct: 50 }),
    );
    // Sum: side1 = 30, side2 = 10 → diff 20 × 50% = 10
    expect(r.sides[0].combinedCourseHandicap).toBe(30);
    expect(r.sides[1].combinedCourseHandicap).toBe(10);
    expect(r.sides[0].effectiveExtraHandicap).toBe(10); // diff 20 × 50% = 10
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);  // lavlaget får 0
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

  it('defensiv: feil mode_config.kind → fallback til 50 % allowance', () => {
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
      allowance_pct: 0, // Skulle gitt 0, men fallback-en overstyrer til 50
    } as GameModeConfig;
    const r = compute(ctx);
    // Fallback 50 % → diff (sum) 30-10 = 20 × 50% = 10 strokes til side 1
    expect(r.sides[0].effectiveExtraHandicap).toBe(10);
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

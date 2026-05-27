import { describe, it, expect } from 'vitest';
import { compute } from './foursomesMatchplay';
import type {
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from './types';

// ---------------------------------------------------------------------------
// Fixture-builders. Speilet fourballMatchplay.test.ts-mønsteret slik at
// matchplay-scoring-suite-en bruker konsistent stil. Foursomes har én ball
// per lag — vi simulerer Texas-pattern ved at kaptein-userId (lex-min av de
// to partnerne) eier scores-radene i fixture-en.
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
    kind: 'foursomes_matchplay',
    team_size: 2,
    teams_count: 2,
    allowance_pct: opts.allowancePct ?? 100,
  };
  return {
    game: {
      id: 'g-foursomes',
      game_mode: 'foursomes_matchplay',
      mode_config: config,
    },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

function fourSides(): ScoringPlayer[] {
  return [
    { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
    { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
    { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
  ];
}

// ---------------------------------------------------------------------------
// Hovedscenarier
// ---------------------------------------------------------------------------

describe('compute — foursomes matchplay basis', () => {
  it('shape: result.kind=foursomes_matchplay, sides er tuple av 2', () => {
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(1),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.kind).toBe('foursomes_matchplay');
    expect(r.sides).toHaveLength(2);
    expect(r.sides[0].sideNumber).toBe(1);
    expect(r.sides[1].sideNumber).toBe(2);
  });

  it('basic 2v2 med kjent gross/SI/HCP: high side får diff-strokes via SI', () => {
    // side1: a1=10, a2=10 → combined 20
    // side2: b1=4,  b2=4  → combined 8
    // diff = 12, allowance 50 % → highSideExtraHCP = 6 → side 1 får 6 strokes
    // SI 1-6 → +1 stroke på side 1 (Math.floor(6/18)=0, SI<=6 → +1)
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 4 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 4 },
    ];
    // Kapteiner: a1 (side 1), b1 (side 2) — lex-min
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores: [
        // Hull 1 (SI=1): side 1 får 1 ekstra stroke. Begge sider gross 5.
        { userId: 'a1', holeNumber: 1, gross: 5 },
        { userId: 'b1', holeNumber: 1, gross: 5 },
        // Hull 7 (SI=7): side 1 får 0 ekstra stroke. Begge sider gross 5.
        { userId: 'a1', holeNumber: 7, gross: 5 },
        { userId: 'b1', holeNumber: 7, gross: 5 },
      ],
      allowancePct: 50,
    });
    const r = compute(ctx);
    // High side er 1 (combined 20 > 8). effectiveExtraHandicap = 6 på side 1, 0 på side 2.
    expect(r.sides[0].effectiveExtraHandicap).toBe(6);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
    expect(r.sides[0].combinedCourseHandicap).toBe(20);
    expect(r.sides[1].combinedCourseHandicap).toBe(8);

    // Hull 1 (SI 1, innenfor 6) → side 1 får 1 extra
    const hole1 = r.holes.find((h) => h.holeNumber === 1)!;
    expect(hole1.side1Extra).toBe(1);
    expect(hole1.side2Extra).toBe(0);
    expect(hole1.side1Net).toBe(4); // 5 - 1
    expect(hole1.side2Net).toBe(5);
    expect(hole1.result).toBe('side1_wins');

    // Hull 7 (SI 7, utenfor 6) → side 1 får 0 extra → tied
    const hole7 = r.holes.find((h) => h.holeNumber === 7)!;
    expect(hole7.side1Extra).toBe(0);
    expect(hole7.side2Extra).toBe(0);
    expect(hole7.side1Net).toBe(5);
    expect(hole7.side2Net).toBe(5);
    expect(hole7.result).toBe('tied');
  });

  it('low side får 0 strokes per hull (verifiser side1Extra/side2Extra)', () => {
    // side1 high (combined 30), side2 low (combined 10), diff 20, 100% → 20 strokes til side 1
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 12 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores: [],
      allowancePct: 100,
    });
    const r = compute(ctx);
    expect(r.sides[0].effectiveExtraHandicap).toBe(20);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
    // Lavlaget (side 2) skal ha 0 extra på ALLE hull
    for (const hole of r.holes) {
      expect(hole.side2Extra).toBe(0);
    }
    // Høylaget (side 1) får strokes via SI: 20 strokes på 18 hull →
    // base = floor(20/18) = 1 per hull, extra = SI <= (20 % 18) = 2 → +1 på SI 1-2
    // SI 1-2: 2 strokes, SI 3-18: 1 stroke
    for (const hole of r.holes) {
      if (hole.strokeIndex <= 2) {
        expect(hole.side1Extra).toBe(2);
      } else {
        expect(hole.side1Extra).toBe(1);
      }
    }
  });

  it('tie i lag-HCP: begge får 0 strokes, gross-only matchplay', () => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 5 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 8 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 7 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        { userId: 'a1', holeNumber: 1, gross: 4 },
        { userId: 'b1', holeNumber: 1, gross: 5 },
      ],
      allowancePct: 50,
    });
    const r = compute(ctx);
    expect(r.sides[0].combinedCourseHandicap).toBe(15);
    expect(r.sides[1].combinedCourseHandicap).toBe(15);
    // Tie → begge får 0 effektiv extra
    expect(r.sides[0].effectiveExtraHandicap).toBe(0);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
    expect(r.holes[0].side1Extra).toBe(0);
    expect(r.holes[0].side2Extra).toBe(0);
    expect(r.holes[0].side1Net).toBe(4);
    expect(r.holes[0].side2Net).toBe(5);
    expect(r.holes[0].result).toBe('side1_wins');
  });

  it('mat-em før 18: side 1 leder 3 up med 2 igjen etter hull 16 → 3&2', () => {
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 16; h++) {
      if (h <= 3) {
        // Side 1 vinner hull 1-3 (a1 kaptein gross 4, b1 kaptein gross 5)
        scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 5 });
      } else {
        // Hull 4-16 tied (begge gross 4)
        scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 4 });
      }
    }
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(18),
      scores,
      allowancePct: 0, // gross-only for å unngå stroke-rot
    });
    const r = compute(ctx);
    expect(r.holesUp).toBe(3);
    expect(r.holesPlayed).toBe(16);
    expect(r.holesRemaining).toBe(2);
    expect(r.result).toEqual({
      winner: 'side1',
      marginUp: 3,
      decidedAtHole: 16,
      remainingAtDecision: 2,
      formatted: '3&2',
    });
  });

  it('AS etter 18: hver side vinner 9 hull → result.formatted=AS', () => {
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      if (h % 2 === 1) {
        // Side 1 vinner odd-hull
        scores.push({ userId: 'a1', holeNumber: h, gross: 3 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 4 });
      } else {
        // Side 2 vinner even-hull
        scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 3 });
      }
    }
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(18),
      scores,
      allowancePct: 0,
    });
    const r = compute(ctx);
    expect(r.holesUp).toBe(0);
    expect(r.holesPlayed).toBe(18);
    expect(r.holesRemaining).toBe(0);
    expect(r.result).toEqual({
      winner: 'tied',
      marginUp: 0,
      decidedAtHole: 18,
      remainingAtDecision: 0,
      formatted: 'AS',
    });
  });

  it('ferdig 18 hull med vinner: side 2 vinner 2up', () => {
    const scores: ScoringHoleScore[] = [];
    // Hull 1-8: side 1 vinner (8 hull)
    for (let h = 1; h <= 8; h++) {
      scores.push({ userId: 'a1', holeNumber: h, gross: 3 });
      scores.push({ userId: 'b1', holeNumber: h, gross: 4 });
    }
    // Hull 9-18: side 2 vinner (10 hull)
    for (let h = 9; h <= 18; h++) {
      scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
      scores.push({ userId: 'b1', holeNumber: h, gross: 3 });
    }
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(18),
      scores,
      allowancePct: 0,
    });
    const r = compute(ctx);
    expect(r.holesUp).toBe(-2);
    expect(r.holesPlayed).toBe(18);
    expect(r.result).toEqual({
      winner: 'side2',
      marginUp: 2,
      decidedAtHole: 18,
      remainingAtDecision: 0,
      formatted: '2up',
    });
  });
});

// ---------------------------------------------------------------------------
// Allowance-pipeline + unplayed-håndtering
// ---------------------------------------------------------------------------

describe('compute — allowance og unplayed-håndtering', () => {
  it('one-side-unplayed-hole: result=unplayed, teller ikke i holesPlayed', () => {
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(2),
      scores: [
        // Hull 1: kun side 1 har gross
        { userId: 'a1', holeNumber: 1, gross: 4 },
        // Hull 2: begge har gross
        { userId: 'a1', holeNumber: 2, gross: 4 },
        { userId: 'b1', holeNumber: 2, gross: 5 },
      ],
      allowancePct: 0,
    });
    const r = compute(ctx);
    const hole1 = r.holes[0];
    expect(hole1.side1Gross).toBe(4);
    expect(hole1.side2Gross).toBeNull();
    expect(hole1.result).toBe('unplayed');
    // Hull 2 spilt, side 1 vinner
    expect(r.holes[1].result).toBe('side1_wins');
    // Bare hull 2 teller som spilt
    expect(r.holesPlayed).toBe(1);
    expect(r.holesUp).toBe(1);
  });

  it('allowance 0 % → gross-only matchplay, begge sider får 0 extra', () => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 4 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 2 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        { userId: 'a1', holeNumber: 1, gross: 5 },
        { userId: 'b1', holeNumber: 1, gross: 4 },
      ],
      allowancePct: 0,
    });
    const r = compute(ctx);
    // Begge sider har 0 effektiv extra ved allowance 0 (selv om diff er stor)
    expect(r.sides[0].effectiveExtraHandicap).toBe(0);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
    expect(r.holes[0].side1Extra).toBe(0);
    expect(r.holes[0].side2Extra).toBe(0);
    // Side 2 vinner brutto 4 < 5
    expect(r.holes[0].result).toBe('side2_wins');
  });

  it('allowance 100 % → full diff allokert via SI', () => {
    // side1 combined 30, side2 combined 10 → diff 20, 100 % → 20 strokes til side 1
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 15 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 15 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores: [],
      allowancePct: 100,
    });
    const r = compute(ctx);
    expect(r.sides[0].effectiveExtraHandicap).toBe(20);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
    // 20 strokes på 18 hull: base 1 + extra 1 på SI 1-2
    const hole1 = r.holes.find((h) => h.strokeIndex === 1)!;
    const hole3 = r.holes.find((h) => h.strokeIndex === 3)!;
    expect(hole1.side1Extra).toBe(2);
    expect(hole3.side1Extra).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Per-kjønn-tees (#240)
// ---------------------------------------------------------------------------

describe('compute — blandet-kjønn-tees (#240)', () => {
  it('side1Par/side2Par leses fra parByGender via kapteinens teeGender', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
        { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
        { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0, teeGender: 'ladies' },
        { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0, teeGender: 'ladies' },
      ],
      holes: [
        { number: 1, par: 4, parByGender: { mens: 4, ladies: 5, juniors: 4 }, strokeIndex: 1 },
      ],
      scores: [
        { userId: 'a1', holeNumber: 1, gross: 4 },
        { userId: 'b1', holeNumber: 1, gross: 4 },
      ],
    });
    const r = compute(ctx);
    // Kaptein-userId for side 1 = a1 (mens), side 2 = b1 (ladies)
    expect(r.holes[0].side1Par).toBe(4);
    expect(r.holes[0].side2Par).toBe(5);
    expect(r.holes[0].par).toBe(4); // backward-compat = side1Par
  });
});

// ---------------------------------------------------------------------------
// Kaptein-valg + sortering
// ---------------------------------------------------------------------------

describe('compute — kaptein-valg (lex-min) og deterministisk sortering', () => {
  it('captainUserId er lex-min av sidens partnere', () => {
    // Tving inn ulike rekkefølger og navn for å sjekke at lex-min vinner
    const players: ScoringPlayer[] = [
      { userId: 'zeta', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'alpha', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'yankee', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'bravo', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.sides[0].captainUserId).toBe('alpha');
    expect(r.sides[1].captainUserId).toBe('bravo');
    // Players er sortert deterministisk på userId
    expect(r.sides[0].players.map((p) => p.userId)).toEqual(['alpha', 'zeta']);
    expect(r.sides[1].players.map((p) => p.userId)).toEqual(['bravo', 'yankee']);
  });

  it('holesPlayed teller kun hull med begge siders gross', () => {
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(4),
      scores: [
        // Hull 1: begge har gross
        { userId: 'a1', holeNumber: 1, gross: 4 },
        { userId: 'b1', holeNumber: 1, gross: 5 },
        // Hull 2: kun side 1
        { userId: 'a1', holeNumber: 2, gross: 4 },
        // Hull 3: kun side 2
        { userId: 'b1', holeNumber: 3, gross: 4 },
        // Hull 4: begge har gross (tied)
        { userId: 'a1', holeNumber: 4, gross: 4 },
        { userId: 'b1', holeNumber: 4, gross: 4 },
      ],
      allowancePct: 0,
    });
    const r = compute(ctx);
    expect(r.holesPlayed).toBe(2); // bare hull 1 + hull 4
    expect(r.holesUp).toBe(1); // side 1 vant hull 1
  });
});

// ---------------------------------------------------------------------------
// Empty-shell defensive returns
// ---------------------------------------------------------------------------

describe('compute — empty-shell ved feil spiller-fordeling', () => {
  it('0 spillere → empty shell, ingen kast', () => {
    const ctx = makeCtx({
      players: [],
      holes: par4Holes(18),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.kind).toBe('foursomes_matchplay');
    expect(r.holes).toEqual([]);
    expect(r.holesUp).toBe(0);
    expect(r.holesPlayed).toBe(0);
    expect(r.holesRemaining).toBe(18);
    expect(r.result).toBeNull();
  });

  it('1 spiller (skjev fordeling) → empty shell', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(18),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.holes).toEqual([]);
    expect(r.result).toBeNull();
  });

  it('3 spillere (skjev fordeling 2-1) → empty shell', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      ],
      holes: par4Holes(18),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.holes).toEqual([]);
    expect(r.result).toBeNull();
  });
});

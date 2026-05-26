import { describe, it, expect } from 'vitest';
import { compute, computeMatchResult } from './singlesMatchplay';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from './types';

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
}): ScoringContext {
  return {
    game: {
      id: 'g-mp',
      game_mode: 'singles_matchplay',
      mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
    },
    ...opts,
  };
}

function side1And2(): ScoringPlayer[] {
  return [
    { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
    { userId: 'b', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
  ];
}

describe('computeMatchResult', () => {
  it('returnerer null mens matchen er live (få hull spilt, ikke mat-em)', () => {
    expect(computeMatchResult(1, 5, 13)).toBeNull();
    expect(computeMatchResult(0, 9, 9)).toBeNull();
    expect(computeMatchResult(-2, 10, 8)).toBeNull();
  });

  it('returnerer mat-em-result når |holesUp| > holesRemaining (3&2)', () => {
    // 3 hull foran med 2 hull igjen, side 1 leder
    const r = computeMatchResult(3, 16, 2);
    expect(r).toEqual({
      winner: 'side1',
      marginUp: 3,
      decidedAtHole: 16,
      remainingAtDecision: 2,
      formatted: '3&2',
    });
  });

  it('returnerer mat-em-result for side 2 (4&3)', () => {
    const r = computeMatchResult(-4, 15, 3);
    expect(r).toEqual({
      winner: 'side2',
      marginUp: 4,
      decidedAtHole: 15,
      remainingAtDecision: 3,
      formatted: '4&3',
    });
  });

  it('returnerer "AS" etter 18 hull spilt med holesUp=0', () => {
    const r = computeMatchResult(0, 18, 0);
    expect(r).toEqual({
      winner: 'tied',
      marginUp: 0,
      decidedAtHole: 18,
      remainingAtDecision: 0,
      formatted: 'AS',
    });
  });

  it('returnerer "Nup" etter 18 hull med holesUp != 0', () => {
    const r = computeMatchResult(2, 18, 0);
    expect(r).toEqual({
      winner: 'side1',
      marginUp: 2,
      decidedAtHole: 18,
      remainingAtDecision: 0,
      formatted: '2up',
    });
  });

  it('returnerer "Nup" for side 2 etter 18 hull', () => {
    const r = computeMatchResult(-1, 18, 0);
    expect(r).toEqual({
      winner: 'side2',
      marginUp: 1,
      decidedAtHole: 18,
      remainingAtDecision: 0,
      formatted: '1up',
    });
  });

  it('grensetilfelle: |holesUp| === holesRemaining er IKKE mat-em (kan fortsatt nivelleres)', () => {
    // 3 up med 3 hull igjen — taper kan fortsatt vinne alle tre og dekke
    // gapet (selv om de ikke kan vinne match). Matchen avgjøres ikke før
    // gapet er strengt større enn igjenværende hull.
    expect(computeMatchResult(3, 15, 3)).toBeNull();
    expect(computeMatchResult(-3, 15, 3)).toBeNull();
  });
});

describe('compute — singles matchplay basis', () => {
  it('side 1 vinner 4&3: leder 4 up etter hull 15, 3 hull igjen', () => {
    // Side 1 vinner 4 hull (1, 2, 3, 4), 11 hull tied. Etter hull 15:
    // side1Wins = 4, side2Wins = 0, holesPlayed = 15, holesRemaining = 3.
    // |4| > 3 → mat-em med 4&3.
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 15; h++) {
      if (h <= 4) {
        // side 1 vinner: side 1 par, side 2 bogey
        scores.push({ userId: 'a', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b', holeNumber: h, gross: 5 });
      } else {
        // tied: begge par
        scores.push({ userId: 'a', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b', holeNumber: h, gross: 4 });
      }
    }

    const ctx = makeCtx({
      players: side1And2(),
      holes: par4Holes(18),
      scores,
    });
    const r = compute(ctx);
    expect(r.kind).toBe('singles_matchplay');
    expect(r.holesUp).toBe(4);
    expect(r.holesPlayed).toBe(15);
    expect(r.holesRemaining).toBe(3);
    expect(r.result).toEqual({
      winner: 'side1',
      marginUp: 4,
      decidedAtHole: 15,
      remainingAtDecision: 3,
      formatted: '4&3',
    });
  });

  it('all square 18 hull: hver side vinner 9 hull → "AS"', () => {
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      // Annenhver hull: side 1 vinner først, så side 2.
      if (h % 2 === 1) {
        // side 1 vinner
        scores.push({ userId: 'a', holeNumber: h, gross: 3 });
        scores.push({ userId: 'b', holeNumber: h, gross: 4 });
      } else {
        // side 2 vinner
        scores.push({ userId: 'a', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b', holeNumber: h, gross: 3 });
      }
    }
    const ctx = makeCtx({
      players: side1And2(),
      holes: par4Holes(18),
      scores,
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

  it('2up etter 18: side 1 vinner 10 hull, side 2 vinner 8 hull', () => {
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      if (h <= 10) {
        scores.push({ userId: 'a', holeNumber: h, gross: 3 });
        scores.push({ userId: 'b', holeNumber: h, gross: 4 });
      } else {
        scores.push({ userId: 'a', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b', holeNumber: h, gross: 3 });
      }
    }
    const ctx = makeCtx({
      players: side1And2(),
      holes: par4Holes(18),
      scores,
    });
    const r = compute(ctx);
    expect(r.holesUp).toBe(2);
    expect(r.holesPlayed).toBe(18);
    expect(r.result?.formatted).toBe('2up');
    expect(r.result?.winner).toBe('side1');
  });

  it('tied hole: lik netto → result="tied", bidrar ikke til holesUp', () => {
    const ctx = makeCtx({
      players: side1And2(),
      holes: par4Holes(1),
      scores: [
        { userId: 'a', holeNumber: 1, gross: 4 },
        { userId: 'b', holeNumber: 1, gross: 4 },
      ],
    });
    const r = compute(ctx);
    expect(r.holes[0].result).toBe('tied');
    expect(r.holesUp).toBe(0);
    expect(r.holesPlayed).toBe(1);
  });

  it('unplayed hole: én side mangler gross → result="unplayed", teller ikke som spilt', () => {
    const ctx = makeCtx({
      players: side1And2(),
      holes: par4Holes(1),
      scores: [{ userId: 'a', holeNumber: 1, gross: 4 }],
    });
    const r = compute(ctx);
    expect(r.holes[0].result).toBe('unplayed');
    expect(r.holes[0].side1Gross).toBe(4);
    expect(r.holes[0].side2Gross).toBeNull();
    expect(r.holesPlayed).toBe(0);
    expect(r.holesUp).toBe(0);
  });

  it('begge sider mangler gross → result="unplayed"', () => {
    const ctx = makeCtx({
      players: side1And2(),
      holes: par4Holes(1),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.holes[0].result).toBe('unplayed');
    expect(r.holesPlayed).toBe(0);
    expect(r.holesUp).toBe(0);
  });

  it('live midt i runden (10 hull spilt, ikke mat-em) → result=null', () => {
    // 1 up etter 10 hull, 8 hull igjen — ikke mat-em
    const scores: ScoringHoleScore[] = [];
    scores.push({ userId: 'a', holeNumber: 1, gross: 3 });
    scores.push({ userId: 'b', holeNumber: 1, gross: 4 });
    for (let h = 2; h <= 10; h++) {
      scores.push({ userId: 'a', holeNumber: h, gross: 4 });
      scores.push({ userId: 'b', holeNumber: h, gross: 4 });
    }
    const ctx = makeCtx({
      players: side1And2(),
      holes: par4Holes(18),
      scores,
    });
    const r = compute(ctx);
    expect(r.holesUp).toBe(1);
    expect(r.holesPlayed).toBe(10);
    expect(r.holesRemaining).toBe(8);
    expect(r.result).toBeNull();
  });

  it('0 hull spilt → holesUp=0, holesPlayed=0, result=null', () => {
    const ctx = makeCtx({
      players: side1And2(),
      holes: par4Holes(18),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.holesUp).toBe(0);
    expect(r.holesPlayed).toBe(0);
    expect(r.holesRemaining).toBe(18);
    expect(r.result).toBeNull();
  });

  it('inkluderer extra strokes via courseHandicap (HCP-stroke vinner hullet)', () => {
    // Side 1 har CH=18 → 1 ekstra slag på alle hull. Side 2 har CH=0.
    // Hull 1: side 1 brutto 5 → netto 4. Side 2 brutto 5 → netto 5.
    // Side 1 vinner hullet på netto.
    const players: ScoringPlayer[] = [
      { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
      { userId: 'b', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        { userId: 'a', holeNumber: 1, gross: 5 },
        { userId: 'b', holeNumber: 1, gross: 5 },
      ],
    });
    const r = compute(ctx);
    expect(r.holes[0].side1Extra).toBe(1);
    expect(r.holes[0].side2Extra).toBe(0);
    expect(r.holes[0].side1Net).toBe(4);
    expect(r.holes[0].side2Net).toBe(5);
    expect(r.holes[0].result).toBe('side1_wins');
    expect(r.holesUp).toBe(1);
  });

  it('per-hull-rad inneholder par + strokeIndex fra ctx.holes', () => {
    const ctx = makeCtx({
      players: side1And2(),
      holes: [
        { number: 1, par: 5, strokeIndex: 7 },
        { number: 2, par: 3, strokeIndex: 15 },
      ],
      scores: [
        { userId: 'a', holeNumber: 1, gross: 5 },
        { userId: 'b', holeNumber: 1, gross: 5 },
      ],
    });
    const r = compute(ctx);
    expect(r.holes[0]).toMatchObject({ holeNumber: 1, par: 5, strokeIndex: 7 });
    expect(r.holes[1]).toMatchObject({ holeNumber: 2, par: 3, strokeIndex: 15 });
  });

  it('sides-tuple er sortert side 1, så side 2 (uavhengig av input-rekkefølge)', () => {
    const players: ScoringPlayer[] = [
      // Side 2 først i input
      { userId: 'b', teamNumber: 2, flightNumber: 2, courseHandicap: 5 },
      { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.sides[0].sideNumber).toBe(1);
    expect(r.sides[0].userId).toBe('a');
    expect(r.sides[0].courseHandicap).toBe(10);
    expect(r.sides[1].sideNumber).toBe(2);
    expect(r.sides[1].userId).toBe('b');
    expect(r.sides[1].courseHandicap).toBe(5);
  });
});

describe('compute — defensiv fallback ved feil sider', () => {
  it('1 spiller → tom shell (validatoren skal stoppe dette ved publish)', () => {
    const ctx = makeCtx({
      players: [{ userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0 }],
      holes: par4Holes(18),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.holes).toEqual([]);
    expect(r.holesUp).toBe(0);
    expect(r.holesPlayed).toBe(0);
    expect(r.holesRemaining).toBe(18);
    expect(r.result).toBeNull();
  });

  it('3 spillere → tom shell (matchplay krever EKSAKT 2 sider)', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'c', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      ],
      holes: par4Holes(18),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.holes).toEqual([]);
    expect(r.result).toBeNull();
  });

  it('begge spillere på samme side → tom shell', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(18),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.holes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Per-kjønn-par (#240). I matchplay kan side 1 og side 2 spille fra ulike
// tees (typisk herre vs dame). Hver side får sin egen par-referanse via
// parFor() slik at netto-sammenligning per hull skjer mot riktig par per
// side.
// ---------------------------------------------------------------------------

describe('compute — per-gender par (#240)', () => {
  it('side1Par og side2Par reflekterer hver sides teeGender', () => {
    // Side 1 herre (par_mens=4), side 2 dame (par_ladies=5). Begge gross=4,
    // CH=0. Netto er lik gross for begge — selve hull-resultatet er tied
    // (netto 4 vs netto 4) — men par-feltene skal vise ulike verdier.
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
        { userId: 'b', teamNumber: 2, flightNumber: 2, courseHandicap: 0, teeGender: 'ladies' },
      ],
      holes: [
        { number: 1, par: 4, parByGender: { mens: 4, ladies: 5, juniors: 4 }, strokeIndex: 1 },
      ],
      scores: [
        { userId: 'a', holeNumber: 1, gross: 4 },
        { userId: 'b', holeNumber: 1, gross: 4 },
      ],
    });
    const r = compute(ctx);
    expect(r.holes[0].side1Par).toBe(4);
    expect(r.holes[0].side2Par).toBe(5);
    // Backward-compat: par-feltet er fortsatt satt og speiler side1Par.
    expect(r.holes[0].par).toBe(4);
    // Hull-resultat: netto er lik begge → tied
    expect(r.holes[0].result).toBe('tied');
  });

  it('faller tilbake til hole.par når parByGender ikke er satt', () => {
    const ctx = makeCtx({
      players: side1And2(),
      holes: par4Holes(1),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.holes[0].par).toBe(4);
    expect(r.holes[0].side1Par).toBe(4);
    expect(r.holes[0].side2Par).toBe(4);
  });

  it('sides-tuple bærer teeGender fra ScoringPlayer', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
        { userId: 'b', teamNumber: 2, flightNumber: 2, courseHandicap: 0, teeGender: 'ladies' },
      ],
      holes: par4Holes(1),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.sides[0].teeGender).toBe('mens');
    expect(r.sides[1].teeGender).toBe('ladies');
  });
});

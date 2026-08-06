import { describe, it, expect } from 'vitest';
import {
  compute,
  greensomeTeamHandicap,
  readTeamStrokesOverride,
} from './greensomeMatchplay';
import type {
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from './types';

// Fixtures speilet foursomesMatchplay.test.ts. Greensome reuser foursomes'
// result-shape; eneste forskjell i scoring er lag-handicapet (60/40 vs sum).

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
  teamStrokesOverride?: { team1: number; team2: number };
}): ScoringContext {
  const config: GameModeConfig = {
    kind: 'greensome_matchplay',
    team_size: 2,
    teams_count: 2,
    allowance_pct: opts.allowancePct ?? 100,
    ...(opts.teamStrokesOverride ? { team_strokes_override: opts.teamStrokesOverride } : {}),
  };
  return {
    game: {
      id: 'g-greensome',
      game_mode: 'greensome_matchplay',
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

describe('greensomeTeamHandicap — 60/40 split', () => {
  it('round(0.6×low + 0.4×high): (8, 18) → 12', () => {
    expect(greensomeTeamHandicap(8, 18)).toBe(12);
  });
  it('symmetrisk uansett rekkefølge', () => {
    expect(greensomeTeamHandicap(18, 8)).toBe(12);
  });
  it('runder ved .5: (7, 20) → round(12.2)=12', () => {
    expect(greensomeTeamHandicap(7, 20)).toBe(12);
  });
  it('runder ved .8: (5, 22) → round(11.8)=12', () => {
    expect(greensomeTeamHandicap(5, 22)).toBe(12);
  });
  it('like handicap: (10, 10) → 10', () => {
    expect(greensomeTeamHandicap(10, 10)).toBe(10);
  });
});

describe('compute — greensome matchplay basis', () => {
  it('shape: result.kind=foursomes_matchplay (reuset), sides tuple av 2', () => {
    const ctx = makeCtx({ players: fourSides(), holes: par4Holes(1), scores: [] });
    const r = compute(ctx);
    expect(r.kind).toBe('foursomes_matchplay');
    expect(r.sides).toHaveLength(2);
    expect(r.sides[0].sideNumber).toBe(1);
    expect(r.sides[1].sideNumber).toBe(2);
  });

  it('high side får diff-strokes (60/40 team-HCP), default 100 %', () => {
    // side1: 8,18 → teamCH 12. side2: 0,0 → teamCH 0. diff 12, 100% → 12 til side1
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 8 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const ctx = makeCtx({ players, holes: par4Holes(18), scores: [], allowancePct: 100 });
    const r = compute(ctx);
    expect(r.sides[0].combinedCourseHandicap).toBe(12);
    expect(r.sides[1].combinedCourseHandicap).toBe(0);
    expect(r.sides[0].effectiveExtraHandicap).toBe(12);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
  });

  it('low side får 0 strokes på alle hull', () => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 2 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 2 },
    ];
    const ctx = makeCtx({ players, holes: par4Holes(18), scores: [], allowancePct: 100 });
    const r = compute(ctx);
    // side1 teamCH 18, side2 teamCH 2 → diff 16 til side1
    expect(r.sides[0].effectiveExtraHandicap).toBe(16);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
    for (const hole of r.holes) {
      expect(hole.side2Extra).toBe(0);
    }
  });

  it('tie i lag-HCP: begge får 0 strokes, gross-only matchplay', () => {
    // side1: 10,5 → round(0.6×5+0.4×10)=round(7)=7. side2: 8,6 → round(0.6×6+0.4×8)=round(6.8)=7. tie.
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 5 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 8 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 6 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        { userId: 'a1', holeNumber: 1, gross: 4 },
        { userId: 'b1', holeNumber: 1, gross: 5 },
      ],
      allowancePct: 100,
    });
    const r = compute(ctx);
    expect(r.sides[0].combinedCourseHandicap).toBe(7);
    expect(r.sides[1].combinedCourseHandicap).toBe(7);
    expect(r.sides[0].effectiveExtraHandicap).toBe(0);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
    expect(r.holes[0].result).toBe('side1_wins');
  });

  it('mat-em før 18: side 1 leder 3 up med 2 igjen → 3&2', () => {
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 16; h++) {
      if (h <= 3) {
        scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 5 });
      } else {
        scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 4 });
      }
    }
    const ctx = makeCtx({ players: fourSides(), holes: par4Holes(18), scores, allowancePct: 0 });
    const r = compute(ctx);
    expect(r.holesUp).toBe(3);
    expect(r.holesPlayed).toBe(16);
    expect(r.holesRemaining).toBe(2);
    expect(r.result?.formatted).toBe('3&2');
  });

  it('AS etter 18: hver side vinner 9 hull → AS', () => {
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      if (h % 2 === 1) {
        scores.push({ userId: 'a1', holeNumber: h, gross: 3 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 4 });
      } else {
        scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 3 });
      }
    }
    const ctx = makeCtx({ players: fourSides(), holes: par4Holes(18), scores, allowancePct: 0 });
    const r = compute(ctx);
    expect(r.holesUp).toBe(0);
    expect(r.holesPlayed).toBe(18);
    expect(r.result?.formatted).toBe('AS');
  });

  it('ferdig 18 hull med vinner: side 2 vinner 2up', () => {
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 8; h++) {
      scores.push({ userId: 'a1', holeNumber: h, gross: 3 });
      scores.push({ userId: 'b1', holeNumber: h, gross: 4 });
    }
    for (let h = 9; h <= 18; h++) {
      scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
      scores.push({ userId: 'b1', holeNumber: h, gross: 3 });
    }
    const ctx = makeCtx({ players: fourSides(), holes: par4Holes(18), scores, allowancePct: 0 });
    const r = compute(ctx);
    expect(r.holesUp).toBe(-2);
    expect(r.result?.formatted).toBe('2up');
  });

  it('one-side-unplayed-hole: result=unplayed, teller ikke i holesPlayed', () => {
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(2),
      scores: [
        { userId: 'a1', holeNumber: 1, gross: 4 },
        { userId: 'a1', holeNumber: 2, gross: 4 },
        { userId: 'b1', holeNumber: 2, gross: 5 },
      ],
      allowancePct: 0,
    });
    const r = compute(ctx);
    expect(r.holes[0].result).toBe('unplayed');
    expect(r.holes[1].result).toBe('side1_wins');
    expect(r.holesPlayed).toBe(1);
    expect(r.holesUp).toBe(1);
  });

  it('allowance 0% → gross-only (begge 0 extra)', () => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 2 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
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
    expect(r.sides[0].effectiveExtraHandicap).toBe(0);
    expect(r.sides[1].effectiveExtraHandicap).toBe(0);
    expect(r.holes[0].result).toBe('side2_wins');
  });

  it('captainUserId er lex-min av sidens partnere', () => {
    const players: ScoringPlayer[] = [
      { userId: 'zeta', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'alpha', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'yankee', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'bravo', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const ctx = makeCtx({ players, holes: par4Holes(1), scores: [] });
    const r = compute(ctx);
    expect(r.sides[0].captainUserId).toBe('alpha');
    expect(r.sides[1].captainUserId).toBe('bravo');
  });

  // ---------------------------------------------------------------------------
  // team_strokes_override (#1441, D10). Arrangørens Irish-greensome-formel
  // (40 % av høyeste spillers spillehandicap) kan ikke uttrykkes via
  // allowance-% på 60/40-formelen. Når `mode_config.team_strokes_override`
  // er satt, bruker motoren tallene DIREKTE i stedet for
  // `greensomeTeamHandicap(ch1, ch2)` — resten av rørledningen (diff ×
  // allowance_pct/100 → high-side → per-hull SI-allokering) er uendret. Se
  // ASSUMPTION-doc-kommentaren i greensomeMatchplay.ts for det fulle
  // resonnementet bak dette valget.
  // ---------------------------------------------------------------------------

  describe('team_strokes_override (D10) — manuelle lag-slag', () => {
    it('override present: erstatter 60/40-beregnet lag-CH, diff × allowance_pct kjører som normalt', () => {
      // Spillernes faktiske CH ville gitt et helt annet 60/40-resultat
      // (18,18 → 18 og 0,0 → 0) — override MÅ overstyre, ikke supplere.
      const players: ScoringPlayer[] = [
        { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
        { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
        { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
        { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      ];
      const ctx = makeCtx({
        players,
        holes: par4Holes(18),
        scores: [],
        allowancePct: 100,
        teamStrokesOverride: { team1: 8, team2: 3 },
      });
      const r = compute(ctx);
      // Overstyrte tall vises som lagets "combinedCourseHandicap" (ikke 18/0).
      expect(r.sides[0].combinedCourseHandicap).toBe(8);
      expect(r.sides[1].combinedCourseHandicap).toBe(3);
      // diff = |8-3| = 5, allowance 100 % → 5 slag til høylaget (team1, 8 > 3).
      expect(r.sides[0].effectiveExtraHandicap).toBe(5);
      expect(r.sides[1].effectiveExtraHandicap).toBe(0);
      // SI 1-5 → +1 slag til side 1; SI 6-18 → 0.
      for (const hole of r.holes) {
        const expected = hole.strokeIndex <= 5 ? 1 : 0;
        expect(hole.side1Extra).toBe(expected);
        expect(hole.side2Extra).toBe(0);
      }
    });

    it('override fraværende: uendret 60/40-formel + allowance-rørledning (bit for bit som i dag)', () => {
      const players: ScoringPlayer[] = [
        { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 8 },
        { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
        { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
        { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      ];
      // Ingen teamStrokesOverride i opts → mode_config har ikke feltet.
      const ctx = makeCtx({ players, holes: par4Holes(18), scores: [], allowancePct: 100 });
      const r = compute(ctx);
      // Samme forventning som «high side får diff-strokes»-testen over: 60/40 på
      // (8,18) → 12, på (0,0) → 0.
      expect(r.sides[0].combinedCourseHandicap).toBe(12);
      expect(r.sides[1].combinedCourseHandicap).toBe(0);
      expect(r.sides[0].effectiveExtraHandicap).toBe(12);
      expect(r.sides[1].effectiveExtraHandicap).toBe(0);
    });

    it('override + 9-hulls front9-segment: strokes allokeres kun over hull-i-scope (#1441/D2)', () => {
      // Front9 (hull 1-9), SI 1-9. team1=8, team2=3 override, allowance 100 %
      // → diff 5 → side1 får slag på SI 1-5 (alle innenfor front9-scope her).
      const holes = par4Holes(9); // number 1-9, strokeIndex 1-9
      const players: ScoringPlayer[] = [
        { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 5 },
        { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 5 },
        { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 20 },
        { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 20 },
      ];
      const ctx = makeCtx({
        players,
        holes,
        scores: [],
        allowancePct: 100,
        teamStrokesOverride: { team1: 8, team2: 3 },
      });
      const r = compute(ctx);
      expect(r.holes).toHaveLength(9);
      expect(r.holesRemaining).toBe(9); // #1441: hull-i-scope, ikke hardkodet 18
      expect(r.sides[0].effectiveExtraHandicap).toBe(5);
      expect(r.sides[1].effectiveExtraHandicap).toBe(0);
      for (const hole of r.holes) {
        const expected = hole.strokeIndex <= 5 ? 1 : 0;
        expect(hole.side1Extra).toBe(expected);
      }
    });
  });

  it('empty shell ved 3 spillere', () => {
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
    expect(r.kind).toBe('foursomes_matchplay');
    expect(r.holes).toEqual([]);
    expect(r.result).toBeNull();
  });
});

// #1447: føringsflaten (hull-siden) leser samme override som motoren via den
// eksporterte readTeamStrokesOverride — testene pinner mappingen slik at
// display og motor ikke kan drifte hver sin vei igjen.
describe('readTeamStrokesOverride — delt med føringsflaten (#1447)', () => {
  it('mapper team1/team2 → side1/side2 når feltet er satt', () => {
    expect(
      readTeamStrokesOverride({
        kind: 'greensome_matchplay',
        team_size: 2,
        teams_count: 2,
        allowance_pct: 100,
        team_strokes_override: { team1: 8, team2: 3 },
      }),
    ).toEqual({ side1: 8, side2: 3 });
  });

  it('undefined når feltet mangler (dagens 60/40-oppførsel)', () => {
    expect(
      readTeamStrokesOverride({
        kind: 'greensome_matchplay',
        team_size: 2,
        teams_count: 2,
        allowance_pct: 100,
      }),
    ).toBeUndefined();
  });

  it('undefined for andre mode_config-kinds', () => {
    expect(
      readTeamStrokesOverride({ kind: 'best_ball', team_size: 2, teams_count: 2 }),
    ).toBeUndefined();
  });
});

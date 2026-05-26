import { describe, it, expect } from 'vitest';
import { compute } from './fourballMatchplay';
import type {
  GameModeConfig,
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from './types';

// ---------------------------------------------------------------------------
// Fixture-builders. Speilet singlesMatchplay.test.ts-mønsteret slik at
// scoring-suite-en bruker konsistent test-stil på tvers av matchplay-modusene.
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
    kind: 'fourball_matchplay',
    team_size: 2,
    teams_count: 2,
    allowance_pct: opts.allowancePct ?? 100,
  };
  return {
    game: {
      id: 'g-4b',
      game_mode: 'fourball_matchplay',
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

describe('compute — fourball matchplay basis', () => {
  it('side 1 vinner 3&2 mat-em: leder 3 hull med 2 igjen etter hull 16', () => {
    // Side 1 vinner hull 1-3 (en av spillerne par, motstandere bogey).
    // Hull 4-16 tied (alle par). Etter hull 16 er det 3 up / 2 igjen → mat-em 3&2.
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 16; h++) {
      if (h <= 3) {
        scores.push({ userId: 'a1', holeNumber: h, gross: 4 }); // par (best for side 1)
        scores.push({ userId: 'a2', holeNumber: h, gross: 5 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 5 }); // bogey
        scores.push({ userId: 'b2', holeNumber: h, gross: 5 });
      } else {
        // Alle par → tied
        scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
        scores.push({ userId: 'a2', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b2', holeNumber: h, gross: 4 });
      }
    }
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(18),
      scores,
    });
    const r = compute(ctx);
    expect(r.kind).toBe('fourball_matchplay');
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

  it('AS etter 18 hull: hver side vinner 9 hull → result=AS', () => {
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      if (h % 2 === 1) {
        // Side 1 vinner: minst én partner med 3, motstander 4
        scores.push({ userId: 'a1', holeNumber: h, gross: 3 });
        scores.push({ userId: 'a2', holeNumber: h, gross: 5 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 4 });
        scores.push({ userId: 'b2', holeNumber: h, gross: 5 });
      } else {
        scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
        scores.push({ userId: 'a2', holeNumber: h, gross: 5 });
        scores.push({ userId: 'b1', holeNumber: h, gross: 3 });
        scores.push({ userId: 'b2', holeNumber: h, gross: 5 });
      }
    }
    const ctx = makeCtx({
      players: fourSides(),
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

  it('1up etter 18: side 2 vinner ett hull mer enn side 1', () => {
    const scores: ScoringHoleScore[] = [];
    // Hull 1-8: side 1 vinner
    for (let h = 1; h <= 8; h++) {
      scores.push({ userId: 'a1', holeNumber: h, gross: 3 });
      scores.push({ userId: 'a2', holeNumber: h, gross: 5 });
      scores.push({ userId: 'b1', holeNumber: h, gross: 4 });
      scores.push({ userId: 'b2', holeNumber: h, gross: 5 });
    }
    // Hull 9-17: side 2 vinner (9 hull)
    for (let h = 9; h <= 17; h++) {
      scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
      scores.push({ userId: 'a2', holeNumber: h, gross: 5 });
      scores.push({ userId: 'b1', holeNumber: h, gross: 3 });
      scores.push({ userId: 'b2', holeNumber: h, gross: 5 });
    }
    // Hull 18: tied
    scores.push({ userId: 'a1', holeNumber: 18, gross: 4 });
    scores.push({ userId: 'a2', holeNumber: 18, gross: 4 });
    scores.push({ userId: 'b1', holeNumber: 18, gross: 4 });
    scores.push({ userId: 'b2', holeNumber: 18, gross: 4 });

    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(18),
      scores,
    });
    const r = compute(ctx);
    expect(r.holesUp).toBe(-1);
    expect(r.holesPlayed).toBe(18);
    expect(r.result).toEqual({
      winner: 'side2',
      marginUp: 1,
      decidedAtHole: 18,
      remainingAtDecision: 0,
      formatted: '1up',
    });
  });

  it('tied hole: lik best-netto begge sider → result=tied, ingen endring i holesUp', () => {
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(1),
      scores: [
        { userId: 'a1', holeNumber: 1, gross: 4 },
        { userId: 'a2', holeNumber: 1, gross: 5 },
        { userId: 'b1', holeNumber: 1, gross: 5 },
        { userId: 'b2', holeNumber: 1, gross: 4 },
      ],
    });
    const r = compute(ctx);
    expect(r.holes[0].side1BestNet).toBe(4);
    expect(r.holes[0].side2BestNet).toBe(4);
    expect(r.holes[0].result).toBe('tied');
    expect(r.holesPlayed).toBe(1);
    expect(r.holesUp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Best-ball-aggregering på siden
// ---------------------------------------------------------------------------

describe('compute — best-ball per side', () => {
  it('begge partnere på side 1 mangler gross → side1BestNet=null, hullet unplayed', () => {
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(1),
      scores: [
        // Bare side 2 har gross
        { userId: 'b1', holeNumber: 1, gross: 4 },
        { userId: 'b2', holeNumber: 1, gross: 5 },
      ],
    });
    const r = compute(ctx);
    expect(r.holes[0].side1BestNet).toBeNull();
    expect(r.holes[0].side2BestNet).toBe(4);
    expect(r.holes[0].result).toBe('unplayed');
    expect(r.holesPlayed).toBe(0);
    expect(r.holesUp).toBe(0);
  });

  it('én partner med gross på en side teller fortsatt: hull avgjort', () => {
    // Side 1: bare a1 har gross (4 netto), a2 mangler. Side 2: begge har gross.
    // Best-ball-tradisjon: én er nok → side1BestNet=4, hull avgjøres.
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(1),
      scores: [
        { userId: 'a1', holeNumber: 1, gross: 4 },
        // a2 mangler
        { userId: 'b1', holeNumber: 1, gross: 5 },
        { userId: 'b2', holeNumber: 1, gross: 5 },
      ],
    });
    const r = compute(ctx);
    expect(r.holes[0].side1BestNet).toBe(4);
    expect(r.holes[0].side2BestNet).toBe(5);
    expect(r.holes[0].result).toBe('side1_wins');
    expect(r.holes[0].side1ContributorIds).toEqual(['a1']);
    expect(r.holesPlayed).toBe(1);
    expect(r.holesUp).toBe(1);
  });

  it('tie på best-netto innenfor siden: contributors inneholder begge partnere', () => {
    // Begge partnere på side 1 har netto 4 → contributors = [a1, a2]
    const ctx = makeCtx({
      players: fourSides(),
      holes: par4Holes(1),
      scores: [
        { userId: 'a1', holeNumber: 1, gross: 4 },
        { userId: 'a2', holeNumber: 1, gross: 4 },
        { userId: 'b1', holeNumber: 1, gross: 5 },
        { userId: 'b2', holeNumber: 1, gross: 6 },
      ],
    });
    const r = compute(ctx);
    expect(r.holes[0].side1BestNet).toBe(4);
    expect(r.holes[0].side1ContributorIds.sort()).toEqual(['a1', 'a2']);
    // Per-spiller isContributor markert for begge
    const side1 = r.holes[0].side1Players;
    expect(side1.every((p) => p.isContributor)).toBe(true);
    // Side 2: best er 5 (b1), b2 ikke contributor
    expect(r.holes[0].side2BestNet).toBe(5);
    expect(r.holes[0].side2ContributorIds).toEqual(['b1']);
  });
});

// ---------------------------------------------------------------------------
// Allowance-pipeline
// ---------------------------------------------------------------------------

describe('compute — allowance-pipeline', () => {
  it('allowance 0% (brutto): effectiveHandicap=0 for alle, netto = gross', () => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 12 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 20 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 8 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [
        { userId: 'a1', holeNumber: 1, gross: 5 },
        { userId: 'a2', holeNumber: 1, gross: 4 },
        { userId: 'b1', holeNumber: 1, gross: 5 },
        { userId: 'b2', holeNumber: 1, gross: 4 },
      ],
      allowancePct: 0,
    });
    const r = compute(ctx);
    // Hver sides effektive HCP er 0 → ingen extra strokes, netto = gross
    for (const sp of r.sides[0].players) expect(sp.effectiveHandicap).toBe(0);
    for (const sp of r.sides[1].players) expect(sp.effectiveHandicap).toBe(0);
    for (const pc of r.holes[0].side1Players) {
      expect(pc.extraStrokes).toBe(0);
      expect(pc.net).toBe(pc.gross);
    }
    // Best netto = 4 begge sider (a2 / b2) → tied
    expect(r.holes[0].side1BestNet).toBe(4);
    expect(r.holes[0].side2BestNet).toBe(4);
    expect(r.holes[0].result).toBe('tied');
  });

  it('allowance 85% (WHS-default): effectiveHandicap = round(ch * 0.85)', () => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 4 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores: [],
      allowancePct: 85,
    });
    const r = compute(ctx);
    // applyAllowance(20, 85) = round(17) = 17
    // applyAllowance(10, 85) = round(8.5) = 9 (Math.round rounds half-up for positive)
    // applyAllowance(4, 85)  = round(3.4) = 3
    // applyAllowance(0, 85)  = 0
    const sideById = new Map<string, number>();
    for (const sp of r.sides[0].players) sideById.set(sp.userId, sp.effectiveHandicap);
    for (const sp of r.sides[1].players) sideById.set(sp.userId, sp.effectiveHandicap);
    expect(sideById.get('a1')).toBe(17);
    expect(sideById.get('a2')).toBe(9);
    expect(sideById.get('b1')).toBe(3);
    expect(sideById.get('b2')).toBe(0);
  });

  it('allowance 50%: effectiveHandicap halveres', () => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 18 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [],
      allowancePct: 50,
    });
    const r = compute(ctx);
    const sideById = new Map<string, number>();
    for (const sp of r.sides[0].players) sideById.set(sp.userId, sp.effectiveHandicap);
    for (const sp of r.sides[1].players) sideById.set(sp.userId, sp.effectiveHandicap);
    expect(sideById.get('a1')).toBe(10);
    expect(sideById.get('a2')).toBe(5);
    expect(sideById.get('b1')).toBe(9);
    expect(sideById.get('b2')).toBe(0);
  });

  it('høy CH får 2 slag på SI 1 (CH=20, 100%): netto = gross − 2 på SI 1', () => {
    // courseHandicap 20 → effektiv 20 (100%) → strokesForHole(20, 1) = 2
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const ctx = makeCtx({
      players,
      // SI 1 på hull 1
      holes: [{ number: 1, par: 4, strokeIndex: 1 }],
      scores: [
        { userId: 'a1', holeNumber: 1, gross: 6 },
        { userId: 'a2', holeNumber: 1, gross: 6 },
        { userId: 'b1', holeNumber: 1, gross: 5 },
        { userId: 'b2', holeNumber: 1, gross: 5 },
      ],
      allowancePct: 100,
    });
    const r = compute(ctx);
    // a1 får 2 ekstra slag på SI 1
    const a1Cell = r.holes[0].side1Players.find((p) => p.userId === 'a1');
    expect(a1Cell?.extraStrokes).toBe(2);
    expect(a1Cell?.net).toBe(4);
    // Best netto side 1 = 4 (a1), best netto side 2 = 5 → side 1 vinner
    expect(r.holes[0].side1BestNet).toBe(4);
    expect(r.holes[0].side2BestNet).toBe(5);
    expect(r.holes[0].result).toBe('side1_wins');
  });
});

// ---------------------------------------------------------------------------
// Per-kjønn-tees (#240)
// ---------------------------------------------------------------------------

describe('compute — blandet-kjønn-tees (#240)', () => {
  it('side1Par og side2Par leses fra parByGender via første partners teeGender', () => {
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
        { userId: 'a2', holeNumber: 1, gross: 4 },
        { userId: 'b1', holeNumber: 1, gross: 4 },
        { userId: 'b2', holeNumber: 1, gross: 4 },
      ],
    });
    const r = compute(ctx);
    expect(r.holes[0].side1Par).toBe(4);
    expect(r.holes[0].side2Par).toBe(5);
    expect(r.holes[0].par).toBe(4); // backward-compat = side1Par
    // Netto er fortsatt lik (begge 4) → tied; SI-allokering avhenger ikke av par
    expect(r.holes[0].result).toBe('tied');
  });
});

// ---------------------------------------------------------------------------
// Sortering + sides-tuple
// ---------------------------------------------------------------------------

describe('compute — sides-tuple og deterministisk player-sortering', () => {
  it('sides[0]=side1, sides[1]=side2 uavhengig av input-rekkefølge', () => {
    const players: ScoringPlayer[] = [
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
    ];
    const ctx = makeCtx({
      players,
      holes: par4Holes(1),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.sides[0].sideNumber).toBe(1);
    expect(r.sides[1].sideNumber).toBe(2);
    // Spillere innen siden er sortert deterministisk (på userId)
    expect(r.sides[0].players.map((p) => p.userId)).toEqual(['a1', 'a2']);
    expect(r.sides[1].players.map((p) => p.userId)).toEqual(['b1', 'b2']);
  });
});

// ---------------------------------------------------------------------------
// Defensiv empty-shell
// ---------------------------------------------------------------------------

describe('compute — defensiv empty-shell ved feil spiller-fordeling', () => {
  it('0 spillere → empty shell, ikke kast', () => {
    const ctx = makeCtx({
      players: [],
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

  it('3 spillere (skjev fordeling) → empty shell', () => {
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

  it('alle 4 på samme side → empty shell', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'a3', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'a4', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(18),
      scores: [],
    });
    const r = compute(ctx);
    expect(r.holes).toEqual([]);
    expect(r.holesUp).toBe(0);
  });

  it('manglende allowance_pct i mode_config → defensiv 100 (full HCP)', () => {
    // Hvis draft-state har en buggy mode_config uten allowance_pct, skal
    // scoring-laget defensivt bruke 100 % heller enn å kaste. Validatoren
    // i fase 4 garanterer feltet ved publish; dette er kun for draft-trygghet.
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    // Tving inn en mode_config UTEN allowance_pct ved å caste manuelt
    const ctx: ScoringContext = {
      game: {
        id: 'g-broken',
        game_mode: 'fourball_matchplay',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mode_config: { kind: 'fourball_matchplay', team_size: 2, teams_count: 2 } as any,
      },
      players,
      holes: par4Holes(1),
      scores: [],
    };
    const r = compute(ctx);
    // Forventer at a1 har effektiv HCP 18 (100 % fallback)
    const a1 = r.sides[0].players.find((p) => p.userId === 'a1');
    expect(a1?.effectiveHandicap).toBe(18);
  });
});

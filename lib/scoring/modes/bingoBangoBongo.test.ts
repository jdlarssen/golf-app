// Type A — Pure logic tests for bingoBangoBongo.compute (issue #277).
//
// Disiplin: ingen mocks (rene verdier inn/ut), it.each for parametriserte
// cases, direkte assertions. Speiler soloStrokeplay.test.ts-stilen.

import { describe, it, expect } from 'vitest';
import { compute } from './bingoBangoBongo';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  BingoBangoBongoHoleInput,
} from './types';

// ---------------------------------------------------------------------------
// Hjelpe-fixtures
// ---------------------------------------------------------------------------

function par4Holes(count: number): ScoringHole[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

function makePlayer(userId: string): ScoringPlayer {
  return {
    userId,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: 0,
  };
}

function makeCtx(opts: {
  players: ScoringPlayer[];
  holes: ScoringHole[];
  bingoBangoBongoHoles?: BingoBangoBongoHoleInput[];
  scores?: ScoringContext['scores'];
}): ScoringContext {
  return {
    game: {
      id: 'g1',
      game_mode: 'bingo_bango_bongo',
      mode_config: { kind: 'bingo_bango_bongo', team_size: 1 },
    },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores ?? [],
    bingoBangoBongoHoles: opts.bingoBangoBongoHoles,
  };
}

// ---------------------------------------------------------------------------
// Discriminated shape
// ---------------------------------------------------------------------------

describe('bingoBangoBongo.compute — discriminated shape', () => {
  it('returnerer kind=bingo_bango_bongo', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1')],
      holes: par4Holes(1),
    });
    const result = compute(ctx);
    expect(result.kind).toBe('bingo_bango_bongo');
  });
});

// ---------------------------------------------------------------------------
// Grunnleggende poeng-tildeling
// ---------------------------------------------------------------------------

describe('bingoBangoBongo.compute — poeng-tildeling', () => {
  it('samme spiller vinner alle tre på ett hull → 3 poeng til den spilleren', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2')],
      holes: par4Holes(1),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u1', bongoUserId: 'u1' },
      ],
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.totalPoints).toBe(3);
    expect(u1.bingos).toBe(1);
    expect(u1.bangos).toBe(1);
    expect(u1.bongos).toBe(1);
    expect(u2.totalPoints).toBe(0);
    // Hull-rad skal ha pointsByPlayer korrekt.
    expect(result.holes[0].pointsByPlayer['u1']).toBe(3);
    expect(result.holes[0].pointsByPlayer['u2']).toBeUndefined();
  });

  it('normal fordeling — tre forskjellige spillere vinner ett poeng hver', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u2', bongoUserId: 'u3' },
      ],
    });
    const result = compute(ctx);
    const byId = Object.fromEntries(result.players.map((p) => [p.userId, p]));
    expect(byId['u1'].totalPoints).toBe(1);
    expect(byId['u1'].bingos).toBe(1);
    expect(byId['u2'].totalPoints).toBe(1);
    expect(byId['u2'].bangos).toBe(1);
    expect(byId['u3'].totalPoints).toBe(1);
    expect(byId['u3'].bongos).toBe(1);
  });

  it('hull uten input-rad → ingen poeng deles ut', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2')],
      holes: par4Holes(2),
      bingoBangoBongoHoles: [
        // Hull 2 mangler — ingen poeng for det
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u1', bongoUserId: 'u2' },
      ],
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    // Hull 1: u1 bingo+bango=2, u2 bongo=1
    expect(u1.totalPoints).toBe(2);
    expect(u2.totalPoints).toBe(1);
    // Hull 2-rad skal eksistere men ha tomme pointsByPlayer
    const hole2 = result.holes.find((h) => h.holeNumber === 2)!;
    expect(hole2.bingoUserId).toBeNull();
    expect(Object.keys(hole2.pointsByPlayer)).toHaveLength(0);
  });

  it('kategori null på ett hull → hopper over (ingen null-poeng)', () => {
    // Bango kan stå null (krever at alle er på green — sjelden garantert)
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2')],
      holes: par4Holes(1),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: null, bongoUserId: 'u2' },
      ],
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    expect(u1.totalPoints).toBe(1);
    expect(u1.bingos).toBe(1);
    expect(u1.bangos).toBe(0);
    expect(u2.totalPoints).toBe(1);
    expect(u2.bongos).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Antall spillere (2/3/4)
// ---------------------------------------------------------------------------

describe('bingoBangoBongo.compute — antall spillere', () => {
  it.each([
    { playerCount: 2, label: '2-spiller' },
    { playerCount: 3, label: '3-spiller' },
    { playerCount: 4, label: '4-spiller' },
  ])('$label-game → riktig antall player-rader', ({ playerCount }) => {
    const players = Array.from({ length: playerCount }, (_, i) =>
      makePlayer(`u${i + 1}`),
    );
    const ctx = makeCtx({ players, holes: par4Holes(1) });
    const result = compute(ctx);
    expect(result.players).toHaveLength(playerCount);
  });

  it('4-spiller — poeng fordeles riktig', () => {
    // En poeng til ulike spillere, én null
    const ctx = makeCtx({
      players: ['u1', 'u2', 'u3', 'u4'].map(makePlayer),
      holes: par4Holes(1),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u3', bongoUserId: 'u4' },
      ],
    });
    const result = compute(ctx);
    const byId = Object.fromEntries(result.players.map((p) => [p.userId, p]));
    expect(byId['u1'].totalPoints).toBe(1);
    expect(byId['u2'].totalPoints).toBe(0);
    expect(byId['u3'].totalPoints).toBe(1);
    expect(byId['u4'].totalPoints).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Ranking og rekkefølge
// ---------------------------------------------------------------------------

describe('bingoBangoBongo.compute — ranking', () => {
  it('sorterer spillere høyest totalPoints først', () => {
    // u1 vinner 2 poeng (bingo+bango), u2 vinner 1 (bongo)
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2')],
      holes: par4Holes(1),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u1', bongoUserId: 'u2' },
      ],
    });
    const result = compute(ctx);
    expect(result.players[0].userId).toBe('u1');
    expect(result.players[0].rank).toBe(1);
    expect(result.players[1].userId).toBe('u2');
    expect(result.players[1].rank).toBe(2);
  });

  it('rangerer 0-poeng-spillere sist', () => {
    const ctx = makeCtx({
      players: ['u1', 'u2', 'u3'].map(makePlayer),
      holes: par4Holes(1),
      bingoBangoBongoHoles: [
        // u3 får ingenting; u1=2p (bingo+bongo), u2=1p (bango)
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u2', bongoUserId: 'u1' },
      ],
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    const u3 = result.players.find((p) => p.userId === 'u3')!;
    // u1=2p → rank 1, u2=1p → rank 2, u3=0p → rank 3
    expect(u1.rank).toBe(1);
    expect(u2.rank).toBe(2);
    expect(u3.rank).toBe(3);
    expect(u3.totalPoints).toBe(0);
  });

  it('ingen input → alle har 0 poeng, alle er tied', () => {
    const ctx = makeCtx({
      players: ['u1', 'u2', 'u3'].map(makePlayer),
      holes: par4Holes(18),
    });
    const result = compute(ctx);
    for (const p of result.players) {
      expect(p.totalPoints).toBe(0);
      expect(p.rank).toBe(1);
      // Alle er tied med de to andre
      expect(p.tiedWith).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Tiebreak-kaskade
// ---------------------------------------------------------------------------

describe('bingoBangoBongo.compute — tiebreak', () => {
  it('lik total → flest bingos avgjør', () => {
    // u1: 2 bingos, 0 bangos, 0 bongos = total 2
    // u2: 0 bingos, 1 bango, 1 bongo = total 2
    // u1 vinner tiebreak (flest bingos)
    const ctx = makeCtx({
      players: ['u1', 'u2'].map(makePlayer),
      holes: par4Holes(2),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u2', bongoUserId: null },
        { holeNumber: 2, bingoUserId: 'u1', bangoUserId: null, bongoUserId: 'u2' },
      ],
    });
    const result = compute(ctx);
    expect(result.players[0].userId).toBe('u1');
    expect(result.players[0].rank).toBe(1);
    expect(result.players[1].userId).toBe('u2');
    expect(result.players[1].rank).toBe(2);
    // Bingos brøt likheten → ingen delt rank
    expect(result.players[0].tiedWith).toEqual([]);
    expect(result.players[1].tiedWith).toEqual([]);
  });

  it('lik total + like bingos → flest bongos avgjør', () => {
    // u1: 1 bingo, 1 bango, 0 bongo = total 2
    // u2: 1 bingo, 0 bango, 1 bongo = total 2
    // Lik total, lik bingos. u2 vinner på bongos (1 > 0).
    const ctx = makeCtx({
      players: ['u1', 'u2'].map(makePlayer),
      holes: par4Holes(2),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u1', bongoUserId: null },
        { holeNumber: 2, bingoUserId: 'u2', bangoUserId: null, bongoUserId: 'u2' },
      ],
    });
    const result = compute(ctx);
    // u1: bingos=1, bangos=1, bongos=0, total=2
    // u2: bingos=1, bangos=0, bongos=1, total=2
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    expect(u2.rank).toBe(1);
    expect(u1.rank).toBe(2);
    expect(u2.tiedWith).toEqual([]);
    expect(u1.tiedWith).toEqual([]);
  });

  it('lik total + like bingos + like bongos → delt rank og tiedWith satt', () => {
    // u1 og u2 har identisk cascade
    const ctx = makeCtx({
      players: ['u1', 'u2'].map(makePlayer),
      holes: par4Holes(2),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: null, bongoUserId: null },
        { holeNumber: 2, bingoUserId: 'u2', bangoUserId: null, bongoUserId: null },
      ],
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    // Begge: 1 bingo, 0 bangos, 0 bongos — identisk cascade
    expect(u1.rank).toBe(u2.rank);
    expect(u1.tiedWith).toContain('u2');
    expect(u2.tiedWith).toContain('u1');
  });

  it('tre spillere: to deler 1. plass → tredje får rank 3', () => {
    // u1=3, u2=3, u3=1 — u1/u2 deler rank 1, u3 får rank 3
    const ctx = makeCtx({
      players: ['u1', 'u2', 'u3'].map(makePlayer),
      holes: par4Holes(3),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u1', bongoUserId: 'u1' },
        { holeNumber: 2, bingoUserId: 'u2', bangoUserId: 'u2', bongoUserId: 'u2' },
        { holeNumber: 3, bingoUserId: 'u3', bangoUserId: null, bongoUserId: null },
      ],
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    const u3 = result.players.find((p) => p.userId === 'u3')!;
    expect(u1.totalPoints).toBe(3);
    expect(u2.totalPoints).toBe(3);
    expect(u3.totalPoints).toBe(1);
    expect(u1.rank).toBe(1);
    expect(u2.rank).toBe(1);
    expect(u3.rank).toBe(3); // Ikke 2 — to deler 1. plass
  });
});

// ---------------------------------------------------------------------------
// Slag-uavhengighet (kritisk kontroll: varierende slag endrer IKKE BBB-totaler)
// ---------------------------------------------------------------------------

describe('bingoBangoBongo.compute — slag-uavhengighet', () => {
  it('varierende gross-scores endrer ikke BBB-poeng eller ranking', () => {
    const players = ['u1', 'u2'].map(makePlayer);
    const holes = par4Holes(3);
    const bbbHoles: BingoBangoBongoHoleInput[] = [
      { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u1', bongoUserId: 'u2' },
      { holeNumber: 2, bingoUserId: 'u1', bangoUserId: 'u2', bongoUserId: 'u2' },
      { holeNumber: 3, bingoUserId: 'u2', bangoUserId: null, bongoUserId: 'u1' },
    ];
    // Første kontekst: u1 spiller veldig bra (lave slag)
    const ctxLowStrokes = makeCtx({
      players,
      holes,
      bingoBangoBongoHoles: bbbHoles,
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 1 },
        { userId: 'u1', holeNumber: 2, gross: 1 },
        { userId: 'u1', holeNumber: 3, gross: 1 },
        { userId: 'u2', holeNumber: 1, gross: 10 },
        { userId: 'u2', holeNumber: 2, gross: 10 },
        { userId: 'u2', holeNumber: 3, gross: 10 },
      ],
    });

    // Andre kontekst: u2 spiller veldig bra (lave slag)
    const ctxHighStrokes = makeCtx({
      players,
      holes,
      bingoBangoBongoHoles: bbbHoles,
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 10 },
        { userId: 'u1', holeNumber: 2, gross: 10 },
        { userId: 'u1', holeNumber: 3, gross: 10 },
        { userId: 'u2', holeNumber: 1, gross: 1 },
        { userId: 'u2', holeNumber: 2, gross: 1 },
        { userId: 'u2', holeNumber: 3, gross: 1 },
      ],
    });

    const r1 = compute(ctxLowStrokes);
    const r2 = compute(ctxHighStrokes);

    // BBB-poeng skal være identiske uavhengig av gross-scores
    const getStats = (result: typeof r1, userId: string) =>
      result.players.find((p) => p.userId === userId)!;

    expect(getStats(r1, 'u1').totalPoints).toBe(getStats(r2, 'u1').totalPoints);
    expect(getStats(r1, 'u2').totalPoints).toBe(getStats(r2, 'u2').totalPoints);
    expect(getStats(r1, 'u1').bingos).toBe(getStats(r2, 'u1').bingos);
    expect(getStats(r1, 'u2').bingos).toBe(getStats(r2, 'u2').bingos);
    expect(getStats(r1, 'u1').rank).toBe(getStats(r2, 'u1').rank);
    expect(getStats(r1, 'u2').rank).toBe(getStats(r2, 'u2').rank);
  });

  it('kontekst uten scores gir samme BBB-resultat som kontekst med scores', () => {
    const players = ['u1', 'u2', 'u3'].map(makePlayer);
    const holes = par4Holes(2);
    const bbbHoles: BingoBangoBongoHoleInput[] = [
      { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u2', bongoUserId: 'u3' },
      { holeNumber: 2, bingoUserId: 'u3', bangoUserId: 'u1', bongoUserId: 'u2' },
    ];

    const ctxNoScores = makeCtx({ players, holes, bingoBangoBongoHoles: bbbHoles });
    const ctxWithScores = makeCtx({
      players,
      holes,
      bingoBangoBongoHoles: bbbHoles,
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
        { userId: 'u3', holeNumber: 1, gross: 7 },
      ],
    });

    const r1 = compute(ctxNoScores);
    const r2 = compute(ctxWithScores);

    expect(r1.players.map((p) => p.userId)).toEqual(r2.players.map((p) => p.userId));
    expect(r1.players.map((p) => p.totalPoints)).toEqual(
      r2.players.map((p) => p.totalPoints),
    );
  });
});

// ---------------------------------------------------------------------------
// Hull-rad-innhold
// ---------------------------------------------------------------------------

describe('bingoBangoBongo.compute — hole-rows', () => {
  it('produserer én hull-rad per hull (18 hull)', () => {
    const ctx = makeCtx({
      players: ['u1', 'u2'].map(makePlayer),
      holes: par4Holes(18),
    });
    const result = compute(ctx);
    expect(result.holes).toHaveLength(18);
    for (let i = 1; i <= 18; i++) {
      expect(result.holes.find((h) => h.holeNumber === i)).toBeDefined();
    }
  });

  it('hull-rad reflekterer riktige user-id-er fra input', () => {
    const ctx = makeCtx({
      players: ['u1', 'u2'].map(makePlayer),
      holes: par4Holes(1),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u2', bongoUserId: null },
      ],
    });
    const result = compute(ctx);
    const row = result.holes[0];
    expect(row.bingoUserId).toBe('u1');
    expect(row.bangoUserId).toBe('u2');
    expect(row.bongoUserId).toBeNull();
    expect(row.pointsByPlayer['u1']).toBe(1);
    expect(row.pointsByPlayer['u2']).toBe(1);
  });
});

describe('bingoBangoBongo.compute — antalls-agnostisk over 4 spillere (#460)', () => {
  it('6 spillere: poeng fordeles på alle seks over fire hull', () => {
    const ctx = makeCtx({
      players: [
        makePlayer('u1'),
        makePlayer('u2'),
        makePlayer('u3'),
        makePlayer('u4'),
        makePlayer('u5'),
        makePlayer('u6'),
      ],
      holes: par4Holes(4),
      bingoBangoBongoHoles: [
        { holeNumber: 1, bingoUserId: 'u1', bangoUserId: 'u2', bongoUserId: 'u3' },
        { holeNumber: 2, bingoUserId: 'u4', bangoUserId: 'u5', bongoUserId: 'u6' },
        { holeNumber: 3, bingoUserId: 'u1', bangoUserId: 'u1', bongoUserId: 'u1' },
        { holeNumber: 4, bingoUserId: 'u6', bangoUserId: 'u6', bongoUserId: 'u6' },
      ],
    });
    const result = compute(ctx);

    expect(result.players).toHaveLength(6);
    const byId = Object.fromEntries(result.players.map((p) => [p.userId, p]));
    // u1: hull 1 bingo (1) + hull 3 sweep (3) = 4. u6: hull 2 bongo (1) + hull 4 sweep (3) = 4.
    expect(byId['u1'].totalPoints).toBe(4);
    expect(byId['u6'].totalPoints).toBe(4);
    // De midtre spillerne fikk ett poeng hver på hull 1-2.
    expect(byId['u2'].totalPoints).toBe(1);
    expect(byId['u3'].totalPoints).toBe(1);
    expect(byId['u4'].totalPoints).toBe(1);
    expect(byId['u5'].totalPoints).toBe(1);
    // Total = 4 hull × 3 poeng = 12.
    const total = result.players.reduce((sum, p) => sum + p.totalPoints, 0);
    expect(total).toBe(12);
  });
});

// Type A tests — pure logic, assertion-rich.
// Skriv FAILING tests FIRST, implementer i nines.ts til alle er grønne.

import { describe, it, expect } from 'vitest';
import { compute } from './nines';
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

function makePlayer(userId: string, courseHandicap = 0): ScoringPlayer {
  return {
    userId,
    teamNumber: null,
    flightNumber: null,
    courseHandicap,
  };
}

function makeCtx(opts: {
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
  ninesVariant?: 'nines' | 'split_sixes';
  ninesScoring?: 'gross' | 'net';
  /** Lar oss teste defensive fallback ved manglende field. */
  modeConfigOverride?: Record<string, unknown>;
}): ScoringContext {
  const modeConfig = opts.modeConfigOverride
    ? (opts.modeConfigOverride as never)
    : ({
        kind: 'nines',
        team_size: 1,
        nines_variant: opts.ninesVariant ?? 'nines',
        nines_scoring: opts.ninesScoring ?? 'net',
      } as never);
  return {
    game: {
      id: 'g1',
      game_mode: 'nines',
      mode_config: modeConfig,
    },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

function holeRow(result: ReturnType<typeof compute>, holeNumber: number) {
  return result.holes.find((h) => h.holeNumber === holeNumber)!;
}

function playerLine(result: ReturnType<typeof compute>, userId: string) {
  return result.players.find((p) => p.userId === userId)!;
}

// ---------------------------------------------------------------------------
// Case 1 — Discriminated shape
// ---------------------------------------------------------------------------

describe('nines.compute — discriminated shape', () => {
  it('returnerer kind=nines, variant=nines, scoring=net fra mode_config', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(18),
      scores: [],
      ninesVariant: 'nines',
      ninesScoring: 'net',
    });
    const result = compute(ctx);
    expect(result.kind).toBe('nines');
    expect(result.variant).toBe('nines');
    expect(result.scoring).toBe('net');
    expect(result.holes).toHaveLength(18);
    expect(result.players).toHaveLength(3);
  });

  it('returnerer variant=split_sixes og scoring=gross når mode_config sier det', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [],
      ninesVariant: 'split_sixes',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.variant).toBe('split_sixes');
    expect(result.scoring).toBe('gross');
  });
});

// ---------------------------------------------------------------------------
// Case 2 — Nines (5-3-1), tre ulike scores
// ---------------------------------------------------------------------------

describe('nines.compute — Nines 5-3-1 med tre ulike scores', () => {
  it('lavest 5, midt 3, høyest 1 (gross for enkelhet)', () => {
    // u1 gross 3 (lavest) → 5, u2 gross 4 (midt) → 3, u3 gross 5 (høyest) → 1
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.pending).toBe(false);
    expect(h1.pointsByPlayer['u1']).toBe(5);
    expect(h1.pointsByPlayer['u2']).toBe(3);
    expect(h1.pointsByPlayer['u3']).toBe(1);
    // Total = 9
    const total = Object.values(h1.pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total).toBe(9);
  });

  it('perPlayer i original ctx.players-rekkefølge', () => {
    // u3 lavest, u1 midt, u2 høyest — original rekkefølge u1, u2, u3 bevares
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
        { userId: 'u3', holeNumber: 1, gross: 3 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.perPlayer.map((p) => p.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(h1.pointsByPlayer['u3']).toBe(5);
    expect(h1.pointsByPlayer['u1']).toBe(3);
    expect(h1.pointsByPlayer['u2']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Case 3 — Split Sixes (4-2-0), tre ulike scores
// ---------------------------------------------------------------------------

describe('nines.compute — Split Sixes 4-2-0 med tre ulike scores', () => {
  it('lavest 4, midt 2, høyest 0 (gross)', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
      ],
      ninesVariant: 'split_sixes',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.pointsByPlayer['u1']).toBe(4);
    expect(h1.pointsByPlayer['u2']).toBe(2);
    expect(h1.pointsByPlayer['u3']).toBe(0);
    const total = Object.values(h1.pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Case 4 — Nines, to delt lavest (5+3)/2 = 4 hver, tredje 1
// ---------------------------------------------------------------------------

describe('nines.compute — Nines ties', () => {
  it('To delt lavest → (5+3)/2=4 hver, tredje 1', () => {
    // u1=3, u2=3 (delt lavest), u3=5 (høyest)
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 3 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.pointsByPlayer['u1']).toBe(4);
    expect(h1.pointsByPlayer['u2']).toBe(4);
    expect(h1.pointsByPlayer['u3']).toBe(1);
    const total = Object.values(h1.pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total).toBe(9);
  });

  // ---------------------------------------------------------------------------
  // Case 5 — Nines, to delt høyest: 5, (3+1)/2=2, (3+1)/2=2
  // ---------------------------------------------------------------------------

  it('To delt høyest → lavest 5, delt høyest (3+1)/2=2 hver', () => {
    // u1=3 (lavest), u2=5, u3=5 (delt høyest)
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.pointsByPlayer['u1']).toBe(5);
    expect(h1.pointsByPlayer['u2']).toBe(2);
    expect(h1.pointsByPlayer['u3']).toBe(2);
    const total = Object.values(h1.pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total).toBe(9);
  });

  // ---------------------------------------------------------------------------
  // Case 6 — Nines, alle tre like: (5+3+1)/3 = 3 hver
  // ---------------------------------------------------------------------------

  it('Alle tre like → (5+3+1)/3=3 hver', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 4 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.pointsByPlayer['u1']).toBe(3);
    expect(h1.pointsByPlayer['u2']).toBe(3);
    expect(h1.pointsByPlayer['u3']).toBe(3);
    const total = Object.values(h1.pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Case 7 — Split Sixes, to delt lavest: (4+2)/2=3 hver, høyest 0
// ---------------------------------------------------------------------------

describe('nines.compute — Split Sixes ties', () => {
  it('To delt lavest → (4+2)/2=3 hver, høyest 0', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 3 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
      ],
      ninesVariant: 'split_sixes',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.pointsByPlayer['u1']).toBe(3);
    expect(h1.pointsByPlayer['u2']).toBe(3);
    expect(h1.pointsByPlayer['u3']).toBe(0);
    const total = Object.values(h1.pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
  });

  // ---------------------------------------------------------------------------
  // Case 8 — Split Sixes, to delt høyest: lavest 4, delt (2+0)/2=1 hver
  // ---------------------------------------------------------------------------

  it('To delt høyest → lavest 4, delt (2+0)/2=1 hver', () => {
    // u1=3 (lavest), u2=5, u3=5 (delt høyest)
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
      ],
      ninesVariant: 'split_sixes',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.pointsByPlayer['u1']).toBe(4);
    expect(h1.pointsByPlayer['u2']).toBe(1);
    expect(h1.pointsByPlayer['u3']).toBe(1);
    const total = Object.values(h1.pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
  });

  // ---------------------------------------------------------------------------
  // Case 9 — Split Sixes, alle tre like: (4+2+0)/3 = 2 hver
  // ---------------------------------------------------------------------------

  it('Alle tre like → (4+2+0)/3=2 hver', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 4 },
      ],
      ninesVariant: 'split_sixes',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    expect(h1.pointsByPlayer['u1']).toBe(2);
    expect(h1.pointsByPlayer['u2']).toBe(2);
    expect(h1.pointsByPlayer['u3']).toBe(2);
    const total = Object.values(h1.pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Case 10 — Net vs gross: HCP-slag endrer rangering
// ---------------------------------------------------------------------------

describe('nines.compute — net vs gross', () => {
  it('Samme gross men ulik CH: net-ranking avviker fra gross-ranking', () => {
    // Hull 1 SI=1.
    // u1 CH=0, gross=4, netto=4
    // u2 CH=3, gross=5, netto=5-1=4 (1 slag på SI=1 av CH=3 → SI ≤ 3, stroke= floor(3/18)+extra=0+1=1) → netto 4
    //   ... faktisk: CH=3 → base=floor(3/18)=0, SI=1 ≤ (3 % 18)=3 → extra=1 → strokes=1 → netto=5-1=4
    // u3 CH=18, gross=5, netto=5-1=4 (CH=18, base=floor(18/18)=1, SI=1 ≤ 0 → extra=0 → strokes=1) → netto 4
    //   Actually: CH=18, base=floor(18/18)=1, (18%18)=0, SI=1 <= 0? No → extra=0 → strokes=1 → netto=5-1=4
    //
    // Enkler case: u1 CH=0 gross=5 → net=5; u2 CH=2 gross=5 → net=4 (SI=1 ≤ 2, strokes=1); u3 CH=0 gross=4 → net=4
    // Net: u2 netto=4, u3 netto=4 (delt), u1 netto=5 → u2 og u3 deler 5+3/2=4 hver, u1 får 1
    // Gross: u3 gross=4 (lavest) → 5, u1 og u2 gross=5 (delt) → (3+1)/2=2 hver
    const holes = [{ number: 1, par: 4, strokeIndex: 1 }];
    const scores = [
      { userId: 'u1', holeNumber: 1, gross: 5 },
      { userId: 'u2', holeNumber: 1, gross: 5 },
      { userId: 'u3', holeNumber: 1, gross: 4 },
    ];

    const netCtx = makeCtx({
      players: [makePlayer('u1', 0), makePlayer('u2', 2), makePlayer('u3', 0)],
      holes,
      scores,
      ninesVariant: 'nines',
      ninesScoring: 'net',
    });
    const netResult = compute(netCtx);
    // Net: u2 netto=4 (5-1), u3 netto=4, u1 netto=5 → u2+u3 delt lavest=(5+3)/2=4 each, u1=1
    expect(netResult.holes[0].pointsByPlayer['u1']).toBe(1);
    expect(netResult.holes[0].pointsByPlayer['u2']).toBe(4);
    expect(netResult.holes[0].pointsByPlayer['u3']).toBe(4);

    const grossCtx = makeCtx({
      players: [makePlayer('u1', 0), makePlayer('u2', 2), makePlayer('u3', 0)],
      holes,
      scores,
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const grossResult = compute(grossCtx);
    // Gross: u3=4 (lavest)→5; u1=5, u2=5 (delt høyest) → (3+1)/2=2 each
    expect(grossResult.holes[0].pointsByPlayer['u3']).toBe(5);
    expect(grossResult.holes[0].pointsByPlayer['u1']).toBe(2);
    expect(grossResult.holes[0].pointsByPlayer['u2']).toBe(2);
  });

  it('effectiveScore eksponert riktig i perPlayer (net)', () => {
    // SI=1, u1 CH=1 → strokes=1 på dette hullet (SI1 ≤ CH%18=1) → netto=gross-1
    const ctx = makeCtx({
      players: [makePlayer('u1', 1), makePlayer('u2', 0), makePlayer('u3', 0)],
      holes: [{ number: 1, par: 4, strokeIndex: 1 }],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 6 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'net',
    });
    const result = compute(ctx);
    const h1 = holeRow(result, 1);
    const u1cell = h1.perPlayer.find((p) => p.userId === 'u1')!;
    expect(u1cell.gross).toBe(5);
    expect(u1cell.effectiveScore).toBe(4); // 5 - 1 = 4
    const u2cell = h1.perPlayer.find((p) => p.userId === 'u2')!;
    expect(u2cell.effectiveScore).toBe(4); // no strokes
    // u1 netto 4, u2 netto 4 → delt lavest, u3 netto 6 → høyest
    // (5+3)/2=4 each for u1/u2, u3 gets 1
    expect(h1.pointsByPlayer['u1']).toBe(4);
    expect(h1.pointsByPlayer['u2']).toBe(4);
    expect(h1.pointsByPlayer['u3']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Case 11 — Pending hull
// ---------------------------------------------------------------------------

describe('nines.compute — pending hull', () => {
  it('Én spiller mangler gross → pending=true, alle 0, holesScored ekskluderer hullet', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(2),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
        // u3 mangler hull 1
        { userId: 'u1', holeNumber: 2, gross: 3 },
        { userId: 'u2', holeNumber: 2, gross: 4 },
        { userId: 'u3', holeNumber: 2, gross: 5 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);

    // Hull 1 pending
    const h1 = holeRow(result, 1);
    expect(h1.pending).toBe(true);
    expect(h1.pointsByPlayer['u1']).toBe(0);
    expect(h1.pointsByPlayer['u2']).toBe(0);
    expect(h1.pointsByPlayer['u3']).toBe(0);
    // perPlayer effectiveScore null for manglende score
    const u3cell = h1.perPlayer.find((p) => p.userId === 'u3')!;
    expect(u3cell.gross).toBeNull();
    expect(u3cell.effectiveScore).toBeNull();
    expect(u3cell.points).toBe(0);

    // Hull 2 IKKE pending — later fully-scored hull still awards points
    const h2 = holeRow(result, 2);
    expect(h2.pending).toBe(false);
    expect(h2.pointsByPlayer['u1']).toBe(5);
    expect(h2.pointsByPlayer['u2']).toBe(3);
    expect(h2.pointsByPlayer['u3']).toBe(1);
    const total2 = Object.values(h2.pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total2).toBe(9);

    // holesScored kun fra hull 2
    for (const p of result.players) {
      expect(p.holesScored).toBe(1);
    }
  });

  it('Pending fryser IKKE later hull (ingen carryover — Nines er uavhengig per hull)', () => {
    // Hull 1 pending (u3 mangler), hull 2 og 3 fully scored → begge gir poeng
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(3),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
        // u3 mangler hull 1
        { userId: 'u1', holeNumber: 2, gross: 3 },
        { userId: 'u2', holeNumber: 2, gross: 4 },
        { userId: 'u3', holeNumber: 2, gross: 5 },
        { userId: 'u1', holeNumber: 3, gross: 4 },
        { userId: 'u2', holeNumber: 3, gross: 4 },
        { userId: 'u3', holeNumber: 3, gross: 4 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    expect(holeRow(result, 1).pending).toBe(true);
    expect(holeRow(result, 2).pending).toBe(false);
    expect(holeRow(result, 3).pending).toBe(false);
    // Hull 3: alle likt → 3 each
    expect(holeRow(result, 3).pointsByPlayer['u1']).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Case 12 — Multi-hull akkumulering og ranking
// ---------------------------------------------------------------------------

describe('nines.compute — multi-hull akkumulering og ranking', () => {
  it('totalPoints summeres riktig; to like total → shared rank + tiedWith', () => {
    // 3 hull:
    // Hull 1: u1=3(5), u2=4(3), u3=5(1). u1 får 5, u2 3, u3 1.
    // Hull 2: u2=3(5), u1=4(3), u3=5(1). u2 får 5, u1 3, u3 1.
    // Hull 3: u3=3(5), u1=5(3+1)/2=2 delt, u2=5(3+1)/2=2 delt.
    //   u3=5, u1=2, u2=2
    //
    // Totaler: u1=5+3+2=10, u2=3+5+2=10, u3=1+1+5=7
    // u1 og u2 delt rank 1, u3 rank 3
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(3),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
        { userId: 'u2', holeNumber: 2, gross: 3 },
        { userId: 'u1', holeNumber: 2, gross: 4 },
        { userId: 'u3', holeNumber: 2, gross: 5 },
        { userId: 'u3', holeNumber: 3, gross: 3 },
        { userId: 'u1', holeNumber: 3, gross: 5 },
        { userId: 'u2', holeNumber: 3, gross: 5 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);

    const u1 = playerLine(result, 'u1');
    const u2 = playerLine(result, 'u2');
    const u3 = playerLine(result, 'u3');

    expect(u1.totalPoints).toBe(10);
    expect(u2.totalPoints).toBe(10);
    expect(u3.totalPoints).toBe(7);

    expect(u1.holesScored).toBe(3);
    expect(u2.holesScored).toBe(3);
    expect(u3.holesScored).toBe(3);

    // Shared rank
    expect(u1.rank).toBe(1);
    expect(u2.rank).toBe(1);
    expect(u3.rank).toBe(3); // 3rd place since 2 players tied before

    // tiedWith
    expect(u1.tiedWith).toContain('u2');
    expect(u1.tiedWith).not.toContain('u3');
    expect(u2.tiedWith).toContain('u1');
    expect(u2.tiedWith).not.toContain('u3');
    expect(u3.tiedWith).toHaveLength(0);
  });

  it('players-array sortert totalPoints DESC', () => {
    // u3 toppscore
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u2', holeNumber: 1, gross: 6 },
        { userId: 'u3', holeNumber: 1, gross: 3 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.players[0].userId).toBe('u3');
    expect(result.players[0].totalPoints).toBe(5);
    expect(result.players[0].rank).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Case 13 — Ingen scores
// ---------------------------------------------------------------------------

describe('nines.compute — ingen scores', () => {
  it('Alle totalPoints 0, holesScored 0, alle rank 1, tiedWith lister de andre', () => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(18),
      scores: [],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    for (const p of result.players) {
      expect(p.totalPoints).toBe(0);
      expect(p.holesScored).toBe(0);
      expect(p.rank).toBe(1);
      expect(p.tiedWith).toHaveLength(2); // tied with the other 2
    }
    // Alle hull pending
    for (const h of result.holes) {
      expect(h.pending).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Case 14 — Defensive defaults: mangler nines_variant/nines_scoring → nines + net
// ---------------------------------------------------------------------------

describe('nines.compute — defensive defaults', () => {
  it('Mangler nines_variant og nines_scoring → defaults til nines + net', () => {
    // u1 CH=1 på SI=1. Gross 5 for alle. Net: u1=4, u2=5, u3=5 → u1 lavest=5, u2+u3 delt=(3+1)/2=2
    const ctx = makeCtx({
      players: [makePlayer('u1', 1), makePlayer('u2', 0), makePlayer('u3', 0)],
      holes: [{ number: 1, par: 4, strokeIndex: 1 }],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
      ],
      modeConfigOverride: { kind: 'nines', team_size: 1 }, // mangler nines_variant og nines_scoring
    });
    const result = compute(ctx);
    // Variant default: 'nines' (pot [5,3,1])
    expect(result.variant).toBe('nines');
    // Scoring default: 'net'
    expect(result.scoring).toBe('net');
    // u1 netto=4 (lavest), u2 netto=5, u3 netto=5 → u1=5, u2+u3 delt=(3+1)/2=2
    expect(result.holes[0].pointsByPlayer['u1']).toBe(5);
    expect(result.holes[0].pointsByPlayer['u2']).toBe(2);
    expect(result.holes[0].pointsByPlayer['u3']).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Pot-sum invariant: fullt spilt hull summerer til pot-total
// ---------------------------------------------------------------------------

describe('nines.compute — pot sum invariant', () => {
  it.each([
    { variant: 'nines' as const, expectedPot: 9 },
    { variant: 'split_sixes' as const, expectedPot: 6 },
  ])('$variant: sum av pointsByPlayer = $expectedPot på fullt hull', ({ variant, expectedPot }) => {
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
      ],
      ninesVariant: variant,
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const total = Object.values(result.holes[0].pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total).toBe(expectedPot);
  });

  it('Tie-split: delt hull summerer fortsatt til pot-total', () => {
    // Alle tre likt → 3+3+3=9
    const ctx = makeCtx({
      players: [makePlayer('u1'), makePlayer('u2'), makePlayer('u3')],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 4 },
      ],
      ninesVariant: 'nines',
      ninesScoring: 'gross',
    });
    const result = compute(ctx);
    const total = Object.values(result.holes[0].pointsByPlayer).reduce((a, b) => a + b, 0);
    expect(total).toBe(9);
  });
});

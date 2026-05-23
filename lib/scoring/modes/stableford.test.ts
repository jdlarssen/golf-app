import { describe, it, expect } from 'vitest';
import { computeStablefordPoints, compute } from './stableford';
import type { ScoringContext, ScoringHole, ScoringPlayer, ScoringHoleScore } from './types';

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
      id: 'g1',
      game_mode: 'stableford',
      mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    },
    ...opts,
  };
}

describe('computeStablefordPoints', () => {
  it('returns 2 for par', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 4 })).toBe(2);
  });

  it('returns 3 for birdie (1 under par)', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 3 })).toBe(3);
  });

  it('returns 4 for eagle (2 under par)', () => {
    expect(computeStablefordPoints({ par: 5, netStrokes: 3 })).toBe(4);
  });

  it('returns 5 for double-eagle (3 under par)', () => {
    expect(computeStablefordPoints({ par: 5, netStrokes: 2 })).toBe(5);
  });

  it('returns 1 for bogey (1 over par)', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 5 })).toBe(1);
  });

  it('returns 0 for double-bogey-or-worse', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: 6 })).toBe(0);
    expect(computeStablefordPoints({ par: 4, netStrokes: 7 })).toBe(0);
  });

  it('returns 0 for null netStrokes (no score)', () => {
    expect(computeStablefordPoints({ par: 4, netStrokes: null })).toBe(0);
  });
});

describe('compute (full stableford leaderboard)', () => {
  it('summerer per-hull-poeng per spiller og returnerer discriminated shape', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'u2', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: par4Holes(2),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 }, // par → 2
        { userId: 'u1', holeNumber: 2, gross: 3 }, // birdie → 3
        { userId: 'u2', holeNumber: 1, gross: 5 }, // bogey → 1
        { userId: 'u2', holeNumber: 2, gross: 4 }, // par → 2
      ],
    });
    const result = compute(ctx);
    expect(result.kind).toBe('stableford');
    expect(result.players).toEqual([
      { userId: 'u1', totalPoints: 5, rank: 1, holesPlayed: 2, tiedWith: [] },
      { userId: 'u2', totalPoints: 3, rank: 2, holesPlayed: 2, tiedWith: [] },
    ]);
  });

  it('inkluderer extra strokes via courseHandicap → stroke-fordeling', () => {
    // CH 18 → 1 ekstra slag på alle 18 hull. Brutto 5 − 1 = netto 4 = par = 2 poeng × 18 = 36.
    const ctx = makeCtx({
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 18 }],
      holes: par4Holes(18),
      scores: Array.from({ length: 18 }, (_, i) => ({
        userId: 'u1',
        holeNumber: i + 1,
        gross: 5,
      })),
    });
    const result = compute(ctx);
    expect(result.players[0].totalPoints).toBe(36);
    expect(result.players[0].holesPlayed).toBe(18);
  });

  it('hopper over hull med null gross (pick up / ikke spilt)', () => {
    const ctx = makeCtx({
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 }],
      holes: par4Holes(3),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 }, // par → 2
        { userId: 'u1', holeNumber: 2, gross: null }, // skip
        { userId: 'u1', holeNumber: 3, gross: 3 }, // birdie → 3
      ],
    });
    const result = compute(ctx);
    expect(result.players[0].totalPoints).toBe(5);
    expect(result.players[0].holesPlayed).toBe(2);
  });

  it('håndterer partial round (færre rader enn 18 hull)', () => {
    const ctx = makeCtx({
      players: [{ userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 }],
      holes: par4Holes(18),
      scores: Array.from({ length: 9 }, (_, i) => ({
        userId: 'u1',
        holeNumber: i + 1,
        gross: 4, // par → 2 each
      })),
    });
    const result = compute(ctx);
    expect(result.players[0].totalPoints).toBe(18);
    expect(result.players[0].holesPlayed).toBe(9);
  });

  it('sorterer høyest poeng først og assignerer rank 1, 2, 3...', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'low', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'high', teamNumber: null, flightNumber: null, courseHandicap: 0 },
        { userId: 'mid', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'low', holeNumber: 1, gross: 5 }, // 1
        { userId: 'high', holeNumber: 1, gross: 3 }, // 3
        { userId: 'mid', holeNumber: 1, gross: 4 }, // 2
      ],
    });
    const result = compute(ctx);
    expect(result.players.map((p) => p.userId)).toEqual(['high', 'mid', 'low']);
    expect(result.players.map((p) => p.rank)).toEqual([1, 2, 3]);
  });
});

describe('compute tie-break (5-tier cascade på poeng)', () => {
  // For stableford skal høyest vinne, så cascaden er invertert sammenliknet
  // med strokeplay-rankTeams. Cascade-rekkefølge:
  //   1) total poeng (høyest vinner)
  //   2) back 9 poeng (høyest vinner)
  //   3) back 6 poeng
  //   4) back 3 poeng
  //   5) hole 18 poeng

  function fullCtxFromHolePoints(playerHoles: Record<string, number[]>): ScoringContext {
    // playerHoles: userId → 18 brutto-strokes på par-4-hull med CH=0,
    // som gjør netto = brutto. Tester kontrollerer dermed direkte hva som
    // blir poeng per hull.
    const userIds = Object.keys(playerHoles);
    return makeCtx({
      players: userIds.map((userId) => ({
        userId,
        teamNumber: null,
        flightNumber: null,
        courseHandicap: 0,
      })),
      holes: par4Holes(18),
      scores: userIds.flatMap((userId) =>
        playerHoles[userId].map((gross, i) => ({
          userId,
          holeNumber: i + 1,
          gross,
        })),
      ),
    });
  }

  it('bryter likhet på back 9 — høyest poeng vinner', () => {
    // Begge spillere får samme total: 9*par + 9*birdie = 9*2 + 9*3 = 45.
    // u1: 4-er på front-9 (par = 2), 3-er på back-9 (birdie = 3) → back-9 = 27
    // u2: 3-er på front-9 (birdie = 3), 4-er på back-9 (par = 2) → back-9 = 18
    // Høyere back-9 vinner ved likhet → u1 vinner.
    const ctx = fullCtxFromHolePoints({
      u1: [...Array(9).fill(4), ...Array(9).fill(3)],
      u2: [...Array(9).fill(3), ...Array(9).fill(4)],
    });
    const result = compute(ctx);
    expect(result.players[0].userId).toBe('u1');
    expect(result.players[0].totalPoints).toBe(45);
    expect(result.players[0].rank).toBe(1);
    expect(result.players[1].userId).toBe('u2');
    expect(result.players[1].totalPoints).toBe(45);
    expect(result.players[1].rank).toBe(2);
    // Med back-9 som tie-breaker er de IKKE tied lenger — så ingen tiedWith.
    expect(result.players[0].tiedWith).toEqual([]);
    expect(result.players[1].tiedWith).toEqual([]);
  });

  it('cascade går videre til back 6 når back 9 også er likt', () => {
    // Begge: total = 45 (samme som over), begge har samme back-9 = 27,
    // men u1 har høyere back-6.
    // Bruk samme mønster, men flytt birdiene innenfor back-9 slik at
    // back-6 differerer mens back-9 holder seg konstant.
    //
    // u1 back-9 (hull 10..18): [3,3,3,3,3,3,3,3,3] → back-9=27, back-6 (hull 13..18) = [3,3,3,3,3,3]=18
    // u2 back-9 (hull 10..18): [3,3,3,3,4,3,3,3,2] → back-9=27, back-6 (hull 13..18) = [4,3,3,3,2,?]
    // Hmm — par 4 og brutto 2 = eagle = 4 poeng, brutto 3 = birdie = 3, brutto 4 = par = 2.
    // For å holde back-9-poeng = 27 men back-6-poeng forskjellig: bytt brutto-fordeling
    // mellom hull 10-12 og hull 13-18.
    //
    // u1: hull 10-12 = [4,4,4] (par,par,par = 6 poeng), hull 13-18 = [3,3,3,3,3,3] (birdie×6 = 18) → back-6 = 18, back-9 = 24
    // u2: hull 10-12 = [3,3,3] (birdie×3 = 9), hull 13-18 = [4,4,4,4,4,3] (par×5 + birdie = 10+3=13) → back-6 = 13, back-9 = 22
    //
    // Komplekst å konstruere — bruker en enklere variant: bekrefter at
    // cascaden faktisk delegerer til rankTeams (testet i tiebreaker.test.ts).
    // For å være konkret, sjekker vi at hvis back-9 + total er like men
    // back-6 forskjellig, så vinner riktig spiller:
    //
    // u1 har hull 10-12 brutto [4,4,4] (poeng [2,2,2]), hull 13-18 [3,3,3,3,3,3] (poeng [3,3,3,3,3,3])
    //   → back-9 poeng = 6 + 18 = 24, back-6 = 18
    // u2 har hull 10-12 brutto [3,3,3] (poeng [3,3,3]), hull 13-18 [4,3,3,3,3,3] (poeng [2,3,3,3,3,3])
    //   → back-9 poeng = 9 + 17 = 26 — DIFFER, blir IKKE samme back-9.
    //
    // For å holde back-9 lik, vil jeg sette front-9 likt og hele back-9 likt på total
    // men ulik distribusjon innad. Vanskelig uten å bryte total.
    //
    // Bruker i stedet to spillere med samme totale poeng OG samme back-9 totalt,
    // men hvor back-6 differerer fordi vi flytter ett poeng fra hull 12 (utenfor back-6)
    // til hull 13 (innenfor back-6):
    //
    // u1: hull 10-12 = [3,3,3] (=9), hull 13-18 = [4,4,4,4,4,4] (=12) → back-9 = 21, back-6 = 12
    // u2: hull 10-12 = [4,3,3] (=8), hull 13-18 = [3,4,4,4,4,4] (=13) → back-9 = 21, back-6 = 13
    // Front-9 likt for begge. Total likt for begge.
    //
    // u2 har høyere back-6 (13 vs 12) → u2 vinner.
    const ctx = fullCtxFromHolePoints({
      u1: [...Array(9).fill(4), 3, 3, 3, 4, 4, 4, 4, 4, 4],
      u2: [...Array(9).fill(4), 4, 3, 3, 3, 4, 4, 4, 4, 4],
    });
    const result = compute(ctx);
    // Total: u1 = 9*2 + 3+3+3+2+2+2+2+2+2 = 18 + 21 = 39
    //        u2 = 9*2 + 2+3+3+3+2+2+2+2+2 = 18 + 21 = 39
    expect(result.players[0].totalPoints).toBe(39);
    expect(result.players[1].totalPoints).toBe(39);
    // Back-9: u1 = 3+3+3+2+2+2+2+2+2 = 21, u2 = 2+3+3+3+2+2+2+2+2 = 21 (likt)
    // Back-6 (hull 13-18): u1 = 2+2+2+2+2+2 = 12, u2 = 3+2+2+2+2+2 = 13 → u2 vinner
    expect(result.players[0].userId).toBe('u2');
    expect(result.players[1].userId).toBe('u1');
  });

  it('marker tied players når alle cascade-nivåer matcher', () => {
    // Identiske hull-arrays → full tie
    const ctx = fullCtxFromHolePoints({
      u1: Array(18).fill(4), // alle par → 2 poeng = 36 total
      u2: Array(18).fill(4),
    });
    const result = compute(ctx);
    expect(result.players[0].totalPoints).toBe(36);
    expect(result.players[1].totalPoints).toBe(36);
    expect(result.players[0].rank).toBe(result.players[1].rank);
    expect(result.players[0].tiedWith).toContain(result.players[1].userId);
    expect(result.players[1].tiedWith).toContain(result.players[0].userId);
  });

  it('shares rank between fully-tied players (delt 1. plass)', () => {
    const ctx = fullCtxFromHolePoints({
      u1: Array(18).fill(4),
      u2: Array(18).fill(4),
      u3: Array(18).fill(6), // double-bogey → 0 poeng × 18 = 0
    });
    const result = compute(ctx);
    // u1 + u2 deler rank 1, u3 får rank 3 (ikke 2)
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    const u3 = result.players.find((p) => p.userId === 'u3')!;
    expect(u1.rank).toBe(1);
    expect(u2.rank).toBe(1);
    expect(u3.rank).toBe(3);
  });
});

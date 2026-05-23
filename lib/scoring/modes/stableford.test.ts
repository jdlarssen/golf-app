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

describe('compute (full stableford leaderboard, solo)', () => {
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
    expect(result.variant).toBe('solo');
    if (result.variant !== 'solo') throw new Error('expected solo');
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
    if (result.variant !== 'solo') throw new Error('expected solo');
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
    if (result.variant !== 'solo') throw new Error('expected solo');
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
    if (result.variant !== 'solo') throw new Error('expected solo');
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
    if (result.variant !== 'solo') throw new Error('expected solo');
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
    if (result.variant !== 'solo') throw new Error('expected solo');
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
    if (result.variant !== 'solo') throw new Error('expected solo');
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
    if (result.variant !== 'solo') throw new Error('expected solo');
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
    if (result.variant !== 'solo') throw new Error('expected solo');
    // u1 + u2 deler rank 1, u3 får rank 3 (ikke 2)
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    const u3 = result.players.find((p) => p.userId === 'u3')!;
    expect(u1.rank).toBe(1);
    expect(u2.rank).toBe(1);
    expect(u3.rank).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Team-stableford / par-stableford (4BBB).
//
// Hver spiller spiller egen ball og fører eget stableford-kort. For hvert
// hull tar laget MAX av partnernes individuelle poeng (ikke sum), og lag-
// totalen er summen av hull-poengene. Ranking: høyest vinner, med 5-tier
// tie-break-cascade på lag-poeng-arrays.
// ---------------------------------------------------------------------------

function makeTeamCtx(opts: {
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
}): ScoringContext {
  return {
    game: {
      id: 'g1',
      game_mode: 'stableford',
      mode_config: { kind: 'stableford', team_size: 2, points_table: 'standard' },
    },
    ...opts,
  };
}

describe('compute (team stableford, par/4BBB)', () => {
  it('returnerer discriminated team-shape med variant: "team"', () => {
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 }, // par → 2 poeng
        { userId: 'u2', holeNumber: 1, gross: 5 }, // bogey → 1 poeng
      ],
    });
    const result = compute(ctx);
    expect(result.kind).toBe('stableford');
    expect(result.variant).toBe('team');
  });

  it('lag-hull-poeng = MAX av partnernes individuelle stableford-poeng', () => {
    // Lag 1: u1=par (2 poeng), u2=bogey (1 poeng) → MAX = 2
    // Lag 2: u3=bogey (1), u4=birdie (3) → MAX = 3
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u3', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
        { userId: 'u4', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
        { userId: 'u4', holeNumber: 1, gross: 3 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const team1 = result.teams.find((t) => t.teamNumber === 1)!;
    const team2 = result.teams.find((t) => t.teamNumber === 2)!;
    expect(team1.holes[0].teamPoints).toBe(2);
    expect(team2.holes[0].teamPoints).toBe(3);
  });

  it('contributorIds peker på spilleren(e) med MAX-poeng på hullet', () => {
    // Lag 1, hull 1: u1=birdie (3), u2=par (2) → MAX=3, contributor=[u1]
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const row = result.teams[0].holes[0];
    expect(row.teamPoints).toBe(3);
    expect(row.contributorIds).toEqual(['u1']);
  });

  it('contributorIds inneholder begge spillerne ved tie på MAX', () => {
    // Lag 1, hull 1: begge par → begge 2 poeng → contributor=[u1, u2]
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const row = result.teams[0].holes[0];
    expect(row.teamPoints).toBe(2);
    expect(new Set(row.contributorIds)).toEqual(new Set(['u1', 'u2']));
  });

  it('contributorIds er tom når begge spillere har 0 poeng (ingen reell "best ball")', () => {
    // Begge double-bogey eller verre → 0 poeng → ingen contributor.
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 7 },
        { userId: 'u2', holeNumber: 1, gross: 8 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const row = result.teams[0].holes[0];
    expect(row.teamPoints).toBe(0);
    expect(row.contributorIds).toEqual([]);
    expect(row.players.every((pc) => !pc.isContributor)).toBe(true);
  });

  it('per-spiller-cellene inneholder gross, netStrokes og points', () => {
    // CH 0 → netStrokes = gross. Hull 1, par 4, brutto 3 (birdie) → netto 3, 3 poeng.
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 3 },
        { userId: 'u2', holeNumber: 1, gross: null },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const row = result.teams[0].holes[0];
    const u1Cell = row.players.find((pc) => pc.userId === 'u1')!;
    const u2Cell = row.players.find((pc) => pc.userId === 'u2')!;
    expect(u1Cell.gross).toBe(3);
    expect(u1Cell.netStrokes).toBe(3);
    expect(u1Cell.points).toBe(3);
    expect(u1Cell.isContributor).toBe(true);
    expect(u2Cell.gross).toBeNull();
    expect(u2Cell.netStrokes).toBeNull();
    expect(u2Cell.points).toBe(0);
    expect(u2Cell.isContributor).toBe(false);
  });

  it('per-spiller-cellene tar høyde for courseHandicap (extra strokes)', () => {
    // u1 CH 18 → 1 ekstra slag på alle hull. Hull 1, par 4, brutto 5 → netto 4 → 2 poeng.
    // u2 CH 0  → brutto 5 → netto 5 → bogey → 1 poeng.
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 18 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const row = result.teams[0].holes[0];
    const u1 = row.players.find((p) => p.userId === 'u1')!;
    const u2 = row.players.find((p) => p.userId === 'u2')!;
    expect(u1.netStrokes).toBe(4);
    expect(u1.points).toBe(2);
    expect(u2.netStrokes).toBe(5);
    expect(u2.points).toBe(1);
    expect(row.teamPoints).toBe(2);
    expect(row.contributorIds).toEqual(['u1']);
  });

  it('lag-totalen er sum av per-hull lag-poeng', () => {
    // Hull 1: u1=par (2), u2=birdie (3) → max=3
    // Hull 2: u1=bogey (1), u2=par (2) → max=2
    // Hull 3: u1=double-bogey (0), u2=birdie (3) → max=3
    // Lag-total = 3 + 2 + 3 = 8
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(3),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 3 },
        { userId: 'u1', holeNumber: 2, gross: 5 },
        { userId: 'u2', holeNumber: 2, gross: 4 },
        { userId: 'u1', holeNumber: 3, gross: 6 },
        { userId: 'u2', holeNumber: 3, gross: 3 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    expect(result.teams[0].totalPoints).toBe(8);
  });

  it('sorterer lag med høyest total øverst (rank 1)', () => {
    // Lag 1: begge par × 18 = 18 + 18 = sum av maks = 18*2 = 36 (men maks per hull = 2)
    //        → lag-total = 18*2 = 36
    // Lag 2: u3 par × 18, u4 bogey × 18 → max per hull = 2 → lag-total = 36
    // Lag 3: u5 birdie × 18, u6 par × 18 → max per hull = 3 → lag-total = 54
    // Lag 3 vinner.
    const players: ScoringPlayer[] = [
      { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'u3', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'u4', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'u5', teamNumber: 3, flightNumber: 3, courseHandicap: 0 },
      { userId: 'u6', teamNumber: 3, flightNumber: 3, courseHandicap: 0 },
    ];
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push({ userId: 'u1', holeNumber: h, gross: 4 });
      scores.push({ userId: 'u2', holeNumber: h, gross: 4 });
      scores.push({ userId: 'u3', holeNumber: h, gross: 4 });
      scores.push({ userId: 'u4', holeNumber: h, gross: 5 });
      scores.push({ userId: 'u5', holeNumber: h, gross: 3 });
      scores.push({ userId: 'u6', holeNumber: h, gross: 4 });
    }
    const ctx = makeTeamCtx({ players, holes: par4Holes(18), scores });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const sortedByRank = [...result.teams].sort((a, b) => a.rank - b.rank);
    expect(sortedByRank[0].teamNumber).toBe(3); // birdie-team vinner
    expect(sortedByRank[0].totalPoints).toBe(54);
    expect(sortedByRank[0].rank).toBe(1);
  });

  it('hopper over spillere uten teamNumber (defensiv mot dårlige data)', () => {
    // u3 har teamNumber=null → blir hoppet over. Kun lag 1 i resultatet.
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u3', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
        { userId: 'u3', holeNumber: 1, gross: 3 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].teamNumber).toBe(1);
    expect(result.teams[0].playerIds).toEqual(['u1', 'u2']);
  });

  it('lag uten registrerte scores får totalPoints 0 og rank fra cascade', () => {
    // Lag 1 har scores, lag 2 har ingen → lag 1 vinner.
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u3', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
        { userId: 'u4', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const team1 = result.teams.find((t) => t.teamNumber === 1)!;
    const team2 = result.teams.find((t) => t.teamNumber === 2)!;
    expect(team1.totalPoints).toBe(2);
    expect(team1.rank).toBe(1);
    expect(team2.totalPoints).toBe(0);
    expect(team2.rank).toBe(2);
  });

  it('tie-break-cascade: lik total → back-9 høyest vinner', () => {
    // Lag 1: front-9 par × 9 (1 poeng-max per hull, sum 9), back-9 birdie × 9 (3 poeng-max, sum 27)
    //        → total 36, back-9 = 27
    // Lag 2: front-9 birdie × 9 (3 poeng, sum 27), back-9 par × 9 (1 poeng, sum 9)
    //        → total 36, back-9 = 9
    // For å holde maks per hull til ett poeng kan vi gi begge spillere samme score
    // (de spiller jo egne kort, MAX-en blir fra to like).
    const players: ScoringPlayer[] = [
      { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'u3', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'u4', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 9; h++) {
      // Front-9: lag 1 par (2 poeng max), lag 2 birdie (3 poeng max)
      scores.push({ userId: 'u1', holeNumber: h, gross: 4 });
      scores.push({ userId: 'u2', holeNumber: h, gross: 4 });
      scores.push({ userId: 'u3', holeNumber: h, gross: 3 });
      scores.push({ userId: 'u4', holeNumber: h, gross: 3 });
    }
    for (let h = 10; h <= 18; h++) {
      // Back-9: lag 1 birdie (3), lag 2 par (2)
      scores.push({ userId: 'u1', holeNumber: h, gross: 3 });
      scores.push({ userId: 'u2', holeNumber: h, gross: 3 });
      scores.push({ userId: 'u3', holeNumber: h, gross: 4 });
      scores.push({ userId: 'u4', holeNumber: h, gross: 4 });
    }
    const ctx = makeTeamCtx({ players, holes: par4Holes(18), scores });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    // Begge totalt = 2*9 + 3*9 = 18 + 27 = 45.
    // Lag 1 back-9 = 27, lag 2 back-9 = 18. Lag 1 vinner.
    const team1 = result.teams.find((t) => t.teamNumber === 1)!;
    const team2 = result.teams.find((t) => t.teamNumber === 2)!;
    expect(team1.totalPoints).toBe(45);
    expect(team2.totalPoints).toBe(45);
    expect(team1.rank).toBe(1);
    expect(team2.rank).toBe(2);
    // Ikke lenger tied siden back-9 brøt likheten.
    expect(team1.tiedWith).toEqual([]);
    expect(team2.tiedWith).toEqual([]);
  });

  it('full tie → lag deler rank og oppfører hverandre i tiedWith', () => {
    // Begge lag identiske scores → samme total, back-9, back-6, back-3 og hole-18.
    const players: ScoringPlayer[] = [
      { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'u3', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'u4', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      for (const uid of ['u1', 'u2', 'u3', 'u4']) {
        scores.push({ userId: uid, holeNumber: h, gross: 4 });
      }
    }
    const ctx = makeTeamCtx({ players, holes: par4Holes(18), scores });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    const team1 = result.teams.find((t) => t.teamNumber === 1)!;
    const team2 = result.teams.find((t) => t.teamNumber === 2)!;
    expect(team1.totalPoints).toBe(36);
    expect(team2.totalPoints).toBe(36);
    expect(team1.rank).toBe(team2.rank);
    expect(team1.tiedWith).toContain(2);
    expect(team2.tiedWith).toContain(1);
  });

  it('inneholder par + strokeIndex per hull-rad (for UI-rendering)', () => {
    const ctx = makeTeamCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: [
        { number: 1, par: 5, strokeIndex: 7 },
        { number: 2, par: 3, strokeIndex: 17 },
      ],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u2', holeNumber: 1, gross: 6 },
        { userId: 'u1', holeNumber: 2, gross: 3 },
        { userId: 'u2', holeNumber: 2, gross: 4 },
      ],
    });
    const result = compute(ctx);
    if (result.variant !== 'team') throw new Error('expected team');
    expect(result.teams[0].holes[0]).toMatchObject({
      holeNumber: 1,
      par: 5,
      strokeIndex: 7,
    });
    expect(result.teams[0].holes[1]).toMatchObject({
      holeNumber: 2,
      par: 3,
      strokeIndex: 17,
    });
  });
});

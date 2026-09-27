import { describe, it, expect } from 'vitest';
import { compute } from './soloStrokeplay';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
  ScoringGender,
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
      id: 'g1',
      game_mode: 'solo_strokeplay',
      mode_config: { kind: 'solo_strokeplay', team_size: 1 },
    },
    ...opts,
  };
}

describe('soloStrokeplay.compute — basic ranking', () => {
  it('returnerer discriminated shape med kind=solo_strokeplay', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [{ userId: 'u1', holeNumber: 1, gross: 4 }],
    });
    const result = compute(ctx);
    expect(result.kind).toBe('solo_strokeplay');
  });

  it('summerer netto-slag per spiller, lavest vinner', () => {
    // CH 0 → netto = gross. u1 alle par (4), u2 alle bogey (5), u3 alle birdie (3).
    // Total: u1=72, u2=90, u3=54. u3 vinner.
    const players: ScoringPlayer[] = ['u1', 'u2', 'u3'].map((id) => ({
      userId: id,
      teamNumber: null,
      flightNumber: null,
      courseHandicap: 0,
    }));
    const grossByUser: Record<string, number> = { u1: 4, u2: 5, u3: 3 };
    const scores: ScoringHoleScore[] = [];
    for (const uid of ['u1', 'u2', 'u3']) {
      for (let h = 1; h <= 18; h++) {
        scores.push({
          userId: uid,
          holeNumber: h,
          gross: grossByUser[uid],
        });
      }
    }
    const ctx = makeCtx({ players, holes: par4Holes(18), scores });
    const result = compute(ctx);
    expect(result.players.map((p) => p.userId)).toEqual(['u3', 'u1', 'u2']);
    expect(result.players[0].totalNetStrokes).toBe(54);
    expect(result.players[0].totalGrossStrokes).toBe(54);
    expect(result.players[1].totalNetStrokes).toBe(72);
    expect(result.players[2].totalNetStrokes).toBe(90);
    expect(result.players.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it('inkluderer extra strokes via courseHandicap → netto = gross − extra', () => {
    // CH 18 → 1 ekstra slag på alle 18 hull.
    // u1 brutto 5 på alle hull → netto 4 × 18 = 72 (sum-netto).
    // Gross-total er fortsatt 5 × 18 = 90.
    const ctx = makeCtx({
      players: [
        {
          userId: 'u1',
          teamNumber: null,
          flightNumber: null,
          courseHandicap: 18,
        },
      ],
      holes: par4Holes(18),
      scores: Array.from({ length: 18 }, (_, i) => ({
        userId: 'u1',
        holeNumber: i + 1,
        gross: 5,
      })),
    });
    const result = compute(ctx);
    expect(result.players[0].totalNetStrokes).toBe(72);
    expect(result.players[0].totalGrossStrokes).toBe(90);
    expect(result.players[0].holesPlayed).toBe(18);
    expect(result.players[0].rank).toBe(1);
  });

  it('hopper over hull med null gross fra total (pick up / ikke spilt)', () => {
    // 3 hull, ett uten gross. Total skal bare summere de spilte hullene.
    const ctx = makeCtx({
      players: [
        {
          userId: 'u1',
          teamNumber: null,
          flightNumber: null,
          courseHandicap: 0,
        },
      ],
      holes: par4Holes(3),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 },
        { userId: 'u1', holeNumber: 2, gross: null }, // skip
        { userId: 'u1', holeNumber: 3, gross: 5 },
      ],
    });
    const result = compute(ctx);
    expect(result.players[0].totalNetStrokes).toBe(9);
    expect(result.players[0].totalGrossStrokes).toBe(9);
    expect(result.players[0].holesPlayed).toBe(2);
  });

  it('solo med 1 spiller → rank=1, ingen tied', () => {
    const ctx = makeCtx({
      players: [
        {
          userId: 'u1',
          teamNumber: null,
          flightNumber: null,
          courseHandicap: 0,
        },
      ],
      holes: par4Holes(1),
      scores: [{ userId: 'u1', holeNumber: 1, gross: 4 }],
    });
    const result = compute(ctx);
    expect(result.players[0].rank).toBe(1);
    expect(result.players[0].tiedWith).toEqual([]);
  });

  it('ingen scores → alle har totalNetStrokes=0, holesPlayed=0', () => {
    // Hver spiller har kun padding-verdier (UNPLAYED_PADDING) i ranking-arrayet.
    // Totalsumen er 0, holesPlayed er 0. Spillere er fullstendig tied.
    const ctx = makeCtx({
      players: ['u1', 'u2'].map((id) => ({
        userId: id,
        teamNumber: null,
        flightNumber: null,
        courseHandicap: 0,
      })),
      holes: par4Holes(18),
      scores: [],
    });
    const result = compute(ctx);
    expect(result.players).toHaveLength(2);
    for (const p of result.players) {
      expect(p.totalNetStrokes).toBe(0);
      expect(p.totalGrossStrokes).toBe(0);
      expect(p.holesPlayed).toBe(0);
    }
    // Full tie → samme rank, tiedWith populated.
    expect(result.players[0].rank).toBe(result.players[1].rank);
    expect(result.players[0].tiedWith).toContain('u2');
    expect(result.players[1].tiedWith).toContain('u1');
  });
});

describe('soloStrokeplay.compute — tie-break cascade', () => {
  // For solo strokeplay skal LAVEST vinne, så cascaden er IKKE invertert
  // (motsatt av stableford). rankTeams er "lavest vinner" by default.
  // Cascade-rekkefølge:
  //   1) total netto-slag (lavest vinner)
  //   2) back-9 netto-slag (lavest)
  //   3) back-6 netto-slag
  //   4) back-3 netto-slag
  //   5) hole-18 netto-slag

  function fullCtxFromHoleStrokes(
    playerHoles: Record<string, number[]>,
  ): ScoringContext {
    // playerHoles: userId → 18 brutto-strokes på par-4-hull med CH=0,
    // som gjør netto = brutto.
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

  it('bryter likhet på back-9 — lavest netto vinner', () => {
    // Begge: total = 9*4 + 9*5 = 36 + 45 = 81.
    // u1: front-9 = 5-er (45), back-9 = 4-er (36) → back-9 = 36
    // u2: front-9 = 4-er (36), back-9 = 5-er (45) → back-9 = 45
    // Lavere back-9 vinner → u1 vinner.
    const ctx = fullCtxFromHoleStrokes({
      u1: [...Array(9).fill(5), ...Array(9).fill(4)],
      u2: [...Array(9).fill(4), ...Array(9).fill(5)],
    });
    const result = compute(ctx);
    expect(result.players[0].userId).toBe('u1');
    expect(result.players[0].totalNetStrokes).toBe(81);
    expect(result.players[0].rank).toBe(1);
    expect(result.players[1].userId).toBe('u2');
    expect(result.players[1].rank).toBe(2);
    // Back-9 brøt likheten → ingen tied lenger.
    expect(result.players[0].tiedWith).toEqual([]);
    expect(result.players[1].tiedWith).toEqual([]);
  });

  it('cascade går videre til back-6 når back-9 også er likt', () => {
    // Front-9 likt for begge: 9 × par (4). Total likt for begge.
    // Back-9 må være lik, men back-6 skal differere.
    // u1: hull 10-12 = [5,5,5] (sum=15), hull 13-18 = [4,4,4,4,4,4] (sum=24) → back-9 = 39, back-6 = 24
    // u2: hull 10-12 = [4,5,5] (sum=14), hull 13-18 = [5,4,4,4,4,4] (sum=25) → back-9 = 39, back-6 = 25
    // Lavere back-6 vinner → u1 vinner (24 < 25).
    const ctx = fullCtxFromHoleStrokes({
      u1: [...Array(9).fill(4), 5, 5, 5, 4, 4, 4, 4, 4, 4],
      u2: [...Array(9).fill(4), 4, 5, 5, 5, 4, 4, 4, 4, 4],
    });
    const result = compute(ctx);
    // Total: u1 = 9*4 + 5+5+5+4+4+4+4+4+4 = 36 + 39 = 75
    //        u2 = 9*4 + 4+5+5+5+4+4+4+4+4 = 36 + 39 = 75
    expect(result.players[0].totalNetStrokes).toBe(75);
    expect(result.players[1].totalNetStrokes).toBe(75);
    // Back-9: u1 = 39, u2 = 39 (likt)
    // Back-6 (hull 13-18): u1 = 4+4+4+4+4+4 = 24, u2 = 5+4+4+4+4+4 = 25 → u1 vinner
    expect(result.players[0].userId).toBe('u1');
    expect(result.players[1].userId).toBe('u2');
  });

  it('cascade går videre til back-3 når back-9 og back-6 er like', () => {
    // Front-9 + total + back-9 + back-6 lik for begge. Back-3 differerer.
    // Holdes konstant ved å bytte ett slag mellom hull 13 (utenfor back-3,
    // innenfor back-6) og hull 16 (innenfor back-3).
    // u1: hull 13 = 5, hull 16 = 4 → back-3 = 4+4+4 = 12, back-6 = 5+4+4+4+4+4 = 25
    // u2: hull 13 = 4, hull 16 = 5 → back-3 = 5+4+4 = 13, back-6 = 4+4+4+5+4+4 = 25
    // Lavere back-3 vinner → u1 vinner (12 < 13).
    const ctx = fullCtxFromHoleStrokes({
      u1: [...Array(12).fill(4), 5, 4, 4, 4, 4, 4],
      u2: [...Array(12).fill(4), 4, 4, 4, 5, 4, 4],
    });
    const result = compute(ctx);
    // Total: u1 = 12*4 + 5+4+4+4+4+4 = 48 + 25 = 73
    //        u2 = 12*4 + 4+4+4+5+4+4 = 48 + 25 = 73
    expect(result.players[0].totalNetStrokes).toBe(73);
    expect(result.players[1].totalNetStrokes).toBe(73);
    expect(result.players[0].userId).toBe('u1');
    expect(result.players[1].userId).toBe('u2');
  });

  it('cascade går videre til hole-18 når back-9/6/3 også er like', () => {
    // Bytt slag mellom hull 16 (innenfor back-3) og hull 18 (siste hull).
    // u1: hull 16 = 5, hull 18 = 4 → hole-18 = 4
    // u2: hull 16 = 4, hull 18 = 5 → hole-18 = 5
    // Back-3 (hull 16-18): u1 = 5+4+4 = 13, u2 = 4+4+5 = 13 (likt)
    // Lavere hole-18 vinner → u1 vinner (4 < 5).
    const ctx = fullCtxFromHoleStrokes({
      u1: [...Array(15).fill(4), 5, 4, 4],
      u2: [...Array(15).fill(4), 4, 4, 5],
    });
    const result = compute(ctx);
    expect(result.players[0].totalNetStrokes).toBe(result.players[1].totalNetStrokes);
    expect(result.players[0].userId).toBe('u1');
    expect(result.players[1].userId).toBe('u2');
  });

  it('full tie → spillere deler rank og oppfører hverandre i tiedWith', () => {
    // Identiske hull-arrays → alle cascade-nivåer matcher.
    const ctx = fullCtxFromHoleStrokes({
      u1: Array(18).fill(4),
      u2: Array(18).fill(4),
    });
    const result = compute(ctx);
    expect(result.players[0].totalNetStrokes).toBe(72);
    expect(result.players[1].totalNetStrokes).toBe(72);
    expect(result.players[0].rank).toBe(result.players[1].rank);
    expect(result.players[0].tiedWith).toContain(result.players[1].userId);
    expect(result.players[1].tiedWith).toContain(result.players[0].userId);
  });

  it('shares rank between fully-tied players (delt 1. plass)', () => {
    const ctx = fullCtxFromHoleStrokes({
      u1: Array(18).fill(4),
      u2: Array(18).fill(4),
      u3: Array(18).fill(5), // bogey × 18 = 90 (verre)
    });
    const result = compute(ctx);
    const u1 = result.players.find((p) => p.userId === 'u1')!;
    const u2 = result.players.find((p) => p.userId === 'u2')!;
    const u3 = result.players.find((p) => p.userId === 'u3')!;
    expect(u1.rank).toBe(1);
    expect(u2.rank).toBe(1);
    // u3 får rank 3 (ikke 2) når to deler 1. plass.
    expect(u3.rank).toBe(3);
  });
});

describe('soloStrokeplay.compute — partial rounds (padding-strategi)', () => {
  // Padding-strategien: unplayed-hull padder med UNPLAYED_PADDING (999) i
  // ranking-arrayet, slik at en spiller som har spilt færre hull IKKE får et
  // urettmessig fortrinn i tie-break-cascaden. Spilleren med 18 hull rangerer
  // alltid foran en spiller med færre hull (gitt samme totalt antall slag på
  // de spilte hullene) fordi unplayed-hull dominerer cascaden.

  it('spiller med 18 hull rangerer foran spiller med 9 hull selv ved samme total', () => {
    // u1: 9 hull med 4 slag hver → total 36, holesPlayed 9.
    // u2: 18 hull med 4 slag på første 9 og 4 på siste 9, men start lavere total:
    //     ... vi vil at u2 også har 36 totalt, men spilt 18 hull.
    // Vanskelig — la oss heller velge:
    // u1: 9 hull med 2 slag hver (total 18, holesPlayed 9). Eagle på par-4 — lite realistisk men test.
    // u2: 18 hull med 1 slag på første 9 hull, 1 på siste (total 18, holesPlayed 18).
    //     Også urealistisk men gjør testen mulig.
    //
    // Enklere: la totalsummen være forskjellig og bare bekreft at unplayed-spilleren
    // rangerer etter den som har spilt mer — så lenge total-tilbudet ikke domineres
    // av padding. Vi tester den faktiske ranking-mekanikken med to spillere som
    // har spilt forskjellig antall hull.
    const ctx = makeCtx({
      players: [
        {
          userId: 'few_holes',
          teamNumber: null,
          flightNumber: null,
          courseHandicap: 0,
        },
        {
          userId: 'all_holes',
          teamNumber: null,
          flightNumber: null,
          courseHandicap: 0,
        },
      ],
      holes: par4Holes(18),
      scores: [
        // few_holes: spilte bare første 9 hull med par (4 hver) → total 36, padding på back-9
        ...Array.from({ length: 9 }, (_, i) => ({
          userId: 'few_holes',
          holeNumber: i + 1,
          gross: 4,
        })),
        // all_holes: spilte alle 18 hull med par → total 72
        ...Array.from({ length: 18 }, (_, i) => ({
          userId: 'all_holes',
          holeNumber: i + 1,
          gross: 4,
        })),
      ],
    });
    const result = compute(ctx);
    // few_holes har total 36, all_holes har total 72 — naivt sett "vinner" few_holes,
    // men padding-strategien gjør at unplayed-hull (999 hver) i ranking-arrayet
    // dominerer cascaden. all_holes skal vinne fordi few_holes' back-9-summen er
    // 9 × 999 = 8991 vs. all_holes' back-9 = 36. Cascaden bryter på back-9.
    const allHolesLine = result.players.find((p) => p.userId === 'all_holes')!;
    const fewHolesLine = result.players.find((p) => p.userId === 'few_holes')!;
    expect(allHolesLine.rank).toBe(1);
    expect(fewHolesLine.rank).toBe(2);
    // Totaler reflekterer faktisk slag-bidrag, ikke padding-verdier.
    expect(allHolesLine.totalNetStrokes).toBe(72);
    expect(allHolesLine.holesPlayed).toBe(18);
    expect(fewHolesLine.totalNetStrokes).toBe(36);
    expect(fewHolesLine.holesPlayed).toBe(9);
  });

  it('to spillere med samme færre antall hull rangerer på spilte hull (ikke padding)', () => {
    // Begge har spilt 9 hull. u1 par × 9 = 36. u2 bogey × 9 = 45.
    // u1 vinner (lavest faktisk slag); padding er likt for begge i back-9.
    const ctx = makeCtx({
      players: [
        {
          userId: 'u1',
          teamNumber: null,
          flightNumber: null,
          courseHandicap: 0,
        },
        {
          userId: 'u2',
          teamNumber: null,
          flightNumber: null,
          courseHandicap: 0,
        },
      ],
      holes: par4Holes(18),
      scores: [
        ...Array.from({ length: 9 }, (_, i) => ({
          userId: 'u1',
          holeNumber: i + 1,
          gross: 4,
        })),
        ...Array.from({ length: 9 }, (_, i) => ({
          userId: 'u2',
          holeNumber: i + 1,
          gross: 5,
        })),
      ],
    });
    const result = compute(ctx);
    expect(result.players[0].userId).toBe('u1');
    expect(result.players[0].totalNetStrokes).toBe(36);
    expect(result.players[1].userId).toBe('u2');
    expect(result.players[1].totalNetStrokes).toBe(45);
  });
});

describe('soloStrokeplay.compute — extra strokes (HCP-allokering)', () => {
  it('strokeIndex 1 får ekstra slag først for CH 1', () => {
    // CH 1 → 1 ekstra slag, bare på hull med strokeIndex 1.
    // Hull 1 har SI 1 → ekstra 1 slag. Gross 5 → netto 4 → bidrag 4.
    // Hull 2 har SI 2 → ingen ekstra. Gross 5 → netto 5 → bidrag 5.
    const ctx = makeCtx({
      players: [
        {
          userId: 'u1',
          teamNumber: null,
          flightNumber: null,
          courseHandicap: 1,
        },
      ],
      holes: [
        { number: 1, par: 4, strokeIndex: 1 },
        { number: 2, par: 4, strokeIndex: 2 },
      ],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u1', holeNumber: 2, gross: 5 },
      ],
    });
    const result = compute(ctx);
    expect(result.players[0].totalNetStrokes).toBe(9); // 4 + 5
    expect(result.players[0].totalGrossStrokes).toBe(10); // 5 + 5
  });

  it('CH 19 → 1 slag på alle hull + 1 ekstra på hull med SI 1', () => {
    // CH 19 → base = floor(19/18) = 1 ekstra slag på alle hull
    //         + extra = 1 ekstra på hull med SI ≤ (19 mod 18) = 1.
    // Hull 1 (SI 1): 2 ekstra. Hull 2 (SI 2): 1 ekstra.
    // Gross 6 → netto 4 og 5.
    const ctx = makeCtx({
      players: [
        {
          userId: 'u1',
          teamNumber: null,
          flightNumber: null,
          courseHandicap: 19,
        },
      ],
      holes: [
        { number: 1, par: 4, strokeIndex: 1 },
        { number: 2, par: 4, strokeIndex: 2 },
      ],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 6 },
        { userId: 'u1', holeNumber: 2, gross: 6 },
      ],
    });
    const result = compute(ctx);
    expect(result.players[0].totalNetStrokes).toBe(9); // 4 + 5
  });
});

// -----------------------------------------------------------------------------
// Per-hull-eksponering (epic #496, PR 8). `result.holes` mater den format-
// bevisste «Hull for hull»-flaten (SoloStrokeplayHolesView) og H2H-momentum-
// strippen. Additivt felt — eksisterende cases over forblir grønne.
// -----------------------------------------------------------------------------
describe('soloStrokeplay.compute — per-hull holes-eksponering (#496)', () => {
  function solo(userId: string, courseHandicap = 0): ScoringPlayer {
    return { userId, teamNumber: null, flightNumber: null, courseHandicap };
  }

  it('eksponerer sorterte hull-rader med par + strokeIndex', () => {
    const ctx = makeCtx({
      players: [solo('u1'), solo('u2')],
      holes: par4Holes(18),
      scores: [
        ...Array.from({ length: 18 }, (_, i) => ({
          userId: 'u1',
          holeNumber: i + 1,
          gross: 4,
        })),
        ...Array.from({ length: 18 }, (_, i) => ({
          userId: 'u2',
          holeNumber: i + 1,
          gross: 5,
        })),
      ],
    });
    const result = compute(ctx);
    expect(result.holes).toHaveLength(18);
    expect(result.holes.map((h) => h.holeNumber)).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
    expect(result.holes[0].par).toBe(4);
    expect(result.holes[0].strokeIndex).toBe(1);
  });

  it('perPlayer har gross + net; netto trekker fra tildelte slag', () => {
    // u1 hcp 18 → 1 slag på hvert hull (SI 1-18). gross 5 → net 4.
    const ctx = makeCtx({
      players: [solo('u1', 18), solo('u2', 0)],
      holes: par4Holes(18),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u2', holeNumber: 1, gross: 4 },
      ],
    });
    const result = compute(ctx);
    const hole1 = result.holes[0];
    const u1 = hole1.perPlayer.find((c) => c.userId === 'u1')!;
    const u2 = hole1.perPlayer.find((c) => c.userId === 'u2')!;
    expect(u1.gross).toBe(5);
    expect(u1.net).toBe(4); // 5 − 1 tildelt slag
    expect(u2.gross).toBe(4);
    expect(u2.net).toBe(4); // hcp 0 → ingen slag
  });

  it('bestUserIds = lavest net; én vinner, delt ved lik, tom ved uspilt', () => {
    const ctx = makeCtx({
      players: [solo('u1'), solo('u2')],
      holes: par4Holes(18),
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 4 }, // u1 vinner hull 1
        { userId: 'u2', holeNumber: 1, gross: 5 },
        { userId: 'u1', holeNumber: 2, gross: 4 }, // delt hull 2
        { userId: 'u2', holeNumber: 2, gross: 4 },
        // hull 3: ingen score
      ],
    });
    const result = compute(ctx);
    expect(result.holes[0].bestUserIds).toEqual(['u1']);
    expect([...result.holes[1].bestUserIds].sort()).toEqual(['u1', 'u2']);
    expect(result.holes[2].bestUserIds).toEqual([]);
  });

  it('uspilt hull gir null net/gross (ikke 999-padding-verdien)', () => {
    const ctx = makeCtx({
      players: [solo('u1'), solo('u2')],
      holes: par4Holes(18),
      scores: [{ userId: 'u1', holeNumber: 1, gross: 4 }],
    });
    const result = compute(ctx);
    const u2 = result.holes[0].perPlayer.find((c) => c.userId === 'u2')!;
    expect(u2.gross).toBeNull();
    expect(u2.net).toBeNull();
    expect(result.holes[0].bestUserIds).toEqual(['u1']);
  });
});

describe('soloStrokeplay.compute — ranking: net_to_par (#2253)', () => {
  // #2253: new solo strokeplay games carry `ranking: 'net_to_par'` in
  // mode_config. They rank on net strokes against each player's OWN par over
  // the holes that player has played («thru»), so a lady on par 72 and a man
  // on par 71 compare fairly, and a player three holes behind is not ranked
  // below everyone who is ahead on the course. Games without the flag keep
  // today's rule (net sum, unplayed holes padded).
  const NET_TO_PAR = {
    kind: 'solo_strokeplay',
    team_size: 1,
    ranking: 'net_to_par',
  } as unknown as ScoringContext['game']['mode_config'];

  function flagged(opts: Parameters<typeof makeCtx>[0]): ScoringContext {
    const ctx = makeCtx(opts);
    return { ...ctx, game: { ...ctx.game, mode_config: NET_TO_PAR } };
  }

  function player(
    userId: string,
    opts: { courseHandicap?: number; teeGender?: ScoringGender } = {},
  ): ScoringPlayer {
    return {
      userId,
      teamNumber: null,
      flightNumber: null,
      courseHandicap: opts.courseHandicap ?? 0,
      ...(opts.teeGender ? { teeGender: opts.teeGender } : {}),
    };
  }

  /** Gross per hole number → score rows. */
  function card(userId: string, grossByHole: Record<number, number>): ScoringHoleScore[] {
    return Object.entries(grossByHole).map(([hole, gross]) => ({
      userId,
      holeNumber: Number(hole),
      gross,
    }));
  }

  /** `holes` × par 4, with `overrides` (hole number → gross). */
  function evenCard(
    userId: string,
    holes: number[],
    overrides: Record<number, number> = {},
  ): ScoringHoleScore[] {
    return card(
      userId,
      Object.fromEntries(holes.map((h) => [h, overrides[h] ?? 4])),
    );
  }

  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

  // Hole 1 is par 3 from the men's tee and par 4 from the ladies' tee; every
  // other hole is par 4 for all. Men's par 71, ladies' par 72.
  const MIXED_PAR_HOLES: ScoringHole[] = range(1, 18).map((n) => ({
    number: n,
    par: n === 1 ? 3 : 4,
    parByGender: n === 1 ? { mens: 3, ladies: 4, juniors: 4 } : { mens: 4, ladies: 4, juniors: 4 },
    strokeIndex: n,
  }));

  // Kari (ladies' tee) goes 73 net, Ola (men's tee) goes 72 net. Both are +1
  // against their own par, with the bogey on the same hole.
  const kariOla = {
    players: [player('kari', { teeGender: 'ladies' }), player('ola', { teeGender: 'mens' })],
    holes: MIXED_PAR_HOLES,
    scores: [
      ...evenCard('kari', range(1, 18), { 5: 5 }),
      ...evenCard('ola', range(1, 18), { 1: 3, 5: 5 }),
    ],
  };

  // early: holes 1–9, one birdie → −1. late: holes 1–14, two bogeys and a
  // birdie → +1.
  const thru = {
    players: [player('late'), player('early')],
    holes: par4Holes(18),
    scores: [
      ...evenCard('early', range(1, 9), { 3: 3 }),
      ...evenCard('late', range(1, 14), { 2: 5, 7: 5, 11: 3 }),
    ],
  };

  it('mixed par: Kari and Ola share first place with the flag, Ola leads without it', () => {
    const withFlag = compute(flagged(kariOla));
    expect(withFlag.players.map((p) => [p.userId, p.rank, p.netToPar])).toEqual([
      ['kari', 1, 1],
      ['ola', 1, 1],
    ]);
    expect(withFlag.players.find((p) => p.userId === 'kari')!.tiedWith).toEqual(['ola']);

    const without = compute(makeCtx(kariOla));
    expect(without.players.map((p) => [p.userId, p.rank])).toEqual([
      ['ola', 1],
      ['kari', 2],
    ]);
  });

  it('thru: −1 after 9 holes beats +1 after 14 holes with the flag; without it the 14-hole player leads', () => {
    const withFlag = compute(flagged(thru));
    expect(withFlag.players.map((p) => [p.userId, p.rank, p.netToPar, p.holesPlayed])).toEqual([
      ['early', 1, -1, 9],
      ['late', 2, 1, 14],
    ]);

    const without = compute(makeCtx(thru));
    expect(without.players.map((p) => [p.userId, p.rank])).toEqual([
      ['late', 1],
      ['early', 2],
    ]);
  });

  it('a player without a single score ranks last with the flag', () => {
    const result = compute(
      flagged({
        players: [player('none'), player('full'), player('one')],
        holes: par4Holes(18),
        scores: [
          ...evenCard('full', range(1, 18), Object.fromEntries(range(1, 10).map((h) => [h, 5]))),
          ...card('one', { 1: 6 }),
        ],
      }),
    );
    expect(result.players.map((p) => [p.userId, p.rank, p.netToPar])).toEqual([
      ['one', 1, 2],
      ['full', 2, 10],
      ['none', 3, null],
    ]);
  });

  // Same par for everyone and the same holes played: Σ(net − par) is the net
  // sum minus one common par, and so is every tie-break tier. Both rules must
  // then give the same order, the same ranks and the same ties.
  const grossFor = (seed: number, hole: number) => 3 + ((seed * 7 + hole * 5) % 4);
  const fieldPlayers = [
    { userId: 'p1', seed: 1, courseHandicap: 0 },
    { userId: 'p2', seed: 2, courseHandicap: 4 },
    { userId: 'p2b', seed: 2, courseHandicap: 4 },
    { userId: 'p3', seed: 3, courseHandicap: 9 },
    { userId: 'p4', seed: 4, courseHandicap: 14 },
    { userId: 'p5', seed: 5, courseHandicap: 20 },
  ];
  it.each([
    ['all 18 holes', range(1, 18)],
    ['the same 9 holes', range(1, 9)],
  ])('same par, %s: both rules give identical ranks', (_label, played) => {
    const opts = {
      players: fieldPlayers.map((p) => player(p.userId, { courseHandicap: p.courseHandicap })),
      holes: par4Holes(18),
      scores: fieldPlayers.flatMap((p) =>
        card(p.userId, Object.fromEntries(played.map((h) => [h, grossFor(p.seed, h)]))),
      ),
    };
    const shape = (r: ReturnType<typeof compute>) =>
      r.players.map((p) => ({ userId: p.userId, rank: p.rank, tiedWith: p.tiedWith }));

    const withFlag = shape(compute(flagged(opts)));
    expect(withFlag).toEqual(shape(compute(makeCtx(opts))));
    // The fixture has a real tie, so the property covers shared ranks too.
    expect(withFlag.find((p) => p.userId === 'p2')!.tiedWith).toEqual(['p2b']);
  });

  it('without the flag the output is what it was before #2253', () => {
    const lines = (ctx: ScoringContext) =>
      compute(ctx).players.map(({ netToPar: _netToPar, ...rest }) => rest);

    expect(lines(makeCtx(kariOla))).toEqual([
      { userId: 'ola', totalNetStrokes: 72, totalGrossStrokes: 72, holesPlayed: 18, rank: 1, tiedWith: [] },
      { userId: 'kari', totalNetStrokes: 73, totalGrossStrokes: 73, holesPlayed: 18, rank: 2, tiedWith: [] },
    ]);
    expect(lines(makeCtx(thru))).toEqual([
      { userId: 'late', totalNetStrokes: 57, totalGrossStrokes: 57, holesPlayed: 14, rank: 1, tiedWith: [] },
      { userId: 'early', totalNetStrokes: 35, totalGrossStrokes: 35, holesPlayed: 9, rank: 2, tiedWith: [] },
    ]);
  });

  it('netToPar is null without holes, and skips an unplayed hole (with and without the flag)', () => {
    // CH 18 → one stroke on every hole. Holes 1, 2 and 4 played, 3 skipped:
    // net 4, 5, 5 against par 4 → 0, +1, +1 = +2.
    const opts = {
      players: [player('x', { courseHandicap: 18 }), player('y')],
      holes: par4Holes(18),
      scores: card('x', { 1: 5, 2: 6, 4: 6 }),
    };
    for (const ctx of [makeCtx(opts), flagged(opts)]) {
      const result = compute(ctx);
      expect(result.players.find((p) => p.userId === 'x')!.netToPar).toBe(2);
      expect(result.players.find((p) => p.userId === 'y')!.netToPar).toBeNull();
    }
  });

  it('the result says which rule ranked it, so the result surfaces can follow', () => {
    // The podium, the duel, the share card and the round report only get the
    // result; they show net to par exactly when the engine ranked on it.
    const opts = { players: [player('p')], holes: par4Holes(18), scores: card('p', { 1: 5 }) };
    expect(compute(flagged(opts)).ranking).toBe('net_to_par');
    expect(compute(makeCtx(opts)).ranking).toBe('net_total');
  });

  it('back-9 game with the flag: the tie-break reads holes 10–18', () => {
    // Both +3 over holes 10–18. a took the bogeys on 10–12, b on 13–15, so a
    // wins on the back-6 tier (holes 13–18). Without the flag the holes land
    // on slots 0–8 and every tie-break tier is padding: a full tie.
    const back9Holes: ScoringHole[] = range(10, 18).map((n) => ({
      number: n,
      par: 4,
      strokeIndex: n - 9,
    }));
    const opts = {
      players: [player('b'), player('a')],
      holes: back9Holes,
      scores: [
        ...evenCard('a', range(10, 18), { 10: 5, 11: 5, 12: 5 }),
        ...evenCard('b', range(10, 18), { 13: 5, 14: 5, 15: 5 }),
      ],
    };

    const withFlag = compute(flagged(opts));
    expect(withFlag.players.map((p) => [p.userId, p.rank, p.netToPar])).toEqual([
      ['a', 1, 3],
      ['b', 2, 3],
    ]);

    const without = compute(makeCtx(opts));
    expect(without.players.map((p) => p.rank)).toEqual([1, 1]);
  });
});

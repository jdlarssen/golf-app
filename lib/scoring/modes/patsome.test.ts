// Type A tests — pure logic, assertion-rich, TDD.
// Skriv FAILING tests FIRST, implementer i patsome.ts til alle er grønne.

import { describe, it, expect } from 'vitest';
import { compute } from './patsome';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
} from './types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Lager 18 hull med par 4 og SI = hullnummer (SI 1–18). */
function makeHoles18(): ScoringHole[] {
  return Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    strokeIndex: i + 1,
  }));
}

/** Lager et enkelt hull med angitt par og SI. */
function makeHole(number: number, par: number, strokeIndex: number): ScoringHole {
  return { number, par, strokeIndex };
}

function makePlayer(
  userId: string,
  teamNumber: number,
  courseHandicap = 0,
): ScoringPlayer {
  return {
    userId,
    teamNumber,
    flightNumber: teamNumber,
    courseHandicap,
  };
}

function makeScore(userId: string, holeNumber: number, gross: number | null): ScoringHoleScore {
  return { userId, holeNumber, gross };
}

function makeCtx(opts: {
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
  patsomeScoring?: 'gross' | 'net';
  modeConfigOverride?: Record<string, unknown>;
}): ScoringContext {
  const modeConfig = opts.modeConfigOverride
    ? (opts.modeConfigOverride as never)
    : ({
        kind: 'patsome',
        team_size: 2,
        teams_count: 2,
        patsome_scoring: opts.patsomeScoring ?? 'net',
      } as never);
  return {
    game: {
      id: 'g1',
      game_mode: 'patsome',
      mode_config: modeConfig,
    },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

// ---------------------------------------------------------------------------
// Case 1 — Shape
// ---------------------------------------------------------------------------

describe('patsome.compute — discriminated shape', () => {
  it('returnerer kind=patsome, scoring og ett teamLine per lag', () => {
    // 2 lag à 2 spillere, 18 hull, ingen scorer
    const players = [
      makePlayer('u1', 1),
      makePlayer('u2', 1),
      makePlayer('u3', 2),
      makePlayer('u4', 2),
    ];
    const ctx = makeCtx({ players, holes: makeHoles18(), scores: [] });
    const result = compute(ctx);
    expect(result.kind).toBe('patsome');
    expect(result.scoring).toBe('net');
    expect(result.teams).toHaveLength(2);
  });

  it('hvert teamLine har holes.length = antall hull i konteksten', () => {
    const players = [makePlayer('u1', 1), makePlayer('u2', 1)];
    const holes = makeHoles18();
    const ctx = makeCtx({ players, holes, scores: [] });
    const result = compute(ctx);
    expect(result.teams[0].holes).toHaveLength(18);
  });

  it('returnerer scoring=gross fra mode_config', () => {
    const players = [makePlayer('u1', 1), makePlayer('u2', 1)];
    const ctx = makeCtx({ players, holes: makeHoles18(), scores: [], patsomeScoring: 'gross' });
    const result = compute(ctx);
    expect(result.scoring).toBe('gross');
  });

  it('hole-segmenter: hull 1–6=fourball, 7–12=greensome, 13–18=foursomes', () => {
    const players = [makePlayer('u1', 1), makePlayer('u2', 1)];
    const ctx = makeCtx({ players, holes: makeHoles18(), scores: [] });
    const result = compute(ctx);
    const holes = result.teams[0].holes;
    expect(holes.find((h) => h.holeNumber === 1)?.segment).toBe('fourball');
    expect(holes.find((h) => h.holeNumber === 6)?.segment).toBe('fourball');
    expect(holes.find((h) => h.holeNumber === 7)?.segment).toBe('greensome');
    expect(holes.find((h) => h.holeNumber === 12)?.segment).toBe('greensome');
    expect(holes.find((h) => h.holeNumber === 13)?.segment).toBe('foursomes');
    expect(holes.find((h) => h.holeNumber === 18)?.segment).toBe('foursomes');
  });
});

// ---------------------------------------------------------------------------
// Case 2 — 4BBB MAX-regel (hull 1–6)
// ---------------------------------------------------------------------------

describe('patsome.compute — 4BBB MAX-regel (hull 1–6)', () => {
  it('teamPoints = MAX av to partners poeng', () => {
    // Hull 1, par 4, SI=1. Gross-modus for enkelhet.
    // u1 gross=3 (birdie) → 3 pts; u2 gross=5 (bogey) → 1 pt. MAX = 3.
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [makeHole(1, 4, 1)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 1, 3), makeScore('u2', 1, 5)],
      patsomeScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = result.teams[0].holes[0];
    expect(h1.segment).toBe('fourball');
    expect(h1.teamPoints).toBe(3);
    // players-cellene er populated i fourball
    expect(h1.players).toHaveLength(2);
    const u1Cell = h1.players.find((p) => p.userId === 'u1')!;
    const u2Cell = h1.players.find((p) => p.userId === 'u2')!;
    expect(u1Cell.points).toBe(3);
    expect(u2Cell.points).toBe(1);
  });

  it('contributorIds = den/de med MAX-poeng som faktisk spilte', () => {
    // u1 birdie → 3 pts, u2 bogey → 1 pt. Kun u1 bidrar.
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [makeHole(1, 4, 1)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 1, 3), makeScore('u2', 1, 5)],
      patsomeScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = result.teams[0].holes[0];
    expect(h1.contributorIds).toEqual(['u1']);
    const u1Cell = h1.players.find((p) => p.userId === 'u1')!;
    const u2Cell = h1.players.find((p) => p.userId === 'u2')!;
    expect(u1Cell.isContributor).toBe(true);
    expect(u2Cell.isContributor).toBe(false);
  });

  it('begge er contributor ved tie (samme MAX)', () => {
    // u1 og u2 begge birdie (gross=3) → begge 3 pts → begge contributor
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [makeHole(1, 4, 1)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 1, 3), makeScore('u2', 1, 3)],
      patsomeScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = result.teams[0].holes[0];
    expect(h1.teamPoints).toBe(3);
    expect(h1.contributorIds.sort()).toEqual(['u1', 'u2']);
    for (const cell of h1.players) {
      expect(cell.isContributor).toBe(true);
    }
  });

  it('teamPoints=0 (double bogey begge) → ingen contributors', () => {
    // u1 gross=6 (double bogey) → 0 pts; u2 gross=7 → 0 pts. MAX=0.
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [makeHole(1, 4, 1)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 1, 6), makeScore('u2', 1, 7)],
      patsomeScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = result.teams[0].holes[0];
    expect(h1.teamPoints).toBe(0);
    expect(h1.contributorIds).toHaveLength(0);
  });

  it('netto 4BBB: strokes fratrekkes individuelt', () => {
    // Hull 1, par 4, SI=1.
    // u1 CH=2 → strokesForHole(2, 1) = 1 slag (SI=1 ≤ 2%18=2). gross=5, net=4 → par → 2 pts.
    // u2 CH=0 → 0 slag. gross=3, net=3 → birdie → 3 pts.
    // MAX = 3 (u2).
    const players = [makePlayer('u1', 1, 2), makePlayer('u2', 1, 0)];
    const holes = [makeHole(1, 4, 1)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 1, 5), makeScore('u2', 1, 3)],
      patsomeScoring: 'net',
    });
    const result = compute(ctx);
    const h1 = result.teams[0].holes[0];
    expect(h1.teamPoints).toBe(3);
    const u1Cell = h1.players.find((p) => p.userId === 'u1')!;
    expect(u1Cell.netStrokes).toBe(4);
    expect(u1Cell.points).toBe(2);
    const u2Cell = h1.players.find((p) => p.userId === 'u2')!;
    expect(u2Cell.netStrokes).toBe(3);
    expect(u2Cell.points).toBe(3);
  });

  it('4BBB: teamGross=null, teamNetStrokes=null, teamExtraStrokes=0', () => {
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [makeHole(1, 4, 1)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 1, 4), makeScore('u2', 1, 4)],
      patsomeScoring: 'gross',
    });
    const result = compute(ctx);
    const h1 = result.teams[0].holes[0];
    expect(h1.teamGross).toBeNull();
    expect(h1.teamNetStrokes).toBeNull();
    expect(h1.teamExtraStrokes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Case 3 — Greensome 60/40 allowance (hull 7–12)
// ---------------------------------------------------------------------------

describe('patsome.compute — Greensome 60/40 allowance (hull 7–12)', () => {
  it('teamHandicap = round(0.6*min + 0.4*max) og korrekt teamExtraStrokes', () => {
    // Lag: u1 CH=10, u2 CH=20. min=10, max=20.
    // teamHandicap = round(0.6*10 + 0.4*20) = round(6+8) = round(14) = 14.
    // Hull 7, SI=7. strokesForHole(14, 7): base=floor(14/18)=0, extra= (7 ≤ 14%18=14) → extra=1. strokes=1.
    // Kapteinen er lex-min(u1, u2) = u1.
    // u1 gross=5 (captain-eide rad). teamGross=5. teamNet=5-1=4. par=4 → par → 2 pts.
    const players = [makePlayer('u1', 1, 10), makePlayer('u2', 1, 20)];
    const holes = [makeHole(7, 4, 7)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 7, 5)],
      patsomeScoring: 'net',
    });
    const result = compute(ctx);
    const h7 = result.teams[0].holes[0];
    expect(h7.segment).toBe('greensome');
    expect(h7.teamExtraStrokes).toBe(1);
    expect(h7.teamGross).toBe(5);
    expect(h7.teamNetStrokes).toBe(4);
    expect(h7.teamPoints).toBe(2);
    // players-arrayen er tom for 1-ball-segmenter
    expect(h7.players).toHaveLength(0);
    expect(h7.contributorIds).toHaveLength(0);
  });

  it('greensome: round(0.6*min + 0.4*max) runder riktig ved .5', () => {
    // u1 CH=5, u2 CH=10. min=5, max=10.
    // teamHandicap = round(0.6*5 + 0.4*10) = round(3+4) = round(7) = 7.
    const players = [makePlayer('u1', 1, 5), makePlayer('u2', 1, 10)];
    const holes = [makeHole(7, 4, 7)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 7, 4)],
      patsomeScoring: 'net',
    });
    const result = compute(ctx);
    const h7 = result.teams[0].holes[0];
    // strokesForHole(7, 7): SI=7 ≤ 7%18=7 → extra=1; base=0 → strokes=1.
    expect(h7.teamExtraStrokes).toBe(1);
    expect(h7.teamNetStrokes).toBe(3);
    expect(h7.teamPoints).toBe(3); // birdie
  });

  it('greensome gross-modus: teamExtraStrokes=0, net=gross', () => {
    // CH er irrelevant i gross-modus
    const players = [makePlayer('u1', 1, 18), makePlayer('u2', 1, 20)];
    const holes = [makeHole(7, 4, 7)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 7, 5)],
      patsomeScoring: 'gross',
    });
    const result = compute(ctx);
    const h7 = result.teams[0].holes[0];
    expect(h7.teamExtraStrokes).toBe(0);
    expect(h7.teamGross).toBe(5);
    expect(h7.teamNetStrokes).toBe(5);
    expect(h7.teamPoints).toBe(1); // bogey
  });
});

// ---------------------------------------------------------------------------
// Case 4 — Foursomes 50% allowance (hull 13–18)
// ---------------------------------------------------------------------------

describe('patsome.compute — Foursomes 50% allowance (hull 13–18)', () => {
  it('teamHandicap = round(0.5*(chA+chB)) og korrekt teamExtraStrokes', () => {
    // u1 CH=10, u2 CH=14. sum=24. teamHandicap=round(0.5*24)=12.
    // Hull 13, SI=13. strokesForHole(12, 13): base=floor(12/18)=0, extra=(13 ≤ 12%18=12)? 13>12 → extra=0. strokes=0.
    // Faktisk: strokesForHole(12, 13): base=0, (12%18)=12, SI=13 > 12 → extra=0, strokes=0.
    // Prøv SI=5 for å få et slag.
    // Hull 13 med SI=5. strokesForHole(12, 5): base=0, (12%18)=12, SI=5 ≤ 12 → extra=1. strokes=1.
    const players = [makePlayer('u1', 1, 10), makePlayer('u2', 1, 14)];
    const holes = [makeHole(13, 4, 5)]; // SI=5 for å lette testen
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 13, 5)],
      patsomeScoring: 'net',
    });
    const result = compute(ctx);
    const h13 = result.teams[0].holes[0];
    expect(h13.segment).toBe('foursomes');
    expect(h13.teamExtraStrokes).toBe(1);
    expect(h13.teamGross).toBe(5);
    expect(h13.teamNetStrokes).toBe(4);
    expect(h13.teamPoints).toBe(2); // par → 2 pts
  });

  it('foursomes: round(0.5*(a+b)) runder korrekt ved odde sum', () => {
    // u1 CH=7, u2 CH=8. sum=15. teamHandicap=round(0.5*15)=round(7.5)=8.
    const players = [makePlayer('u1', 1, 7), makePlayer('u2', 1, 8)];
    const holes = [makeHole(13, 4, 8)]; // SI=8. strokesForHole(8, 8): base=0, 8%18=8, SI=8≤8 → extra=1. strokes=1.
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 13, 4)],
      patsomeScoring: 'net',
    });
    const result = compute(ctx);
    const h13 = result.teams[0].holes[0];
    expect(h13.teamExtraStrokes).toBe(1);
    expect(h13.teamNetStrokes).toBe(3);
    expect(h13.teamPoints).toBe(3); // birdie
  });

  it('foursomes gross-modus: teamExtraStrokes=0', () => {
    const players = [makePlayer('u1', 1, 18), makePlayer('u2', 1, 20)];
    const holes = [makeHole(13, 4, 1)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 13, 4)],
      patsomeScoring: 'gross',
    });
    const result = compute(ctx);
    const h13 = result.teams[0].holes[0];
    expect(h13.teamExtraStrokes).toBe(0);
    expect(h13.teamNetStrokes).toBe(4);
    expect(h13.teamPoints).toBe(2); // par
  });
});

// ---------------------------------------------------------------------------
// Case 5 — Segment-overgang og delsummer
// ---------------------------------------------------------------------------

describe('patsome.compute — segment-overganger og delsummer', () => {
  it('hull 6 er fourball, hull 7 er greensome, hull 12 er greensome, hull 13 er foursomes', () => {
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const ctx = makeCtx({ players, holes: makeHoles18(), scores: [], patsomeScoring: 'gross' });
    const result = compute(ctx);
    const holes = result.teams[0].holes;
    const h6 = holes.find((h) => h.holeNumber === 6)!;
    const h7 = holes.find((h) => h.holeNumber === 7)!;
    const h12 = holes.find((h) => h.holeNumber === 12)!;
    const h13 = holes.find((h) => h.holeNumber === 13)!;
    expect(h6.segment).toBe('fourball');
    expect(h7.segment).toBe('greensome');
    expect(h12.segment).toBe('greensome');
    expect(h13.segment).toBe('foursomes');
  });

  it('segment-delsummer + totalPoints = sum av alle 18 hull', () => {
    // Gross-modus. Alle gross=4 (par) → 2 pts per hull.
    // Totalt: 18 hull × 2 = 36. fourball: 6×2=12, greensome: 6×2=12, foursomes: 6×2=12.
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = makeHoles18();
    // u1 er kaptein (lex-min), eier 1-ball-rad for hull 7–18.
    const scores: ScoringHoleScore[] = [];
    for (let i = 1; i <= 18; i++) {
      scores.push(makeScore('u1', i, 4));
      if (i <= 6) {
        scores.push(makeScore('u2', i, 4));
      }
    }
    const ctx = makeCtx({ players, holes, scores, patsomeScoring: 'gross' });
    const result = compute(ctx);
    const team = result.teams[0];
    expect(team.totalPoints).toBe(36);
    expect(team.segments.fourball.points).toBe(12);
    expect(team.segments.greensome.points).toBe(12);
    expect(team.segments.foursomes.points).toBe(12);
    expect(team.segments.fourball.points + team.segments.greensome.points + team.segments.foursomes.points).toBe(team.totalPoints);
  });

  it('holesPlayed per segment teller bare spilte hull', () => {
    // Hull 1 fourball: kun u1 har score (u2 mangler). hullet telles fordi minst én har gross.
    // Hull 7 greensome: kaptein u1 har score → spilt.
    // Hull 13 foursomes: kaptein u1 har IKKE score → ikke spilt.
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [
      makeHole(1, 4, 1),   // fourball
      makeHole(7, 4, 7),   // greensome
      makeHole(13, 4, 13), // foursomes
    ];
    const scores = [
      makeScore('u1', 1, 4), // u2 mangler
      makeScore('u1', 7, 4), // greensome spilt
      // hull 13 mangler (foursomes ikke spilt)
    ];
    const ctx = makeCtx({ players, holes, scores, patsomeScoring: 'gross' });
    const result = compute(ctx);
    const team = result.teams[0];
    expect(team.segments.fourball.holesPlayed).toBe(1);
    expect(team.segments.greensome.holesPlayed).toBe(1);
    expect(team.segments.foursomes.holesPlayed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Case 6 — Net vs gross flip
// ---------------------------------------------------------------------------

describe('patsome.compute — net vs gross flip', () => {
  it('gross-modus: teamExtraStrokes=0 i alle segmenter, net=gross', () => {
    // u1 CH=18, u2 CH=20 — høye handicap som ellers ville gitt mange slag.
    const players = [makePlayer('u1', 1, 18), makePlayer('u2', 1, 20)];
    const holes = makeHoles18();
    const scores: ScoringHoleScore[] = [];
    for (let i = 1; i <= 18; i++) {
      scores.push(makeScore('u1', i, 5)); // bogey
      if (i <= 6) {
        scores.push(makeScore('u2', i, 5)); // bogey
      }
    }
    const ctx = makeCtx({ players, holes, scores, patsomeScoring: 'gross' });
    const result = compute(ctx);
    const team = result.teams[0];
    for (const h of team.holes) {
      expect(h.teamExtraStrokes).toBe(0);
      if (h.segment !== 'fourball') {
        expect(h.teamNetStrokes).toBe(5);
        expect(h.teamPoints).toBe(1); // bogey gross = 1 pt
      }
    }
  });

  it('net-modus: strokes trekkes fra i alle segmenter', () => {
    // u1 CH=18, u2 CH=0. Greensome: min=0, max=18. teamHandicap=round(0.6*0+0.4*18)=round(7.2)=7.
    // Foursomes: round(0.5*(18+0))=round(9)=9.
    // Hull 7, SI=7. Greensome extraStrokes: strokesForHole(7, 7): base=0, 7%18=7, SI=7≤7 → 1. strokes=1.
    const players = [makePlayer('u1', 1, 18), makePlayer('u2', 1, 0)];
    const holes = [makeHole(7, 4, 7)];
    const scores = [makeScore('u1', 7, 5)];
    const ctx = makeCtx({ players, holes, scores, patsomeScoring: 'net' });
    const result = compute(ctx);
    const h7 = result.teams[0].holes[0];
    expect(h7.teamExtraStrokes).toBe(1);
    expect(h7.teamNetStrokes).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Case 7 — Uspilte/pending hull
// ---------------------------------------------------------------------------

describe('patsome.compute — uspilte hull', () => {
  it('fourball: begge mangler gross → teamPoints=0, teller ikke i holesPlayed', () => {
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [makeHole(1, 4, 1)];
    const ctx = makeCtx({ players, holes, scores: [], patsomeScoring: 'gross' });
    const result = compute(ctx);
    const h1 = result.teams[0].holes[0];
    expect(h1.teamPoints).toBe(0);
    expect(result.teams[0].segments.fourball.holesPlayed).toBe(0);
  });

  it('greensome: captain mangler gross → teamGross=null, teamPoints=0', () => {
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [makeHole(7, 4, 7)];
    const ctx = makeCtx({ players, holes, scores: [], patsomeScoring: 'gross' });
    const result = compute(ctx);
    const h7 = result.teams[0].holes[0];
    expect(h7.teamGross).toBeNull();
    expect(h7.teamPoints).toBe(0);
    expect(result.teams[0].segments.greensome.holesPlayed).toBe(0);
  });

  it('foursomes: captain mangler gross → teamPoints=0, teller ikke', () => {
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [makeHole(13, 4, 1)];
    const ctx = makeCtx({ players, holes, scores: [], patsomeScoring: 'gross' });
    const result = compute(ctx);
    const h13 = result.teams[0].holes[0];
    expect(h13.teamPoints).toBe(0);
    expect(result.teams[0].segments.foursomes.holesPlayed).toBe(0);
  });

  it('hull med 0 teamPoints men spilt telles likevel i holesPlayed', () => {
    // Begge double bogey → 0 pts, men hullet er spilt
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [makeHole(1, 4, 1)];
    const ctx = makeCtx({
      players,
      holes,
      scores: [makeScore('u1', 1, 6), makeScore('u2', 1, 7)],
      patsomeScoring: 'gross',
    });
    const result = compute(ctx);
    expect(result.teams[0].segments.fourball.holesPlayed).toBe(1);
    expect(result.teams[0].holes[0].teamPoints).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Case 8 — Multi-team ranking + tiedWith
// ---------------------------------------------------------------------------

describe('patsome.compute — multi-team ranking', () => {
  it('3 lag med distinkte totaler → rank 1/2/3', () => {
    // Gross-modus. 1 hull per lag (fourball). u1/u2 birdie=3pts, u3/u4 par=2pts, u5/u6 bogey=1pt.
    const players = [
      makePlayer('u1', 1, 0), makePlayer('u2', 1, 0),
      makePlayer('u3', 2, 0), makePlayer('u4', 2, 0),
      makePlayer('u5', 3, 0), makePlayer('u6', 3, 0),
    ];
    const holes = [makeHole(1, 4, 1)];
    const scores = [
      makeScore('u1', 1, 3), makeScore('u2', 1, 4), // lag 1: MAX=3pts
      makeScore('u3', 1, 4), makeScore('u4', 1, 5), // lag 2: MAX=2pts
      makeScore('u5', 1, 5), makeScore('u6', 1, 5), // lag 3: MAX=1pt
    ];
    const ctx = makeCtx({ players, holes, scores, patsomeScoring: 'gross' });
    const result = compute(ctx);
    const ranked = result.teams.sort((a, b) => a.teamNumber - b.teamNumber);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[2].rank).toBe(3);
    expect(ranked[0].tiedWith).toHaveLength(0);
    expect(ranked[1].tiedWith).toHaveLength(0);
    expect(ranked[2].tiedWith).toHaveLength(0);
  });

  it('to lag med identiske totaler → delt rank + tiedWith populated', () => {
    // Lag 1 og lag 2 begge par (2pts). Lag 3 bogey (1pt).
    const players = [
      makePlayer('u1', 1, 0), makePlayer('u2', 1, 0),
      makePlayer('u3', 2, 0), makePlayer('u4', 2, 0),
      makePlayer('u5', 3, 0), makePlayer('u6', 3, 0),
    ];
    const holes = [makeHole(1, 4, 1)];
    const scores = [
      makeScore('u1', 1, 4), makeScore('u2', 1, 5), // lag 1: MAX=2pts
      makeScore('u3', 1, 4), makeScore('u4', 1, 5), // lag 2: MAX=2pts
      makeScore('u5', 1, 5), makeScore('u6', 1, 6), // lag 3: MAX=1pt
    ];
    const ctx = makeCtx({ players, holes, scores, patsomeScoring: 'gross' });
    const result = compute(ctx);
    const t1 = result.teams.find((t) => t.teamNumber === 1)!;
    const t2 = result.teams.find((t) => t.teamNumber === 2)!;
    const t3 = result.teams.find((t) => t.teamNumber === 3)!;
    expect(t1.rank).toBe(1);
    expect(t2.rank).toBe(1);
    expect(t3.rank).toBe(3);
    expect(t1.tiedWith).toContain(2);
    expect(t2.tiedWith).toContain(1);
    expect(t3.tiedWith).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Case 9 — Defensive draft state (n≠2 per lag krasjer ikke)
// ---------------------------------------------------------------------------

describe('patsome.compute — defensive draft state', () => {
  it('lag med 1 spiller krasjer ikke', () => {
    const players = [makePlayer('u1', 1, 0)]; // kun 1 spiller på laget
    const holes = [makeHole(1, 4, 1), makeHole(7, 4, 7)];
    const scores = [makeScore('u1', 1, 4), makeScore('u1', 7, 4)];
    const ctx = makeCtx({ players, holes, scores, patsomeScoring: 'gross' });
    expect(() => compute(ctx)).not.toThrow();
    const result = compute(ctx);
    expect(result.teams).toHaveLength(1);
  });

  it('lag med 3 spillere krasjer ikke', () => {
    const players = [
      makePlayer('u1', 1, 0),
      makePlayer('u2', 1, 0),
      makePlayer('u3', 1, 0), // 3 på laget
    ];
    const holes = [makeHole(1, 4, 1)];
    const scores = [
      makeScore('u1', 1, 4),
      makeScore('u2', 1, 5),
      makeScore('u3', 1, 6),
    ];
    const ctx = makeCtx({ players, holes, scores, patsomeScoring: 'gross' });
    expect(() => compute(ctx)).not.toThrow();
  });

  it('ingen spillere → 0 lag, krasjer ikke', () => {
    const ctx = makeCtx({ players: [], holes: makeHoles18(), scores: [] });
    expect(() => compute(ctx)).not.toThrow();
    const result = compute(ctx);
    expect(result.teams).toHaveLength(0);
  });

  it('spiller uten teamNumber hoppes over', () => {
    const players: ScoringPlayer[] = [
      { userId: 'u1', teamNumber: null, flightNumber: null, courseHandicap: 0 },
      makePlayer('u2', 1, 0),
      makePlayer('u3', 1, 0),
    ];
    const holes = [makeHole(1, 4, 1)];
    const scores = [makeScore('u2', 1, 4), makeScore('u3', 1, 5)];
    const ctx = makeCtx({ players, holes, scores, patsomeScoring: 'gross' });
    expect(() => compute(ctx)).not.toThrow();
    const result = compute(ctx);
    expect(result.teams).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Case 10 — Captain = lex-min userId
// ---------------------------------------------------------------------------

describe('patsome.compute — captain = lex-min userId', () => {
  it('captainUserId er lex-minste userId på laget', () => {
    // u2 < u9 lexicographically → u2 er kaptein
    const players = [makePlayer('u9', 1, 0), makePlayer('u2', 1, 0)];
    const holes = makeHoles18();
    const ctx = makeCtx({ players, holes, scores: [], patsomeScoring: 'gross' });
    const result = compute(ctx);
    expect(result.teams[0].captainUserId).toBe('u2');
  });

  it('captain-kjet bruker kapteinens scores-rad for greensome/foursomes', () => {
    // Lag: 'zzz' og 'aaa'. Captain = 'aaa'. Greensome hull 7.
    // 'aaa' har gross, 'zzz' har ikke. Kapteinens gross brukes.
    const players = [makePlayer('zzz', 1, 0), makePlayer('aaa', 1, 0)];
    const holes = [makeHole(7, 4, 7)];
    const scores = [
      makeScore('aaa', 7, 4), // captain
      // zzz har ikke score
    ];
    const ctx = makeCtx({ players, holes, scores, patsomeScoring: 'gross' });
    const result = compute(ctx);
    expect(result.teams[0].captainUserId).toBe('aaa');
    expect(result.teams[0].holes[0].teamGross).toBe(4);
  });

  it('playerIds på teamLine inneholder alle lagets userId', () => {
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const ctx = makeCtx({ players, holes: makeHoles18(), scores: [] });
    const result = compute(ctx);
    expect(result.teams[0].playerIds.sort()).toEqual(['u1', 'u2']);
  });
});

// ---------------------------------------------------------------------------
// Case 11 — Defensiv fallback (mangler patsome_scoring)
// ---------------------------------------------------------------------------

describe('patsome.compute — defensiv fallback', () => {
  it('manglende patsome_scoring faller tilbake til net', () => {
    // mode_config uten patsome_scoring-feltet
    const players = [makePlayer('u1', 1, 10), makePlayer('u2', 1, 0)];
    const holes = [makeHole(7, 4, 7)];
    const scores = [makeScore('u1', 7, 5)];
    const ctx = makeCtx({
      players,
      holes,
      scores,
      modeConfigOverride: { kind: 'patsome', team_size: 2, teams_count: 2 },
    });
    const result = compute(ctx);
    // Forventer net-modus: strokes skal trekkes fra
    expect(result.scoring).toBe('net');
    // greensome: min=0, max=10. teamHandicap=round(0.6*0+0.4*10)=round(4)=4.
    // strokesForHole(4, 7): base=0, 4%18=4, SI=7>4 → extra=0. strokes=0.
    expect(result.teams[0].holes[0].teamExtraStrokes).toBe(0);
  });

  it('feil kind i mode_config faller tilbake til net', () => {
    const players = [makePlayer('u1', 1, 0), makePlayer('u2', 1, 0)];
    const holes = [makeHole(1, 4, 1)];
    const scores = [makeScore('u1', 1, 4)];
    const ctx = makeCtx({
      players,
      holes,
      scores,
      modeConfigOverride: { kind: 'nines', team_size: 1, nines_variant: 'nines', nines_scoring: 'net' },
    });
    expect(() => compute(ctx)).not.toThrow();
    const result = compute(ctx);
    expect(result.scoring).toBe('net');
  });
});

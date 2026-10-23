import { describe, it, expect } from 'vitest';
import { compute } from './texasScramble';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
  GameModeConfig,
} from './types';
import { buildUniformContext } from '@/lib/scoring/context/buildUniformContext';
import {
  HOLES_18,
  scoreRows,
  twoTeamRoster,
} from '../__fixtures__/withdrawnCaptain';

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
  modeConfig?: GameModeConfig;
}): ScoringContext {
  return {
    game: {
      id: 'g1',
      game_mode: 'texas_scramble',
      mode_config: opts.modeConfig ?? {
        kind: 'texas_scramble',
        team_size: 4,
        teams_count: 2,
        team_handicap_pct: 10,
      },
    },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

describe('texasScramble.compute — shape', () => {
  it('returnerer discriminated shape med kind=texas_scramble', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 25,
      },
    });
    const result = compute(ctx);
    expect(result.kind).toBe('texas_scramble');
    expect(result.teams).toHaveLength(1);
  });

  it('grupperer spillere på team_number, sortert stigende', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 2, flightNumber: 2, courseHandicap: 12 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 14 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 2,
        team_handicap_pct: 25,
      },
    });
    const result = compute(ctx);
    expect(result.teams.map((t) => t.teamNumber)).toEqual([1, 2]);
  });

  it('hopper over spillere uten team_number', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
        { userId: 'c', teamNumber: null, flightNumber: null, courseHandicap: 30 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 25,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].members.map((m) => m.userId).sort()).toEqual(['a', 'b']);
  });
});

describe('texasScramble.compute — captain-utvelging', () => {
  it('lexicographically minste userId per lag er kaptein', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'charlie', teamNumber: 1, flightNumber: 1, courseHandicap: 5 },
        { userId: 'alpha', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
        { userId: 'bravo', teamNumber: 1, flightNumber: 1, courseHandicap: 15 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 4, // Tillater 3 her for test-skyld; validator gater på 2|4
        teams_count: 1,
        team_handicap_pct: 10,
      },
    });
    const result = compute(ctx);
    const captain = result.teams[0].members.find((m) => m.isCaptain);
    expect(captain?.userId).toBe('alpha');
    const nonCaptains = result.teams[0].members.filter((m) => !m.isCaptain);
    expect(nonCaptains.map((m) => m.userId).sort()).toEqual(['bravo', 'charlie']);
  });

  it('leser scores fra kaptein-raden, ikke fra andre medlemmer', () => {
    // Kaptein = 'alpha' (lexicographically minste). Score 4 på hull 1 lagret
    // på alpha. Bravo har score 99 på hull 1 — skal IKKE telle for laget.
    const ctx = makeCtx({
      players: [
        { userId: 'alpha', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'bravo', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'alpha', holeNumber: 1, gross: 4 },
        { userId: 'bravo', holeNumber: 1, gross: 99 },
      ],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].holes[0].teamGross).toBe(4);
  });
});

describe('texasScramble.compute — lag-handicap', () => {
  it('combinedCourseHandicap = sum av medlemmers CH', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 15 },
        { userId: 'c', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
        { userId: 'd', teamNumber: 1, flightNumber: 1, courseHandicap: 25 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 4,
        teams_count: 1,
        team_handicap_pct: 10,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].combinedCourseHandicap).toBe(70);
  });

  it('teamHandicap = round(combinedCH × pct / 100) — NGF 4-mannslag 10%', () => {
    // 4-mannslag, CH 10+15+20+25 = 70, 10% → 7 (eksakt).
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 15 },
        { userId: 'c', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
        { userId: 'd', teamNumber: 1, flightNumber: 1, courseHandicap: 25 },
      ],
      holes: par4Holes(18),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 4,
        teams_count: 1,
        team_handicap_pct: 10,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].teamHandicap).toBe(7);
  });

  it('teamHandicap NGF 2-mannslag 25%', () => {
    // 2-mannslag, CH 12 + 20 = 32, 25% → 8.
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 12 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      ],
      holes: par4Holes(18),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 25,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].teamHandicap).toBe(8);
  });

  it('avrunder med Math.round (halvtall til nærmeste partall — JS standard)', () => {
    // 2-mannslag, CH 11 + 12 = 23, 25% → 5.75 → 6.
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 11 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 12 },
      ],
      holes: par4Holes(18),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 25,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].teamHandicap).toBe(6);
  });

  it('team_handicap_pct = 0 gir teamHandicap = 0 (gross-modus)', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 30 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 40 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].teamHandicap).toBe(0);
  });

  it('team_handicap_pct = 100 gir teamHandicap = combinedCH', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 100,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].teamHandicap).toBe(30);
  });
});

describe('texasScramble.compute — per-hull netto', () => {
  it('teamExtraStrokes fordeles på hardeste hull først via SI', () => {
    // teamHandicap = 5. Holes SI 1-18 fra par4Holes-helperen. Strokes på
    // SI 1-5 (én hver). Test første og siste hull.
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 25 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 25 },
      ],
      holes: par4Holes(18),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 10, // 50 × 10% = 5
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].teamHandicap).toBe(5);
    // SI 1 → 1 stroke, SI 18 → 0 strokes
    expect(result.teams[0].holes[0].teamExtraStrokes).toBe(1);
    expect(result.teams[0].holes[17].teamExtraStrokes).toBe(0);
  });

  it('teamNet = teamGross - teamExtraStrokes på spilte hull', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      ],
      holes: par4Holes(18),
      scores: [{ userId: 'a', holeNumber: 1, gross: 5 }], // 'a' er kaptein
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 25, // 20 × 25% = 5
      },
    });
    const result = compute(ctx);
    // teamHandicap=5, SI 1 hull har 1 ekstra slag
    expect(result.teams[0].holes[0].teamGross).toBe(5);
    expect(result.teams[0].holes[0].teamExtraStrokes).toBe(1);
    expect(result.teams[0].holes[0].teamNet).toBe(4);
  });

  it('teamNet er null når teamGross er null', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 25,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].holes[0].teamGross).toBeNull();
    expect(result.teams[0].holes[0].teamNet).toBeNull();
  });
});

describe('texasScramble.compute — totaler og missing', () => {
  it('totalNet summerer kun spilte hull', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(18),
      scores: [
        { userId: 'a', holeNumber: 1, gross: 4 },
        { userId: 'a', holeNumber: 2, gross: 5 },
        // Hull 3-18 mangler
      ],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 0, // gross
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].totalNet).toBe(9);
    expect(result.teams[0].totalGross).toBe(9);
    expect(result.teams[0].missingHoles).toHaveLength(16);
  });

  it('missingHoles tom når alle 18 hull er spilt', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(18),
      scores: Array.from({ length: 18 }, (_, i) => ({
        userId: 'a',
        holeNumber: i + 1,
        gross: 4,
      })),
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].totalNet).toBe(72);
    expect(result.teams[0].missingHoles).toEqual([]);
  });
});

describe('texasScramble.compute — ranking', () => {
  it('lavest totalNet rangeres først', () => {
    // 3 lag, alle spiller 18 hull. Lag 1: 72 netto. Lag 2: 75. Lag 3: 70.
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'c1', teamNumber: 3, flightNumber: 3, courseHandicap: 0 },
      { userId: 'c2', teamNumber: 3, flightNumber: 3, courseHandicap: 0 },
    ];
    // Captains: a1, b1, c1 (lex-min). Skriv scores på captains.
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push({ userId: 'a1', holeNumber: h, gross: 4 }); // 72 total
      scores.push({ userId: 'b1', holeNumber: h, gross: h === 1 ? 7 : 4 }); // 75
      scores.push({ userId: 'c1', holeNumber: h, gross: h === 1 ? 2 : 4 }); // 70
    }
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores,
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 3,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    const ranked = [...result.teams].sort((a, b) => a.rank - b.rank);
    expect(ranked.map((t) => t.teamNumber)).toEqual([3, 1, 2]);
    expect(ranked.map((t) => t.totalNet)).toEqual([70, 72, 75]);
    expect(ranked.map((t) => t.rank)).toEqual([1, 2, 3]);
  });

  it('tie-break-cascade: like total, lag som scorer best på back-9 vinner', () => {
    // Begge lag: 72 totalt. Lag 1 har 35 på front-9, 37 på back-9.
    // Lag 2 har 37 på front-9, 35 på back-9. Lag 2 vinner tie-break.
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      const lag1Score = h <= 9 ? (h === 1 ? 3 : 4) : (h === 10 ? 5 : 4);
      const lag2Score = h <= 9 ? (h === 1 ? 5 : 4) : (h === 10 ? 3 : 4);
      scores.push({ userId: 'a1', holeNumber: h, gross: lag1Score });
      scores.push({ userId: 'b1', holeNumber: h, gross: lag2Score });
    }
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores,
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 2,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    const team1 = result.teams.find((t) => t.teamNumber === 1)!;
    const team2 = result.teams.find((t) => t.teamNumber === 2)!;
    expect(team1.totalNet).toBe(72);
    expect(team2.totalNet).toBe(72);
    expect(team2.rank).toBe(1);
    expect(team1.rank).toBe(2);
  });
});

describe('texasScramble.compute — edge cases', () => {
  it('tomt lag (ingen spillere) returnerer ingen teams', () => {
    const ctx = makeCtx({
      players: [],
      holes: par4Holes(18),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 0,
        team_handicap_pct: 25,
      },
    });
    const result = compute(ctx);
    expect(result.teams).toEqual([]);
  });

  it('9-hulls bane fungerer (kun 9 hull i ctx.holes)', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(9),
      scores: Array.from({ length: 9 }, (_, i) => ({
        userId: 'a',
        holeNumber: i + 1,
        gross: 4,
      })),
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].holes).toHaveLength(9);
    expect(result.teams[0].totalNet).toBe(36);
    expect(result.teams[0].missingHoles).toEqual([]);
  });

  it('alle hull null gir totalNet 0 og missingHoles fylles', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(18),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].totalNet).toBe(0);
    expect(result.teams[0].missingHoles).toHaveLength(18);
  });

  it('members-array er sortert deterministisk (kaptein først, deretter lex)', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'charlie', teamNumber: 1, flightNumber: 1, courseHandicap: 5 },
        { userId: 'alpha', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
        { userId: 'delta', teamNumber: 1, flightNumber: 1, courseHandicap: 7 },
        { userId: 'bravo', teamNumber: 1, flightNumber: 1, courseHandicap: 12 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 4,
        teams_count: 1,
        team_handicap_pct: 10,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].members.map((m) => m.userId)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
    ]);
    expect(result.teams[0].members[0].isCaptain).toBe(true);
    expect(result.teams[0].members.slice(1).every((m) => !m.isCaptain)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-kjønn-par (#240). Texas-laget spiller én ball med felles scorekort —
// kapteinen (lexicographically minste userId) eier raden, og hans/hennes
// teeGender brukes som lag-referanse for par-display.
// ---------------------------------------------------------------------------

describe('texasScramble.compute — per-gender par (#240)', () => {
  it('hull-rad-par settes fra kapteinens teeGender (herre-kaptein)', () => {
    // Kaptein u1 (lex first) er herre, partner u2 er dame. par_mens=4,
    // par_ladies=5 → lag-radens par speiler kapteinen = 4.
    const ctx = makeCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'ladies' },
      ],
      holes: [
        { number: 1, par: 4, parByGender: { mens: 4, ladies: 5, juniors: 4 }, strokeIndex: 1 },
      ],
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 25,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].holes[0].par).toBe(4);
  });

  it('hull-rad-par bytter når kapteinen er dame', () => {
    // Kaptein u1 (lex first) er nå dame, partner u2 herre → par = 5.
    const ctx = makeCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'ladies' },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
      ],
      holes: [
        { number: 1, par: 4, parByGender: { mens: 4, ladies: 5, juniors: 4 }, strokeIndex: 1 },
      ],
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 25,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].holes[0].par).toBe(5);
  });

  it('faller tilbake til hole.par når parByGender ikke er satt', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: 25,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].holes[0].par).toBe(4);
  });
});

describe('texasScramble.compute — lag uten skår rangeres sist (#635)', () => {
  it('lag uten registrerte skår rangeres sist, ikke som vinner', () => {
    // Lag 1 spiller 18 hull (netto 72). Lag 2 har ingen skår.
    // Bug-en var at lag 2 sin tomme ranking-sum (0) tolkes som beste netto.
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push({ userId: 'a1', holeNumber: h, gross: 4 });
    }
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores,
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 2,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    const team1 = result.teams.find((t) => t.teamNumber === 1)!;
    const team2 = result.teams.find((t) => t.teamNumber === 2)!;
    expect(team1.rank).toBe(1);
    expect(team2.rank).toBe(2);
    // Vist total er upåvirket av padding (regnes fra faktiske skår).
    expect(team1.totalNet).toBe(72);
  });
});

// ---------------------------------------------------------------------------
// Rangert retur-rekkefølge (#1591 — samme kontrakt som patsome/team-stableford
// fikk i #1574). Gjelder også Ambrose og Florida scramble, som deler kjernen.
// ---------------------------------------------------------------------------

describe('texasScramble.compute — rangert retur-rekkefølge (#1591)', () => {
  it('returnerer teams i rangert rekkefølge, ikke teamNumber-rekkefølge', () => {
    // Lag 2 spiller bedre enn lag 1, så rank-rekkefølgen er motsatt av
    // teamNumber-rekkefølgen: podium/view kan plukke vinneren på indeks 0.
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
      { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    ];
    const scores: ScoringHoleScore[] = [];
    for (let h = 1; h <= 18; h++) {
      scores.push({ userId: 'a1', holeNumber: h, gross: 5 }); // 90 netto
      scores.push({ userId: 'b1', holeNumber: h, gross: 4 }); // 72 netto
    }
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores,
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 2,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    expect(result.teams.map((t) => t.teamNumber)).toEqual([2, 1]);
    expect(result.teams.map((t) => t.rank)).toEqual([1, 2]);
    expect(result.teams[0].totalNet).toBe(72);
  });
});

// #2067 — kapteinen sletter kontoen midt i runden. Raden trekkes (0174), og
// laget skal beholde hullene som er ført, samme lag-handicap og samme
// stilling. Gjennom `buildUniformContext`, slik tavla og resultatet gjør.
describe('texasScramble.compute — trukket kaptein (#2067)', () => {
  function resultFor(
    captainWithdrawn: boolean,
    scoresRows: ReturnType<typeof scoreRows>,
  ) {
    return compute(
      buildUniformContext({
        gameId: 'g1',
        gameMode: 'texas_scramble',
        modeConfig: {
          kind: 'texas_scramble',
          team_size: 2,
          teams_count: 2,
          team_handicap_pct: 25,
        },
        players: twoTeamRoster({ captainWithdrawn }),
        holesRows: HOLES_18,
        scoresRows,
      }),
    );
  }

  const FIRST_NINE = [...scoreRows('a', 1, 9, 4), ...scoreRows('c', 1, 9, 5)];

  it('beholder lagets 9 førte hull og samme stilling som før slettingen', () => {
    const before = resultFor(false, FIRST_NINE);
    const after = resultFor(true, FIRST_NINE);

    const team1 = after.teams.find((t) => t.teamNumber === 1)!;
    expect(team1.missingHoles).toStrictEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(team1.teamHandicap).toBe(8);
    expect(after).toStrictEqual(before);
  });

  it('teller hullene makkeren fører videre, og en retting slår den gamle verdien', () => {
    const after = resultFor(true, [
      ...FIRST_NINE,
      ...scoreRows('b', 10, 12, 5),
      { user_id: 'b', hole_number: 5, strokes: 6 },
    ]);

    const team1 = after.teams.find((t) => t.teamNumber === 1)!;
    expect(team1.holes.filter((h) => h.teamGross !== null)).toHaveLength(12);
    expect(team1.holes.find((h) => h.holeNumber === 5)!.teamGross).toBe(6);
    expect(team1.holes.find((h) => h.holeNumber === 11)!.teamGross).toBe(5);
    expect(team1.missingHoles).toStrictEqual([13, 14, 15, 16, 17, 18]);
  });
});

describe('texasScramble.compute — flere enn fire lag (#2148)', () => {
  it('ti lag à fire rangeres alle, med lag 5–10 like fullverdige som 1–4', () => {
    // Lag k har 72 + (10 - k) netto: lag 10 vinner, lag 1 er sist.
    const players: ScoringPlayer[] = [];
    const scores: ScoringHoleScore[] = [];
    for (let team = 1; team <= 10; team++) {
      for (let m = 0; m < 4; m++) {
        players.push({
          userId: `t${String(team).padStart(2, '0')}-${m}`,
          teamNumber: team,
          flightNumber: team,
          courseHandicap: 0,
        });
      }
      const captain = `t${String(team).padStart(2, '0')}-0`;
      for (let h = 1; h <= 18; h++) {
        scores.push({ userId: captain, holeNumber: h, gross: h === 1 ? 4 + (10 - team) : 4 });
      }
    }
    const ctx = makeCtx({
      players,
      holes: par4Holes(18),
      scores,
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 4,
        teams_count: 10,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    expect(result.teams).toHaveLength(10);
    const ranked = [...result.teams].sort((a, b) => a.rank - b.rank);
    expect(ranked.map((t) => t.teamNumber)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(ranked.map((t) => t.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ranked[0].totalNet).toBe(72);
    expect(ranked[9].totalNet).toBe(81);
  });
});

// #2569 — ujevne lag. Et lag på 3 i et 4-mannsspill får arrangørens prosent av
// SNITTET, ikke av summen regnet for fire. Lagret 20 % av summen = 80 % av
// snittet à 4 (#2009). Lag på 3 med 10/20/30: snitt 20 × 0,8 = 16.
describe('texasScramble.compute — ujevne lag (#2569)', () => {
  const FOUR_AND_THREE: ScoringPlayer[] = [
    { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
    { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
    { userId: 'a3', teamNumber: 1, flightNumber: 1, courseHandicap: 30 },
    { userId: 'a4', teamNumber: 1, flightNumber: 1, courseHandicap: 40 },
    { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 10 },
    { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 20 },
    { userId: 'b3', teamNumber: 2, flightNumber: 2, courseHandicap: 30 },
  ];
  const AT_FOUR_80_PCT_OF_AVERAGE: GameModeConfig = {
    kind: 'texas_scramble',
    team_size: 4,
    teams_count: 2,
    team_handicap_pct: 20,
  };

  it('lag på 4 (10/20/30/40) → 20, lag på 3 (10/20/30) → 16', () => {
    const result = compute(
      makeCtx({
        players: FOUR_AND_THREE,
        holes: par4Holes(18),
        scores: [],
        modeConfig: AT_FOUR_80_PCT_OF_AVERAGE,
      }),
    );
    const team = (n: number) => result.teams.find((t) => t.teamNumber === n)!;
    expect(team(1).combinedCourseHandicap).toBe(100);
    expect(team(1).teamHandicap).toBe(20);
    expect(team(2).combinedCourseHandicap).toBe(60);
    expect(team(2).teamHandicap).toBe(16);
  });

  it('det korte lagets slag fordeles på hullene fra 16, ikke 12', () => {
    const result = compute(
      makeCtx({
        players: FOUR_AND_THREE,
        holes: par4Holes(18),
        scores: [],
        modeConfig: AT_FOUR_80_PCT_OF_AVERAGE,
      }),
    );
    const short = result.teams.find((t) => t.teamNumber === 2)!;
    const strokes = short.holes.reduce((s, h) => s + h.teamExtraStrokes, 0);
    expect(strokes).toBe(16);
    // SI 1–16 får ett slag, SI 17–18 ingen.
    expect(short.holes.find((h) => h.strokeIndex === 16)!.teamExtraStrokes).toBe(1);
    expect(short.holes.find((h) => h.strokeIndex === 17)!.teamExtraStrokes).toBe(0);
  });

  it('NGF 10 % av summen à 4 gir laget på 3 40 % av snittet (8), ikke tabellens 15 % à 3 (9)', () => {
    const result = compute(
      makeCtx({
        players: FOUR_AND_THREE,
        holes: par4Holes(18),
        scores: [],
        modeConfig: { ...AT_FOUR_80_PCT_OF_AVERAGE, team_handicap_pct: 10 },
      }),
    );
    expect(result.teams.find((t) => t.teamNumber === 1)!.teamHandicap).toBe(10);
    expect(result.teams.find((t) => t.teamNumber === 2)!.teamHandicap).toBe(8);
  });

  it('et trukket medlem som blir stående på laget (#2067) teller i lagstørrelsen som før', () => {
    // Kaptein a trekkes midt i runden på et 2-mannslag; laget regnes fortsatt
    // som to: CH 10 + 20 = 30 × 25 % = 7,5 → 8. Som ett lag på én ville det
    // blitt 30 × 25 × 2 ÷ 100 = 15.
    const result = compute(
      buildUniformContext({
        gameId: 'g1',
        gameMode: 'texas_scramble',
        modeConfig: {
          kind: 'texas_scramble',
          team_size: 2,
          teams_count: 2,
          team_handicap_pct: 25,
        },
        players: twoTeamRoster({ captainWithdrawn: true }),
        holesRows: HOLES_18,
        scoresRows: [],
      }),
    );
    expect(result.teams.find((t) => t.teamNumber === 1)!.teamHandicap).toBe(8);
  });
});

describe('texasScramble.compute — ranking: net_to_par (#2625)', () => {
  // #2625: new team strokeplay games carry `ranking: 'net_to_par'` in
  // mode_config. During the round a team that has played fewer holes is no
  // longer ranked ahead on its smaller sum: teams rank on strokes against par
  // over the holes each has played. Games without the flag keep today's rule.
  const PLAIN: GameModeConfig = {
    kind: 'texas_scramble',
    team_size: 2,
    teams_count: 2,
    team_handicap_pct: 0,
  };
  const FLAGGED = { ...PLAIN, ranking: 'net_to_par' } as GameModeConfig;

  const players: ScoringPlayer[] = [
    { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
    { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
    { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
    { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 0 },
  ];

  /** Captain rows: gross per hole number, in order from hole 1. */
  function captainCard(userId: string, gross: number[]): ScoringHoleScore[] {
    return gross.map((g, i) => ({ userId, holeNumber: i + 1, gross: g }));
  }

  // The issue's example (21.10, staging): Lag 1 net 7 after 3 holes (−5),
  // Lag 2 net 17 after 6 holes (−7). Par 4 everywhere.
  const issueExample = {
    players,
    holes: par4Holes(18),
    scores: [...captainCard('a1', [2, 2, 3]), ...captainCard('b1', [3, 3, 3, 3, 3, 2])],
  };

  it('the issue example: Lag 2 (−7 after 6) ranks ahead of Lag 1 (−5 after 3) with the flag', () => {
    const result = compute(makeCtx({ ...issueExample, modeConfig: FLAGGED }));
    expect(result.teams.map((t) => [t.teamNumber, t.rank, t.toPar, t.totalNet])).toEqual([
      [2, 1, -7, 17],
      [1, 2, -5, 7],
    ]);
    expect(result.ranking).toBe('net_to_par');
  });

  it('without the flag the same round keeps today’s order (Lag 1 on the lower sum)', () => {
    const result = compute(makeCtx({ ...issueExample, modeConfig: PLAIN }));
    expect(
      result.teams.map(({ teamNumber, rank, tiedWith, decidedBy, totalNet, totalGross }) => ({
        teamNumber,
        rank,
        tiedWith,
        decidedBy,
        totalNet,
        totalGross,
      })),
    ).toEqual([
      { teamNumber: 1, rank: 1, tiedWith: [], decidedBy: null, totalNet: 7, totalGross: 7 },
      { teamNumber: 2, rank: 2, tiedWith: [], decidedBy: 'total', totalNet: 17, totalGross: 17 },
    ]);
    expect(result.ranking).toBe('net_total');
  });

  it('toPar is Σ (teamNet − par) over played holes, null without a hole, also without the flag', () => {
    // Team handicap 4 (CH 8 + 8 = 16 × 25 %) → one stroke on SI 1–4. Holes 1,
    // 2 and 5 played, 3 and 4 skipped: net 4, 3, 5 against par 4 → 0, −1, +1.
    const result = compute(
      makeCtx({
        players: players.map((p) => ({ ...p, courseHandicap: 8 })),
        holes: par4Holes(18),
        scores: [
          { userId: 'a1', holeNumber: 1, gross: 5 },
          { userId: 'a1', holeNumber: 2, gross: 4 },
          { userId: 'a1', holeNumber: 5, gross: 5 },
        ],
        modeConfig: { ...PLAIN, team_handicap_pct: 25 },
      }),
    );
    expect(result.teams.find((t) => t.teamNumber === 1)!.toPar).toBe(0);
    expect(result.teams.find((t) => t.teamNumber === 2)!.toPar).toBeNull();
  });

  it('a team without a single hole still ranks last with the flag (#635)', () => {
    const result = compute(
      makeCtx({
        players,
        holes: par4Holes(18),
        scores: captainCard('a1', [6, 6, 6]),
        modeConfig: FLAGGED,
      }),
    );
    expect(result.teams.map((t) => [t.teamNumber, t.rank, t.toPar])).toEqual([
      [1, 1, 6],
      [2, 2, null],
    ]);
  });

  it('a finished round with the same par for everyone ranks the same with and without the flag', () => {
    // Every team plays all 18 holes on par 4: Σ (net − par) is the sum minus
    // 72, and every tie-break tier shifts by the same constant. Teams 2 and 3
    // have the same card, so the property covers a shared rank too.
    const grossFor = (seed: number, hole: number) => 3 + ((seed * 7 + hole * 5) % 4);
    const fieldPlayers: ScoringPlayer[] = [1, 2, 3, 4].flatMap((team) => [
      { userId: `t${team}a`, teamNumber: team, flightNumber: team, courseHandicap: 0 },
      { userId: `t${team}b`, teamNumber: team, flightNumber: team, courseHandicap: 0 },
    ]);
    const seeds: Record<number, number> = { 1: 1, 2: 2, 3: 2, 4: 5 };
    const opts = {
      players: fieldPlayers,
      holes: par4Holes(18),
      scores: [1, 2, 3, 4].flatMap((team) =>
        captainCard(
          `t${team}a`,
          Array.from({ length: 18 }, (_, i) => grossFor(seeds[team], i + 1)),
        ),
      ),
    };
    const shape = (r: ReturnType<typeof compute>) =>
      r.teams.map(({ teamNumber, rank, tiedWith, decidedBy }) => ({ teamNumber, rank, tiedWith, decidedBy }));

    const withFlag = shape(compute(makeCtx({ ...opts, modeConfig: FLAGGED })));
    expect(withFlag).toEqual(shape(compute(makeCtx({ ...opts, modeConfig: PLAIN }))));
    expect(withFlag.find((t) => t.teamNumber === 2)!.tiedWith).toEqual([3]);
  });
});

describe('texasScramble.compute — net_to_par tie-break on a part-played round (#2625)', () => {
  // The tie-break tiers (back 9, back 6, back 3, hole 18) read par per hole
  // with the flag, and an unplayed hole counts as par. Mixed pars (a real
  // card) and teams in different places on the course, so the sum and the
  // to-par rule disagree and every tier is exercised. Ambrose and Florida run
  // the same core (`computeScramble`).
  const PARS = [5, 3, 4, 4, 4, 3, 5, 3, 4, 5, 4, 4, 3, 4, 5, 4, 4, 4];
  const holes: ScoringHole[] = PARS.map((par, i) => ({ number: i + 1, par, strokeIndex: i + 1 }));
  const players: ScoringPlayer[] = [1, 2, 3, 4, 5].flatMap((team) => [
    { userId: `t${team}a`, teamNumber: team, flightNumber: team, courseHandicap: 0 },
    { userId: `t${team}b`, teamNumber: team, flightNumber: team, courseHandicap: 0 },
  ]);
  /** Captain rows from `from`: par + delta per hole. */
  const card = (team: number, from: number, deltas: number[]): ScoringHoleScore[] =>
    deltas.map((d, i) => ({ userId: `t${team}a`, holeNumber: from + i, gross: PARS[from + i - 1] + d }));
  const scores = [
    ...card(1, 1, [1, 0, 0, 0, 0]), // +1 after holes 1–5
    ...card(2, 1, [0, 0, 0, 0, 0, 0, 0, 0, -1]), // −1 after holes 1–9
    ...card(3, 10, [1, 0, 0]), // +1 after holes 10–12: worse on the back nine
    ...card(4, 1, [1, -1]), // E after holes 1–2
    ...card(5, 1, [0, 0, 0]), // E after holes 1–3: shares the place with team 4
  ];
  const FLAGGED = {
    kind: 'texas_scramble',
    team_size: 2,
    teams_count: 5,
    team_handicap_pct: 0,
    ranking: 'net_to_par',
  } as GameModeConfig;

  it('ranks on to par, shares the place at E, and splits +1 on the back nine', () => {
    const result = compute(makeCtx({ players, holes, scores, modeConfig: FLAGGED }));
    expect(
      result.teams.map((t) => [t.teamNumber, t.toPar, t.rank, t.tiedWith, t.decidedBy]),
    ).toEqual([
      [2, -1, 1, [], null],
      [4, 0, 2, [5], 'total'],
      [5, 0, 2, [4], null],
      [1, 1, 4, [], 'total'],
      [3, 1, 5, [], 'back9'],
    ]);
  });
});

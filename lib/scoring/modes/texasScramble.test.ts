import { describe, it, expect } from 'vitest';
import { compute } from './texasScramble';
import type {
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
  ScoringHoleScore,
  GameModeConfig,
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

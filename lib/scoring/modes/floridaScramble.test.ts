import { describe, it, expect } from 'vitest';
import { compute, defaultFloridaHandicapPct } from './floridaScramble';
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
  modeConfig: GameModeConfig;
}): ScoringContext {
  return {
    game: { id: 'g1', game_mode: 'florida_scramble', mode_config: opts.modeConfig },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

// ---------------------------------------------------------------------------
// NGF-fasttabell: 3-mannslag 15 %, 4-mannslag 10 % (fast, ikke formul-basert).
// ---------------------------------------------------------------------------

describe('defaultFloridaHandicapPct — NGF-fasttabell', () => {
  it('3-mannslag → 15 %', () => {
    expect(defaultFloridaHandicapPct(3)).toBe(15);
  });

  it('4-mannslag → 10 %', () => {
    expect(defaultFloridaHandicapPct(4)).toBe(10);
  });
});

describe('florida.compute — gjenbruker scramble-motoren', () => {
  it('returnerer kind: texas_scramble (gjenbruk av leaderboard/podium/mail)', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 12 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 16 },
        { userId: 'c', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: {
        kind: 'florida_scramble',
        team_size: 3,
        teams_count: 1,
        team_handicap_pct: 15,
      },
    });
    const result = compute(ctx);
    expect(result.kind).toBe('texas_scramble');
    expect(result.teams).toHaveLength(1);
  });

  it('3-mannslag: combinedCH 48 @ 15 % → teamHandicap 7', () => {
    // CH 12+16+20 = 48. Florida 3-mann @ 15 % → round(7.2) = 7.
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 12 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 16 },
        { userId: 'c', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      ],
      holes: par4Holes(18),
      scores: [],
      modeConfig: {
        kind: 'florida_scramble',
        team_size: 3,
        teams_count: 1,
        team_handicap_pct: defaultFloridaHandicapPct(3),
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].combinedCourseHandicap).toBe(48);
    expect(result.teams[0].teamHandicap).toBe(7);
  });

  it('4-mannslag: combinedCH 70 @ 10 % → teamHandicap 7', () => {
    // CH 10+15+20+25 = 70. Florida 4-mann @ 10 % → round(7) = 7.
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
        kind: 'florida_scramble',
        team_size: 4,
        teams_count: 1,
        team_handicap_pct: defaultFloridaHandicapPct(4),
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].combinedCourseHandicap).toBe(70);
    expect(result.teams[0].teamHandicap).toBe(7);
  });

  it('defensiv fallback: feil kind → pct 0 (brutto-scramble)', () => {
    // Gir ambrose-config mens mode er florida — skal falle tilbake til 0.
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 30 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 40 },
        { userId: 'c', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      ],
      holes: par4Holes(1),
      scores: [],
      // Deliberate wrong kind to test defensive fallback
      modeConfig: { kind: 'ambrose', team_size: 2, teams_count: 1, team_handicap_pct: 50 },
    });
    const result = compute(ctx);
    expect(result.teams[0].teamHandicap).toBe(0);
  });

  it('leser scores fra kaptein-raden (delt lag-scorekort, som Texas)', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'alpha', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'bravo', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
        { userId: 'charlie', teamNumber: 1, flightNumber: 1, courseHandicap: 0 },
      ],
      holes: par4Holes(1),
      scores: [
        { userId: 'alpha', holeNumber: 1, gross: 4 },
        { userId: 'bravo', holeNumber: 1, gross: 99 },
        { userId: 'charlie', holeNumber: 1, gross: 99 },
      ],
      modeConfig: {
        kind: 'florida_scramble',
        team_size: 3,
        teams_count: 1,
        team_handicap_pct: 0,
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].holes[0].teamGross).toBe(4);
  });
});

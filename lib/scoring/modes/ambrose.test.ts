import { describe, it, expect } from 'vitest';
import { compute, ambroseDefaultPct } from './ambrose';
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
    game: { id: 'g1', game_mode: 'ambrose', mode_config: opts.modeConfig },
    players: opts.players,
    holes: opts.holes,
    scores: opts.scores,
  };
}

// ---------------------------------------------------------------------------
// Standard Ambrose-formel: lag-handicap = summen av spille-HCP ÷ (2 × lag-
// størrelse). 2-spiller ÷4 (25 %), 4-spiller ÷8 (12,5 %). Bekreftet mot flere
// golf-kilder; issue-teksten oppga ÷4/÷6 feil. Bruker valgte standard-formelen.
// ---------------------------------------------------------------------------

describe('ambroseDefaultPct — standard Ambrose (÷ 2×lagstørrelse)', () => {
  it('2-spiller-lag → 25 % (combined ÷ 4)', () => {
    expect(ambroseDefaultPct(2)).toBe(25);
  });

  it('4-spiller-lag → 12,5 % (combined ÷ 8)', () => {
    expect(ambroseDefaultPct(4)).toBe(12.5);
  });
});

describe('ambrose.compute — gjenbruker scramble-motoren', () => {
  it('returnerer kind: texas_scramble (gjenbruk av leaderboard/podium/mail)', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 12 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: { kind: 'ambrose', team_size: 2, teams_count: 1, team_handicap_pct: 25 },
    });
    const result = compute(ctx);
    expect(result.kind).toBe('texas_scramble');
    expect(result.teams).toHaveLength(1);
  });

  it('4-spiller-lag: combinedCH 74 @ 12,5 % → teamHandicap 9 (= ÷8)', () => {
    // CH 8+14+22+30 = 74. Ambrose 4-mann default 12,5 % → round(9,25) = 9.
    // Identisk med den kanoniske ÷8-divisjonen (74/8 = 9,25 → 9).
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 8 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 14 },
        { userId: 'c', teamNumber: 1, flightNumber: 1, courseHandicap: 22 },
        { userId: 'd', teamNumber: 1, flightNumber: 1, courseHandicap: 30 },
      ],
      holes: par4Holes(18),
      scores: [],
      modeConfig: {
        kind: 'ambrose',
        team_size: 4,
        teams_count: 1,
        team_handicap_pct: ambroseDefaultPct(4),
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].combinedCourseHandicap).toBe(74);
    expect(result.teams[0].teamHandicap).toBe(9);
  });

  it('2-spiller-lag: combinedCH 32 @ 25 % → teamHandicap 8 (= ÷4)', () => {
    // CH 12+20 = 32, 25 % → 8. Identisk med ÷4 (32/4 = 8).
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 12 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
      ],
      holes: par4Holes(18),
      scores: [],
      modeConfig: {
        kind: 'ambrose',
        team_size: 2,
        teams_count: 1,
        team_handicap_pct: ambroseDefaultPct(2),
      },
    });
    const result = compute(ctx);
    expect(result.teams[0].teamHandicap).toBe(8);
  });

  it('justerbar: admin kan overstyre til 0 % (brutto-scramble)', () => {
    const ctx = makeCtx({
      players: [
        { userId: 'a', teamNumber: 1, flightNumber: 1, courseHandicap: 30 },
        { userId: 'b', teamNumber: 1, flightNumber: 1, courseHandicap: 40 },
      ],
      holes: par4Holes(1),
      scores: [],
      modeConfig: { kind: 'ambrose', team_size: 2, teams_count: 1, team_handicap_pct: 0 },
    });
    const result = compute(ctx);
    expect(result.teams[0].teamHandicap).toBe(0);
  });

  it('leser scores fra kaptein-raden (delt lag-scorekort, som Texas)', () => {
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
      modeConfig: { kind: 'ambrose', team_size: 2, teams_count: 1, team_handicap_pct: 0 },
    });
    const result = compute(ctx);
    expect(result.teams[0].holes[0].teamGross).toBe(4);
  });
});

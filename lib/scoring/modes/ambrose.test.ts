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

// #2569 — ujevne lag. Default à 4 er 12,5 % av summen = 50 % av snittet. Laget
// på 3 får samme 50 % av snittet, altså nøyaktig Ambrose-regelen for 3
// (`ambroseDefaultPct(3)` = 16,67 % av summen): CH 10/20/30 = 60 → 10.
describe('ambrose.compute — ujevne lag (#2569)', () => {
  it('lag på 3 i et 4-mannsspill får Ambrose-regelen for 3 (÷ 6)', () => {
    const result = compute(
      makeCtx({
        players: [
          { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: 10 },
          { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: 20 },
          { userId: 'a3', teamNumber: 1, flightNumber: 1, courseHandicap: 30 },
          { userId: 'a4', teamNumber: 1, flightNumber: 1, courseHandicap: 40 },
          { userId: 'b1', teamNumber: 2, flightNumber: 2, courseHandicap: 10 },
          { userId: 'b2', teamNumber: 2, flightNumber: 2, courseHandicap: 20 },
          { userId: 'b3', teamNumber: 2, flightNumber: 2, courseHandicap: 30 },
        ],
        holes: par4Holes(18),
        scores: [],
        modeConfig: {
          kind: 'ambrose',
          team_size: 4,
          teams_count: 2,
          team_handicap_pct: ambroseDefaultPct(4),
        },
      }),
    );
    // Lag på 4: 100 × 12,5 % = 12,5 → 13 (som før). Lag på 3: 60 ÷ 6 = 10.
    expect(result.teams.find((t) => t.teamNumber === 1)!.teamHandicap).toBe(13);
    expect(result.teams.find((t) => t.teamNumber === 2)!.teamHandicap).toBe(
      Math.round((60 * ambroseDefaultPct(3)) / 100),
    );
    expect(result.teams.find((t) => t.teamNumber === 2)!.teamHandicap).toBe(10);
  });
});

describe('ambrose.compute — ranking: net_to_par (#2625)', () => {
  it('inherits the net-to-par ranking from the shared scramble core', () => {
    // The issue's example: team 1 net 7 after 3 holes (−5), team 2 net 17
    // after 6 holes (−7). With the flag team 2 leads; without it team 1 does.
    const players: ScoringPlayer[] = [1, 2].flatMap((team) =>
      Array.from({ length: 2 }, (_, i) => ({
        userId: `t${team}${i}`,
        teamNumber: team,
        flightNumber: team,
        courseHandicap: 0,
      })),
    );
    const card = (userId: string, gross: number[]): ScoringHoleScore[] =>
      gross.map((g, i) => ({ userId, holeNumber: i + 1, gross: g }));
    const scores = [...card('t10', [2, 2, 3]), ...card('t20', [3, 3, 3, 3, 3, 2])];
    const base = { kind: 'ambrose', team_size: 2, teams_count: 2, team_handicap_pct: 0 } as GameModeConfig;
    const order = (modeConfig: GameModeConfig) =>
      compute(makeCtx({ players, holes: par4Holes(18), scores, modeConfig })).teams.map((t) => [
        t.teamNumber,
        t.rank,
        t.toPar,
      ]);

    expect(order({ ...base, ranking: 'net_to_par' } as GameModeConfig)).toEqual([
      [2, 1, -7],
      [1, 2, -5],
    ]);
    expect(order(base)).toEqual([
      [1, 1, -5],
      [2, 2, -7],
    ]);
  });
});

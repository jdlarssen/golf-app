import { describe, it, expect } from 'vitest';
import { netScore, bestBallForHole, teamTotal, compute } from './bestBall';
import type { ScoringContext } from './types';

describe('netScore', () => {
  it('subtracts strokes from gross', () => {
    expect(netScore({ gross: 6, extraStrokes: 2 })).toBe(4);
  });
  it('returns null for missing gross', () => {
    expect(netScore({ gross: null, extraStrokes: 1 })).toBeNull();
  });
  it('handles negative extra strokes (plus golfer)', () => {
    expect(netScore({ gross: 4, extraStrokes: -1 })).toBe(5);
  });
});

describe('bestBallForHole', () => {
  it('returns min of two net scores', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: 6, extraStrokes: 2 },
      { userId: 'b', gross: 5, extraStrokes: 1 },
    ]);
    expect(r.teamNet).toBe(4);
    expect(r.contributors.sort()).toEqual(['a', 'b']);
  });

  it('picks the lower one', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: 7, extraStrokes: 1 },
      { userId: 'b', gross: 5, extraStrokes: 1 },
    ]);
    expect(r.teamNet).toBe(4);
    expect(r.contributors).toEqual(['b']);
  });

  it('handles one missing player', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: null, extraStrokes: 1 },
      { userId: 'b', gross: 5, extraStrokes: 1 },
    ]);
    expect(r.teamNet).toBe(4);
    expect(r.contributors).toEqual(['b']);
  });

  it('returns null teamNet when both missing', () => {
    const r = bestBallForHole([
      { userId: 'a', gross: null, extraStrokes: 1 },
      { userId: 'b', gross: null, extraStrokes: 1 },
    ]);
    expect(r.teamNet).toBeNull();
    expect(r.contributors).toEqual([]);
  });
});

describe('teamTotal', () => {
  it('sums all holes', () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, teamNet: 4 }));
    expect(teamTotal(holes)).toEqual({ total: 72, missingHoles: [] });
  });
  it('tracks missing holes', () => {
    const holes = [
      { holeNumber: 1, teamNet: 4 },
      { holeNumber: 2, teamNet: null },
    ];
    expect(teamTotal(holes)).toEqual({ total: 4, missingHoles: [2] });
  });
  it('returns partial total when some holes are missing', () => {
    const holes = [
      { holeNumber: 1, teamNet: 4 },
      { holeNumber: 2, teamNet: null },
      { holeNumber: 3, teamNet: 3 },
    ];
    const result = teamTotal(holes);
    expect(result.total).toBe(7);  // 4 + 3, partial — caller must check missingHoles
    expect(result.missingHoles).toEqual([2]);
  });
});

// ---------------------------------------------------------------------------
// Per-kjønn-par (#240). Når hull har `parByGender` settes, leser scoring-
// laget par via `parFor(hole, player.teeGender)` per spiller — slik at
// `BestBallPlayerCell.par` bærer riktig referanse for UI-rendering.
// ---------------------------------------------------------------------------

describe('compute — per-gender par (#240)', () => {
  it('bærer riktig par per BestBallPlayerCell for blandet-kjønn-lag', () => {
    // Lag 1 har én herre (u1, par_mens=4) og én dame (u2, par_ladies=5).
    // Begge gross=5, CH=0. Per-spiller-par skal reflektere teeGender.
    const ctx: ScoringContext = {
      game: {
        id: 'g1',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
      },
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'ladies' },
      ],
      holes: [{ number: 1, par: 4, parByGender: { mens: 4, ladies: 5, juniors: 4 }, strokeIndex: 1 }],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
      ],
    };
    const result = compute(ctx);
    if (result.kind !== 'best_ball') throw new Error('expected best_ball');
    const team1 = result.teams[0];
    const cell1 = team1.holes[0].players.find((p) => p.userId === 'u1');
    const cell2 = team1.holes[0].players.find((p) => p.userId === 'u2');
    expect(cell1?.par).toBe(4);
    expect(cell2?.par).toBe(5);
  });

  it('faller tilbake til hole.par når parByGender ikke er satt', () => {
    // Backward-compat: eksisterende fixtures uten parByGender/teeGender
    // skal fortsatt få hole.par.
    const ctx: ScoringContext = {
      game: {
        id: 'g1',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
      },
      players: [{ userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0 }],
      holes: [{ number: 1, par: 4, strokeIndex: 1 }],
      scores: [{ userId: 'u1', holeNumber: 1, gross: 4 }],
    };
    const result = compute(ctx);
    if (result.kind !== 'best_ball') throw new Error('expected best_ball');
    expect(result.teams[0].holes[0].players[0].par).toBe(4);
  });

  it('BestBallHoleRow.par bruker første medlem som lag-representant', () => {
    // Damer først i player-listen → teamPar fra parByGender.ladies (5).
    const ctx: ScoringContext = {
      game: {
        id: 'g1',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
      },
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'ladies' },
        { userId: 'u2', teamNumber: 1, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
      ],
      holes: [{ number: 1, par: 4, parByGender: { mens: 4, ladies: 5, juniors: 4 }, strokeIndex: 1 }],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u2', holeNumber: 1, gross: 5 },
      ],
    };
    const result = compute(ctx);
    if (result.kind !== 'best_ball') throw new Error('expected best_ball');
    expect(result.teams[0].holes[0].par).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// WD / «trekk spiller» (#386): best-ball med redusert lag-størrelse.
//
// Leaderboard-siden filtrerer ut trukne spillere FØR ctx bygges, så
// `compute()` mottar aldri withdrawn players direkte. Disse testene verifiserer
// at scoring-laget håndterer 1-manns-lag riktig (bruker det ene
// medlemmets netto), og at et lag med null members (begge trukket)
// ikke dukker opp i resultatet.
// ---------------------------------------------------------------------------

describe('compute — WD-scenario: redusert lag-størrelse (#386)', () => {
  it('ranker 1-manns-lag korrekt (bruker eneste members netto)', () => {
    // Lag 1: u1 alene (u2 er filtrert ut som WD), CH=10, SI=1 → 1 ekstra slag
    // Lag 2: u3 + u4, begge CH=0
    // Lag 1: gross 5 - 1 = netto 4; Lag 2: gross 5 - 0 = netto 5 (begge).
    // Forventet: Lag 1 vinner (4 < 5).
    const ctx: ScoringContext = {
      game: {
        id: 'g1',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 2 },
      },
      players: [
        { userId: 'u1', teamNumber: 1, flightNumber: 1, courseHandicap: 10, teeGender: 'mens' },
        { userId: 'u3', teamNumber: 2, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
        { userId: 'u4', teamNumber: 2, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
      ],
      holes: [{ number: 1, par: 4, strokeIndex: 1 }],
      scores: [
        { userId: 'u1', holeNumber: 1, gross: 5 },
        { userId: 'u3', holeNumber: 1, gross: 5 },
        { userId: 'u4', holeNumber: 1, gross: 5 },
      ],
    };
    const result = compute(ctx);
    if (result.kind !== 'best_ball') throw new Error('expected best_ball');
    expect(result.teams).toHaveLength(2);
    const team1 = result.teams.find((t) => t.teamNumber === 1);
    const team2 = result.teams.find((t) => t.teamNumber === 2);
    expect(team1?.holes[0].teamNet).toBe(4);
    expect(team2?.holes[0].teamNet).toBe(5);
    expect(team1?.rank).toBe(1);
    expect(team2?.rank).toBe(2);
  });

  it('utelater lag med null members (begge WD-filtrert)', () => {
    // Kun Lag 2 har gjenværende spillere etter WD-filtrering.
    const ctx: ScoringContext = {
      game: {
        id: 'g1',
        game_mode: 'best_ball',
        mode_config: { kind: 'best_ball', team_size: 2, teams_count: 2 },
      },
      players: [
        // Lag 1 har ingen spillere (begge filtrert som WD)
        { userId: 'u3', teamNumber: 2, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
        { userId: 'u4', teamNumber: 2, flightNumber: 1, courseHandicap: 0, teeGender: 'mens' },
      ],
      holes: [{ number: 1, par: 4, strokeIndex: 1 }],
      scores: [
        { userId: 'u3', holeNumber: 1, gross: 4 },
        { userId: 'u4', holeNumber: 1, gross: 5 },
      ],
    };
    const result = compute(ctx);
    if (result.kind !== 'best_ball') throw new Error('expected best_ball');
    // Only team 2 appears — team 1 has no members and is never built.
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0].teamNumber).toBe(2);
  });
});

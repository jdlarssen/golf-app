import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from '@/lib/scoring';
import { strokesForHole } from './strokeAllocation';
import { alternateShotSideExtras, playerStrokeHandicap } from './allocatedStrokes';
import type {
  GameMode,
  GameModeConfig,
  ModeResult,
  ScoringContext,
  ScoringHole,
  ScoringPlayer,
} from './modes/types';

// #2218: the hole page, the scorecard and the app used to hand out strokes from
// the raw frozen course handicap while the engines applied allowance or gross.
// These tests bind the one shared rule (`allocatedStrokes.ts`) to the REAL
// engines: if an engine changes how it reads allowance or gross, the matching
// row goes red here instead of the card drifting from the leaderboard.

const HOLES: ScoringHole[] = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: 4,
  strokeIndex: i + 1,
}));

const GROSS = 5;

const CH: Record<string, number> = { p1: 20, p2: 10, p3: 4, p4: 8 };

type Grouping = 'sides' | 'slots' | 'solo' | 'one-team' | 'singles';

function playersFor(grouping: Grouping): ScoringPlayer[] {
  const ids = grouping === 'singles' ? ['p1', 'p3'] : ['p1', 'p2', 'p3', 'p4'];
  return ids.map((userId, i) => {
    let teamNumber: number | null;
    switch (grouping) {
      case 'sides':
        teamNumber = i < 2 ? 1 : 2;
        break;
      case 'singles':
        teamNumber = i + 1;
        break;
      case 'slots':
        teamNumber = i + 1;
        break;
      case 'one-team':
        teamNumber = 1;
        break;
      case 'solo':
        teamNumber = null;
        break;
    }
    return { userId, teamNumber, flightNumber: 1, courseHandicap: CH[userId] };
  });
}

function ctxFor(mode: GameMode, config: GameModeConfig, grouping: Grouping): ScoringContext {
  const players = playersFor(grouping);
  return {
    game: { id: 'g-2218', game_mode: mode, mode_config: config },
    players,
    holes: HOLES,
    scores: players.flatMap((p) =>
      HOLES.map((h) => ({ userId: p.userId, holeNumber: h.number, gross: GROSS })),
    ),
  };
}

interface Cell {
  userId: string;
  strokeIndex: number;
  gross: number | null;
  effective: number | null;
}

/** Every per-player cell the engine exposes, with the score it actually counted. */
function cellsOf(result: ModeResult): Cell[] {
  switch (result.kind) {
    case 'fourball_matchplay':
    case 'round_robin':
      return result.holes.flatMap((h) =>
        [...h.side1Players, ...h.side2Players].map((c) => ({
          userId: c.userId,
          strokeIndex: h.strokeIndex,
          gross: c.gross,
          effective: c.net,
        })),
      );
    case 'wolf':
      return result.holes.flatMap((h) =>
        h.players.map((c) => ({
          userId: c.userId,
          strokeIndex: h.strokeIndex,
          gross: c.gross,
          effective: c.effectiveScore,
        })),
      );
    case 'nassau':
      return result.holes.flatMap((h) =>
        h.perPlayer.map((c) => ({
          userId: c.userId,
          strokeIndex: h.strokeIndex,
          gross: c.gross,
          effective: c.effective,
        })),
      );
    case 'skins':
    case 'nines':
    case 'acey_deucey':
      return result.holes.flatMap((h) =>
        h.perPlayer.map((c) => ({
          userId: c.userId,
          strokeIndex: h.strokeIndex,
          gross: c.gross,
          effective: c.effectiveScore,
        })),
      );
    case 'shamble':
      return result.holes.flatMap((h) =>
        h.teams.flatMap((t) =>
          t.perPlayer.map((c) => ({
            userId: c.userId,
            strokeIndex: h.strokeIndex,
            gross: c.gross,
            effective: c.effectiveScore,
          })),
        ),
      );
    case 'patsome':
      // Only the 4BBB segment (holes 1–6) has per-player cells; the 1-ball
      // segments carry team strokes, which this helper does not own.
      return result.teams.flatMap((t) =>
        t.holes.flatMap((h) =>
          h.players.map((c) => ({
            userId: c.userId,
            strokeIndex: h.strokeIndex,
            gross: c.gross,
            effective: c.netStrokes,
          })),
        ),
      );
    case 'solo_strokeplay':
      return result.holes.flatMap((h) =>
        h.perPlayer.map((c) => ({
          userId: c.userId,
          strokeIndex: h.strokeIndex,
          gross: c.gross,
          effective: c.net,
        })),
      );
    case 'singles_matchplay': {
      const [side1, side2] = result.sides;
      return result.holes.flatMap((h) => [
        { userId: side1.userId, strokeIndex: h.strokeIndex, gross: h.side1Gross, effective: h.side1Net },
        { userId: side2.userId, strokeIndex: h.strokeIndex, gross: h.side2Gross, effective: h.side2Net },
      ]);
    }
    default:
      throw new Error(`no per-player cells mapped for result kind ${result.kind}`);
  }
}

/** A config without its allowance field — draft state / DB default `{}`-shaped rows. */
function withoutField(config: Record<string, unknown>, field: string): GameModeConfig {
  const copy = { ...config };
  delete copy[field];
  return copy as unknown as GameModeConfig;
}

const FOURBALL = { kind: 'fourball_matchplay', team_size: 2, teams_count: 2 } as const;
const ROUND_ROBIN = { kind: 'round_robin', team_size: 1, teams_count: 4 } as const;

const PARITY_ROWS: Array<{
  label: string;
  mode: GameMode;
  config: GameModeConfig;
  grouping: Grouping;
}> = [
  { label: 'fourball 85 %', mode: 'fourball_matchplay', config: { ...FOURBALL, allowance_pct: 85 }, grouping: 'sides' },
  { label: 'fourball 0 %', mode: 'fourball_matchplay', config: { ...FOURBALL, allowance_pct: 0 }, grouping: 'sides' },
  { label: 'fourball 100 %', mode: 'fourball_matchplay', config: { ...FOURBALL, allowance_pct: 100 }, grouping: 'sides' },
  { label: 'fourball uten felt', mode: 'fourball_matchplay', config: withoutField({ ...FOURBALL, allowance_pct: 85 }, 'allowance_pct'), grouping: 'sides' },
  { label: 'round robin 85 %', mode: 'round_robin', config: { ...ROUND_ROBIN, allowance_pct: 85 }, grouping: 'slots' },
  { label: 'round robin 0 %', mode: 'round_robin', config: { ...ROUND_ROBIN, allowance_pct: 0 }, grouping: 'slots' },
  { label: 'round robin uten felt', mode: 'round_robin', config: withoutField({ ...ROUND_ROBIN, allowance_pct: 85 }, 'allowance_pct'), grouping: 'slots' },
  ...(['net', 'gross'] as const).flatMap((scoring) => [
    { label: `skins ${scoring}`, mode: 'skins' as const, config: { kind: 'skins', team_size: 1, skins_scoring: scoring } as GameModeConfig, grouping: 'solo' as const },
    { label: `nassau ${scoring}`, mode: 'nassau' as const, config: { kind: 'nassau', team_size: 1, nassau_scoring: scoring } as GameModeConfig, grouping: 'solo' as const },
    { label: `wolf ${scoring}`, mode: 'wolf' as const, config: { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: scoring } as GameModeConfig, grouping: 'slots' as const },
    { label: `nines ${scoring}`, mode: 'nines' as const, config: { kind: 'nines', team_size: 1, nines_variant: 'nines', nines_scoring: scoring } as GameModeConfig, grouping: 'solo' as const },
    { label: `acey deucey ${scoring}`, mode: 'acey_deucey' as const, config: { kind: 'acey_deucey', team_size: 1, acey_deucey_scoring: scoring } as GameModeConfig, grouping: 'solo' as const },
    { label: `shamble ${scoring}`, mode: 'shamble' as const, config: { kind: 'shamble', team_size: 4, teams_count: 1, shamble_variant: 'shamble', shamble_count: 2, shamble_scoring: scoring } as GameModeConfig, grouping: 'one-team' as const },
    { label: `patsome ${scoring}`, mode: 'patsome' as const, config: { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: scoring } as GameModeConfig, grouping: 'sides' as const },
  ]),
  { label: 'solo slagspill', mode: 'solo_strokeplay', config: { kind: 'solo_strokeplay', team_size: 1 }, grouping: 'solo' },
  { label: 'singles matchplay', mode: 'singles_matchplay', config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 }, grouping: 'singles' },
];

describe('playerStrokeHandicap — paritet mot motorene', () => {
  it.each(PARITY_ROWS)('$label: kortets slag = motorens slag i hver celle', ({ mode, config, grouping }) => {
    const result = computeLeaderboard(ctxFor(mode, config, grouping));
    const compared = cellsOf(result).filter((c) => c.gross !== null && c.effective !== null);

    // An empty shell would compare nothing and pass (I3) — demand real cells.
    expect(compared.length).toBeGreaterThan(0);

    for (const c of compared) {
      const expected = strokesForHole(playerStrokeHandicap(mode, config, CH[c.userId]), c.strokeIndex);
      expect({ userId: c.userId, si: c.strokeIndex, strokes: c.gross! - c.effective! }).toEqual({
        userId: c.userId,
        si: c.strokeIndex,
        strokes: expected,
      });
    }
  });

  it('fourball 85 % gir banehandicap 20 → 17, altså ingen slag på SI 18', () => {
    const hcp = playerStrokeHandicap('fourball_matchplay', { ...FOURBALL, allowance_pct: 85 }, 20);
    expect(hcp).toBe(17);
    expect(strokesForHole(hcp, 18)).toBe(0);
  });
});

describe('alternateShotSideExtras — paritet mot motorene', () => {
  const AS_ROWS: Array<{
    label: string;
    mode: GameMode;
    config: GameModeConfig;
    side1: [number, number];
    side2: [number, number];
  }> = [
    { label: 'foursomes 50 %', mode: 'foursomes_matchplay', config: { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 }, side1: [20, 10], side2: [4, 8] },
    { label: 'greensome 100 %', mode: 'greensome_matchplay', config: { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 }, side1: [20, 10], side2: [4, 8] },
    { label: 'greensome med overstyring {8, 3}', mode: 'greensome_matchplay', config: { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100, team_strokes_override: { team1: 8, team2: 3 } }, side1: [12, 20], side2: [5, 8] },
    { label: 'chapman 100 %', mode: 'chapman_matchplay', config: { kind: 'chapman_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 }, side1: [20, 10], side2: [4, 8] },
    { label: 'gruesome 50 %', mode: 'gruesome_matchplay', config: { kind: 'gruesome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 }, side1: [20, 10], side2: [4, 8] },
  ];

  it.each(AS_ROWS)('$label: lag-slagene = motorens effectiveExtraHandicap', ({ mode, config, side1, side2 }) => {
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, courseHandicap: side1[0] },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, courseHandicap: side1[1] },
      { userId: 'b1', teamNumber: 2, flightNumber: 1, courseHandicap: side2[0] },
      { userId: 'b2', teamNumber: 2, flightNumber: 1, courseHandicap: side2[1] },
    ];
    const result = computeLeaderboard({
      game: { id: 'g-2218', game_mode: mode, mode_config: config },
      players,
      holes: HOLES,
      scores: [],
    });
    if (result.kind !== 'foursomes_matchplay') throw new Error(`unexpected kind ${result.kind}`);
    // Guard against the engine's empty shell (≠ 2+2 players), which reports 0/0.
    expect(result.sides[0].captainUserId).toBe('a1');

    expect(alternateShotSideExtras(mode, config, side1, side2)).toEqual({
      side1Extra: result.sides[0].effectiveExtraHandicap,
      side2Extra: result.sides[1].effectiveExtraHandicap,
    });
  });

  it('greensome-overstyringen {8, 3} gir lag 1 fem slag, ikke ni fra 60/40', () => {
    const config: GameModeConfig = {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 100,
      team_strokes_override: { team1: 8, team2: 3 },
    };
    expect(alternateShotSideExtras('greensome_matchplay', config, [12, 20], [5, 8])).toEqual({
      side1Extra: 5,
      side2Extra: 0,
    });
  });

  it('en side uten nøyaktig to spillere (utkast) bruker sum eller 60/40 over min og maks, tom side = 0', () => {
    const foursomes: GameModeConfig = { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 };
    expect(alternateShotSideExtras('foursomes_matchplay', foursomes, [20, 10, 4], [])).toEqual({
      side1Extra: 34,
      side2Extra: 0,
    });
    const greensome: GameModeConfig = { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 };
    // side 1: round(0.6×4 + 0.4×20) = 10; side 2: one player → round(0.6×8 + 0.4×8) = 8.
    expect(alternateShotSideExtras('greensome_matchplay', greensome, [20, 10, 4], [8])).toEqual({
      side1Extra: 2,
      side2Extra: 0,
    });
  });
});

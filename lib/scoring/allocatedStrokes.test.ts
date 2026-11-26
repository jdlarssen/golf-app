import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from '@/lib/scoring';
import { strokesForHole } from './strokeAllocation';
import { MIXED_PAR_18 } from './__fixtures__/mixedPar';
import {
  alternateShotSideExtras,
  matchStrokeBases,
  matchStrokeField,
  matchStrokeHandicap,
  playerStrokeHandicap,
} from './allocatedStrokes';
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
/**
 * #2997: the unrounded course handicaps the start freezes next to CH
 * (`raw_course_handicap`), each rounding to its CH. The rows marked `raw`
 * carry them, so the share of the unrounded number is bound too (F16).
 */
const RAW: Record<string, number> = { p1: 19.6, p2: 10.4, p3: 3.5, p4: 8.4 };

type Grouping = 'sides' | 'slots' | 'solo' | 'one-team' | 'singles';

function playersFor(grouping: Grouping, raw = false): ScoringPlayer[] {
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
    return {
      userId,
      teamNumber,
      flightNumber: 1,
      courseHandicap: CH[userId],
      rawCourseHandicap: raw ? RAW[userId] : null,
    };
  });
}

function ctxFor(
  mode: GameMode,
  config: GameModeConfig,
  grouping: Grouping,
  raw = false,
): ScoringContext {
  const players = playersFor(grouping, raw);
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
  raw?: boolean;
}> = [
  // #2997 (F15): a new match gives the share of the difference to the lowest.
  { label: 'fourball 90 %, forskjellen', mode: 'fourball_matchplay', config: { ...FOURBALL, allowance_pct: 90, match_strokes: 'difference' }, grouping: 'sides' },
  { label: 'fourball 90 %, forskjellen, urundet', mode: 'fourball_matchplay', config: { ...FOURBALL, allowance_pct: 90, match_strokes: 'difference' }, grouping: 'sides', raw: true },
  { label: 'fourball 85 %, urundet', mode: 'fourball_matchplay', config: { ...FOURBALL, allowance_pct: 85 }, grouping: 'sides', raw: true },
  { label: 'round robin 90 %, forskjellen', mode: 'round_robin', config: { ...ROUND_ROBIN, allowance_pct: 90, match_strokes: 'difference' }, grouping: 'slots' },
  { label: 'round robin 90 %, forskjellen, urundet', mode: 'round_robin', config: { ...ROUND_ROBIN, allowance_pct: 90, match_strokes: 'difference' }, grouping: 'slots', raw: true },
  { label: 'round robin 85 %, urundet', mode: 'round_robin', config: { ...ROUND_ROBIN, allowance_pct: 85 }, grouping: 'slots', raw: true },
  { label: 'singles matchplay, forskjellen, urundet tall leses ikke', mode: 'singles_matchplay', config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2, match_strokes: 'difference' }, grouping: 'singles', raw: true },
  { label: 'patsome net, urundet', mode: 'patsome', config: { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'net' }, grouping: 'sides', raw: true },
  // #3002 (F24): a new patsome game plays holes 1–6 on 85 %.
  { label: 'patsome net 85 %', mode: 'patsome', config: { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'net', fourball_allowance_pct: 85 }, grouping: 'sides' },
  { label: 'patsome net 85 %, urundet', mode: 'patsome', config: { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'net', fourball_allowance_pct: 85 }, grouping: 'sides', raw: true },
  { label: 'patsome gross 85 %', mode: 'patsome', config: { kind: 'patsome', team_size: 2, teams_count: 2, patsome_scoring: 'gross', fourball_allowance_pct: 85 }, grouping: 'sides' },
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
  { label: 'singles matchplay, forskjellen', mode: 'singles_matchplay', config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2, match_strokes: 'difference' }, grouping: 'singles' },
];

describe('matchStrokeHandicap — paritet mot motorene', () => {
  it.each(PARITY_ROWS)('$label: kortets slag = motorens slag i hver celle', ({ mode, config, grouping, raw = false }) => {
    const result = computeLeaderboard(ctxFor(mode, config, grouping, raw));
    // Every player in the match, as the views pass them (the whole roster).
    const roster = playersFor(grouping, raw);
    const matchBases = matchStrokeBases(mode, roster);
    const byUser = new Map(roster.map((p) => [p.userId, p]));
    const compared = cellsOf(result).filter((c) => c.gross !== null && c.effective !== null);

    // An empty shell would compare nothing and pass (I3) — demand real cells.
    expect(compared.length).toBeGreaterThan(0);

    for (const c of compared) {
      const expected = strokesForHole(
        matchStrokeHandicap(mode, config, byUser.get(c.userId)!, matchBases),
        c.strokeIndex,
      );
      expect({ userId: c.userId, si: c.strokeIndex, strokes: c.gross! - c.effective! }).toEqual({
        userId: c.userId,
        si: c.strokeIndex,
        strokes: expected,
      });
    }
  });

  it('singles med forskjellen: 20 mot 5 gir 15 og 0; uten nøkkelen 20 og 5', () => {
    const diff = { kind: 'singles_matchplay', team_size: 1, teams_count: 2, match_strokes: 'difference' } as const;
    const legacy = { kind: 'singles_matchplay', team_size: 1, teams_count: 2 } as const;
    expect(matchStrokeHandicap('singles_matchplay', diff, { courseHandicap: 20 }, [20, 5])).toBe(15);
    expect(matchStrokeHandicap('singles_matchplay', diff, { courseHandicap: 5 }, [20, 5])).toBe(0);
    expect(matchStrokeHandicap('singles_matchplay', legacy, { courseHandicap: 20 }, [20, 5])).toBe(20);
    // The player's own handicap (the header's number) is not the match strokes.
    expect(playerStrokeHandicap('singles_matchplay', diff, 20)).toBe(20);
  });

  it('matchStrokeBases leser side 1 og 2 uten trukne i singel og four-ball, som motorens kontekst', () => {
    const roster = [
      { teamNumber: 1, courseHandicap: 20 },
      { teamNumber: 2, courseHandicap: null },
      { teamNumber: null, courseHandicap: -3 },
      { teamNumber: 3, courseHandicap: -1 },
      { teamNumber: 2, courseHandicap: 2, withdrawnAt: '2026-11-26T10:00:00Z' },
    ];
    expect(matchStrokeBases('singles_matchplay', roster)).toEqual([20, 0]);
    expect(matchStrokeBases('fourball_matchplay', roster)).toEqual([20, 0]);
  });

  it('matchStrokeBases tar det urundede tallet i four-ball og Round Robin, ikke i singel (#2997)', () => {
    const roster = [
      { teamNumber: 1, courseHandicap: 10, rawCourseHandicap: 9.5 },
      { teamNumber: 2, courseHandicap: 20, rawCourseHandicap: 20.4 },
    ];
    expect(matchStrokeBases('fourball_matchplay', roster)).toEqual([9.5, 20.4]);
    expect(matchStrokeBases('round_robin', roster)).toEqual([9.5, 20.4]);
    expect(matchStrokeBases('singles_matchplay', roster)).toEqual([10, 20]);
  });

  it('matchStrokeBases i Round Robin leser plass 1–4, også trukne, som buildRoundRobinContext', () => {
    expect(
      matchStrokeBases('round_robin', [
        { teamNumber: 1, courseHandicap: 10 },
        { teamNumber: 4, courseHandicap: 3, withdrawnAt: '2026-11-26T10:00:00Z' },
        { teamNumber: 5, courseHandicap: 0 },
        { teamNumber: null, courseHandicap: 0 },
      ]),
    ).toEqual([10, 3]);
    expect(matchStrokeBases('stableford', [{ teamNumber: 1, courseHandicap: 10 }])).toEqual([]);
  });

  it('four-ball 90 % med forskjellen: 10, 18, 27 og 39 gir 0, 7, 15 og 26 (C/2 eksempel 2)', () => {
    const config: GameModeConfig = { ...FOURBALL, allowance_pct: 90, match_strokes: 'difference' };
    const bases = [10, 18, 27, 39];
    expect(bases.map((ch) => matchStrokeHandicap('fourball_matchplay', config, { courseHandicap: ch }, bases))).toEqual([0, 7, 15, 26]);
  });

  it('fourball 85 % gir banehandicap 20 → 17, altså ingen slag på SI 18', () => {
    const hcp = playerStrokeHandicap('fourball_matchplay', { ...FOURBALL, allowance_pct: 85 }, 20);
    expect(hcp).toBe(17);
    expect(strokesForHole(hcp, 18)).toBe(0);
  });
});

/** Whole course handicaps only, as a round started before #2997 has them. */
const chs = (values: number[]) => values.map((courseHandicap) => ({ courseHandicap }));

describe('alternateShotSideExtras — paritet mot motorene', () => {
  type AsPlayer = { courseHandicap: number; rawCourseHandicap?: number | null };
  const AS_ROWS: Array<{
    label: string;
    mode: GameMode;
    config: GameModeConfig;
    side1: [number, number];
    side2: [number, number];
    raw?: { side1: [number, number]; side2: [number, number] };
  }> = [
    // #2997 (F16): the unrounded numbers, one rounding. 8,04/13,96 against
    // 15,04/28,96 is where rounding each side first gave one stroke more.
    { label: 'greensome 100 %, urundet', mode: 'greensome_matchplay', config: { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 }, side1: [8, 14], side2: [15, 29], raw: { side1: [8.04, 13.96], side2: [15.04, 28.96] } },
    { label: 'chapman 100 %, urundet', mode: 'chapman_matchplay', config: { kind: 'chapman_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 }, side1: [8, 14], side2: [15, 29], raw: { side1: [8.04, 13.96], side2: [15.04, 28.96] } },
    { label: 'foursomes 50 %, urundet', mode: 'foursomes_matchplay', config: { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 }, side1: [10, 11], side2: [0, 0], raw: { side1: [9.513, 11.394], side2: [0, 0] } },
    { label: 'gruesome 50 %, urundet', mode: 'gruesome_matchplay', config: { kind: 'gruesome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 }, side1: [10, 11], side2: [0, 0], raw: { side1: [9.513, 11.394], side2: [0, 0] } },
    { label: 'greensome 100 %, heltall', mode: 'greensome_matchplay', config: { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 }, side1: [8, 14], side2: [15, 29] },
    { label: 'foursomes 50 %', mode: 'foursomes_matchplay', config: { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 }, side1: [20, 10], side2: [4, 8] },
    { label: 'greensome 100 %', mode: 'greensome_matchplay', config: { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 }, side1: [20, 10], side2: [4, 8] },
    { label: 'greensome med overstyring {8, 3}', mode: 'greensome_matchplay', config: { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100, team_strokes_override: { team1: 8, team2: 3 } }, side1: [12, 20], side2: [5, 8] },
    { label: 'chapman 100 %', mode: 'chapman_matchplay', config: { kind: 'chapman_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 }, side1: [20, 10], side2: [4, 8] },
    { label: 'gruesome 50 %', mode: 'gruesome_matchplay', config: { kind: 'gruesome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 }, side1: [20, 10], side2: [4, 8] },
  ];

  it.each(AS_ROWS)('$label: lag-slagene = motorens effectiveExtraHandicap', ({ mode, config, side1, side2, raw }) => {
    const side = (chs: [number, number], raws?: [number, number]): AsPlayer[] =>
      chs.map((courseHandicap, i) => ({ courseHandicap, rawCourseHandicap: raws?.[i] ?? null }));
    const s1 = side(side1, raw?.side1);
    const s2 = side(side2, raw?.side2);
    const players: ScoringPlayer[] = [
      { userId: 'a1', teamNumber: 1, flightNumber: 1, ...s1[0] },
      { userId: 'a2', teamNumber: 1, flightNumber: 1, ...s1[1] },
      { userId: 'b1', teamNumber: 2, flightNumber: 1, ...s2[0] },
      { userId: 'b2', teamNumber: 2, flightNumber: 1, ...s2[1] },
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

    expect(alternateShotSideExtras(mode, config, s1, s2)).toEqual({
      side1Extra: result.sides[0].effectiveExtraHandicap,
      side2Extra: result.sides[1].effectiveExtraHandicap,
    });
  });

  it('urundet greensome gir 10 slag, heltallene 11 (#2997, F16)', () => {
    const config: GameModeConfig = { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 };
    const p = (courseHandicap: number, rawCourseHandicap: number | null) => ({ courseHandicap, rawCourseHandicap });
    expect(alternateShotSideExtras('greensome_matchplay', config, [p(8, 8.04), p(14, 13.96)], [p(15, 15.04), p(29, 28.96)])).toEqual({ side1Extra: 0, side2Extra: 10 });
    expect(alternateShotSideExtras('greensome_matchplay', config, [p(8, null), p(14, null)], [p(15, null), p(29, null)])).toEqual({ side1Extra: 0, side2Extra: 11 });
  });

  it('greensome-overstyringen {8, 3} gir lag 1 fem slag, ikke ni fra 60/40', () => {
    const config: GameModeConfig = {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 100,
      team_strokes_override: { team1: 8, team2: 3 },
    };
    expect(alternateShotSideExtras('greensome_matchplay', config, chs([12, 20]), chs([5, 8]))).toEqual({
      side1Extra: 5,
      side2Extra: 0,
    });
  });

  it('en side uten nøyaktig to spillere (utkast) bruker sum eller 60/40 over min og maks, tom side = 0', () => {
    const foursomes: GameModeConfig = { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 };
    expect(alternateShotSideExtras('foursomes_matchplay', foursomes, chs([20, 10, 4]), [])).toEqual({
      side1Extra: 34,
      side2Extra: 0,
    });
    const greensome: GameModeConfig = { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100 };
    // side 1: round(0.6×4 + 0.4×20) = 10; side 2: one player → round(0.6×8 + 0.4×8) = 8.
    expect(alternateShotSideExtras('greensome_matchplay', greensome, chs([20, 10, 4]), chs([8]))).toEqual({
      side1Extra: 2,
      side2Extra: 0,
    });
  });
});

describe('ulik par: visningene gir de samme tilleggsslagene som motorene (#2941, F17)', () => {
  // p3 (4) is the lowest and plays from the ladies' tee, so the views must
  // also let the lowest playing handicap play off zero once her two par
  // strokes are in (vedlegg C s. 76). p2 is a lady too.
  const TEES: Record<string, 'mens' | 'ladies'> = { p1: 'mens', p2: 'ladies', p3: 'ladies', p4: 'mens' };
  const roster = (grouping: Grouping): ScoringPlayer[] =>
    playersFor(grouping).map((p) => ({ ...p, teeGender: TEES[p.userId] }));
  const SINGLES = { kind: 'singles_matchplay', team_size: 1, teams_count: 2, match_strokes: 'difference' } as const;
  const PAR = { par_strokes: 'difference' } as const;

  const ROWS: Array<{ label: string; mode: GameMode; config: GameModeConfig; grouping: Grouping }> = [
    { label: 'singles med merket', mode: 'singles_matchplay', config: { ...SINGLES, ...PAR }, grouping: 'singles' },
    { label: 'singles uten merket', mode: 'singles_matchplay', config: SINGLES, grouping: 'singles' },
    { label: 'four-ball 90 % med merket', mode: 'fourball_matchplay', config: { ...FOURBALL, allowance_pct: 90, match_strokes: 'difference', ...PAR }, grouping: 'sides' },
    { label: 'four-ball 90 % uten merket', mode: 'fourball_matchplay', config: { ...FOURBALL, allowance_pct: 90, match_strokes: 'difference' }, grouping: 'sides' },
    { label: 'four-ball 90 % med par_strokes, men uten forskjellen', mode: 'fourball_matchplay', config: { ...FOURBALL, allowance_pct: 90, ...PAR } as GameModeConfig, grouping: 'sides' },
    { label: 'Round Robin 90 % med merket', mode: 'round_robin', config: { ...ROUND_ROBIN, allowance_pct: 90, match_strokes: 'difference', ...PAR }, grouping: 'slots' },
    { label: 'Round Robin 90 % uten merket', mode: 'round_robin', config: { ...ROUND_ROBIN, allowance_pct: 90, match_strokes: 'difference' }, grouping: 'slots' },
  ];

  it.each(ROWS)('$label: kortets slag = motorens slag i hver celle', ({ mode, config, grouping }) => {
    const players = roster(grouping);
    const result = computeLeaderboard({
      game: { id: 'g-2941', game_mode: mode, mode_config: config },
      players,
      holes: MIXED_PAR_18,
      scores: players.flatMap((p) => MIXED_PAR_18.map((h) => ({ userId: p.userId, holeNumber: h.number, gross: GROSS }))),
    });
    const field = matchStrokeField(mode, players, MIXED_PAR_18);
    const byUser = new Map(players.map((p) => [p.userId, p]));
    const compared = cellsOf(result).filter((c) => c.gross !== null && c.effective !== null);
    expect(compared.length).toBeGreaterThan(0);

    for (const c of compared) {
      const expected = strokesForHole(matchStrokeHandicap(mode, config, byUser.get(c.userId)!, field), c.strokeIndex);
      expect({ userId: c.userId, si: c.strokeIndex, strokes: c.gross! - c.effective! }).toEqual({
        userId: c.userId,
        si: c.strokeIndex,
        strokes: expected,
      });
    }
  });

  it('singles: damen (4) spiller på null etter sine to par-slag, og herren (20) får 14', () => {
    const players = roster('singles');
    const field = matchStrokeField('singles_matchplay', players, MIXED_PAR_18);
    const strokes = players.map((p) => matchStrokeHandicap('singles_matchplay', { ...SINGLES, ...PAR }, p, field));
    expect(strokes).toEqual([14, 0]);
    // Without the key: 16 and 0, as before.
    expect(players.map((p) => matchStrokeHandicap('singles_matchplay', SINGLES, p, field))).toEqual([16, 0]);
  });

  it('matchStrokeField tar spillerne motoren leser, med teen, og tomt for andre format', () => {
    const players = roster('sides');
    expect(matchStrokeField('fourball_matchplay', players, MIXED_PAR_18).players).toEqual([
      { basis: 20, teeGender: 'mens' },
      { basis: 10, teeGender: 'ladies' },
      { basis: 4, teeGender: 'ladies' },
      { basis: 8, teeGender: 'mens' },
    ]);
    expect(matchStrokeField('stableford', players, MIXED_PAR_18).players).toEqual([]);
  });

  type AsPlayer = { userId: string; courseHandicap: number; teeGender: 'mens' | 'ladies' };
  const AS_PAR_ROWS: Array<{ label: string; mode: GameMode; config: GameModeConfig; side1: AsPlayer[]; side2: AsPlayer[] }> = [
    {
      label: 'foursomes 50 %, damesiden med merket',
      mode: 'foursomes_matchplay',
      config: { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50, ...PAR },
      side1: [{ userId: 'a1', courseHandicap: 20, teeGender: 'mens' }, { userId: 'a2', courseHandicap: 10, teeGender: 'mens' }],
      side2: [{ userId: 'b1', courseHandicap: 4, teeGender: 'ladies' }, { userId: 'b2', courseHandicap: 8, teeGender: 'mens' }],
    },
    {
      label: 'foursomes 50 %, damesiden uten merket',
      mode: 'foursomes_matchplay',
      config: { kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 },
      side1: [{ userId: 'a1', courseHandicap: 20, teeGender: 'mens' }, { userId: 'a2', courseHandicap: 10, teeGender: 'mens' }],
      side2: [{ userId: 'b1', courseHandicap: 4, teeGender: 'ladies' }, { userId: 'b2', courseHandicap: 8, teeGender: 'mens' }],
    },
    {
      label: 'greensome med overstyring {8, 3} og merket',
      mode: 'greensome_matchplay',
      config: { kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100, team_strokes_override: { team1: 8, team2: 3 }, ...PAR },
      side1: [{ userId: 'a1', courseHandicap: 12, teeGender: 'ladies' }, { userId: 'a2', courseHandicap: 20, teeGender: 'mens' }],
      side2: [{ userId: 'b1', courseHandicap: 5, teeGender: 'mens' }, { userId: 'b2', courseHandicap: 8, teeGender: 'mens' }],
    },
    {
      label: 'chapman 100 %, kapteinen er ikke damen',
      mode: 'chapman_matchplay',
      config: { kind: 'chapman_matchplay', team_size: 2, teams_count: 2, allowance_pct: 100, ...PAR },
      side1: [{ userId: 'a1', courseHandicap: 12, teeGender: 'mens' }, { userId: 'a2', courseHandicap: 20, teeGender: 'ladies' }],
      side2: [{ userId: 'b1', courseHandicap: 5, teeGender: 'mens' }, { userId: 'b2', courseHandicap: 8, teeGender: 'mens' }],
    },
    {
      label: 'gruesome 50 % med merket',
      mode: 'gruesome_matchplay',
      config: { kind: 'gruesome_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50, ...PAR },
      side1: [{ userId: 'a1', courseHandicap: 10, teeGender: 'mens' }, { userId: 'a2', courseHandicap: 10, teeGender: 'mens' }],
      side2: [{ userId: 'b1', courseHandicap: 10, teeGender: 'ladies' }, { userId: 'b2', courseHandicap: 10, teeGender: 'ladies' }],
    },
  ];

  it.each(AS_PAR_ROWS)('$label: lag-slagene = motorens effectiveExtraHandicap', ({ mode, config, side1, side2 }) => {
    const players: ScoringPlayer[] = [
      ...side1.map((p) => ({ ...p, teamNumber: 1, flightNumber: 1 })),
      ...side2.map((p) => ({ ...p, teamNumber: 2, flightNumber: 1 })),
    ];
    const result = computeLeaderboard({
      game: { id: 'g-2941', game_mode: mode, mode_config: config },
      players,
      holes: MIXED_PAR_18,
      scores: [],
    });
    if (result.kind !== 'foursomes_matchplay') throw new Error(`unexpected kind ${result.kind}`);
    expect(result.sides[0].captainUserId).toBe('a1');
    expect(alternateShotSideExtras(mode, config, side1, side2, MIXED_PAR_18)).toEqual({
      side1Extra: result.sides[0].effectiveExtraHandicap,
      side2Extra: result.sides[1].effectiveExtraHandicap,
    });
  });

  it('foursomes 50 %: 30 mot 12 gir 9 slag, og damesidens 2 par-slag gjør det til 7', () => {
    const [row] = AS_PAR_ROWS;
    expect(alternateShotSideExtras(row.mode, row.config, row.side1, row.side2, MIXED_PAR_18)).toEqual({ side1Extra: 7, side2Extra: 0 });
  });
});

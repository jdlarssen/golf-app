import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameMode, ModeResult } from '@/lib/scoring/modes/types';
import {
  CEREMONY_MAX_STEP,
  ceremonyLines,
  ceremonyPlaces,
  ceremonySteps,
  ceremonySupported,
  ceremonyView,
  type CeremonyLine,
} from './ceremony';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../supabase/migrations/0211_games_ceremony_step.sql',
);

// Every GameMode, so a new format fails here until it is placed.
const ALL_MODES: Record<GameMode, boolean> = {
  solo_strokeplay: true,
  stableford: true,
  modified_stableford: true,
  texas_scramble: true,
  ambrose: true,
  florida_scramble: true,
  shamble: true,
  best_ball: true,
  patsome: true,
  singles_matchplay: false,
  fourball_matchplay: false,
  foursomes_matchplay: false,
  greensome_matchplay: false,
  chapman_matchplay: false,
  gruesome_matchplay: false,
  wolf: false,
  nassau: false,
  skins: false,
  bingo_bango_bongo: false,
  nines: false,
  round_robin: false,
  acey_deucey: false,
};

/** The result shapes, cut down to the fields `ceremonyLines` reads. */
const result = (r: unknown) => r as ModeResult;

function line(rank: number, key: string, team: number | null = null): CeremonyLine {
  return { key, rank, total: 30 - rank, unit: 'points', members: [key], teamNumber: team };
}

describe('CEREMONY_MAX_STEP ↔ the DB CHECK (trap #4)', () => {
  it('the CHECK bound in 0211 is CEREMONY_MAX_STEP', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
    const m = sql.match(/ceremony_step\s+between\s+0\s+and\s+(\d+)/i);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(CEREMONY_MAX_STEP);
  });

  it('side prizes plus three places is the most steps there can be', () => {
    const places = ceremonyPlaces([line(1, 'a'), line(2, 'b'), line(3, 'c')]);
    expect(ceremonySteps(places, true)).toHaveLength(CEREMONY_MAX_STEP);
  });
});

describe('ceremonySupported', () => {
  it.each(Object.entries(ALL_MODES) as [GameMode, boolean][])('%s → %s', (mode, expected) => {
    expect(ceremonySupported(mode)).toBe(expected);
  });

  it('exactly the nine podium formats', () => {
    expect(Object.values(ALL_MODES).filter(Boolean)).toHaveLength(9);
  });
});

describe('ceremonyLines — the same number the podium shows', () => {
  it('solo strokeplay on net total: net strokes, «slag»', () => {
    const lines = ceremonyLines(
      result({
        kind: 'solo_strokeplay',
        ranking: 'net_total',
        holes: [],
        players: [
          { userId: 'a', totalNetStrokes: 70, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: [] },
          { userId: 'b', totalNetStrokes: 74, holesPlayed: 18, netToPar: 2, rank: 2, tiedWith: [] },
        ],
      }),
    );
    expect(lines).toEqual([
      { key: 'a', rank: 1, total: 70, unit: 'net', members: ['a'], teamNumber: null },
      { key: 'b', rank: 2, total: 74, unit: 'net', members: ['b'], teamNumber: null },
    ]);
  });

  it('solo strokeplay ranked on net to par: net to par, «mot par»', () => {
    const lines = ceremonyLines(
      result({
        kind: 'solo_strokeplay',
        ranking: 'net_to_par',
        holes: [],
        players: [{ userId: 'a', totalNetStrokes: 70, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: [] }],
      }),
    );
    expect(lines).toEqual([
      { key: 'a', rank: 1, total: -2, unit: 'toPar', members: ['a'], teamNumber: null },
    ]);
  });

  it('solo stableford (and modified): points', () => {
    const lines = ceremonyLines(
      result({
        kind: 'stableford',
        variant: 'solo',
        holes: [],
        players: [
          { userId: 'a', totalPoints: 38, rank: 1, holesPlayed: 18, tiedWith: [] },
          { userId: 'b', totalPoints: 36, rank: 2, holesPlayed: 18, tiedWith: [] },
        ],
      }),
    );
    expect(lines.map((l) => [l.key, l.total, l.unit, l.teamNumber])).toEqual([
      ['a', 38, 'points', null],
      ['b', 36, 'points', null],
    ]);
  });

  it('team stableford: the pair, team points', () => {
    const lines = ceremonyLines(
      result({
        kind: 'stableford',
        variant: 'team',
        teams: [{ teamNumber: 2, playerIds: ['a', 'b'], holes: [], totalPoints: 44, rank: 1, tiedWith: [] }],
      }),
    );
    expect(lines).toEqual([
      { key: 'team-2', rank: 1, total: 44, unit: 'points', members: ['a', 'b'], teamNumber: 2 },
    ]);
  });

  it('Texas scramble (Ambrose, Florida): the team, net total in strokes', () => {
    const lines = ceremonyLines(
      result({
        kind: 'texas_scramble',
        teams: [
          {
            teamNumber: 3,
            members: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }, { userId: 'd' }],
            totalNet: 61,
            totalGross: 66,
            missingHoles: [],
            rank: 1,
            tiedWith: [],
          },
        ],
      }),
    );
    expect(lines).toEqual([
      { key: 'team-3', rank: 1, total: 61, unit: 'net', members: ['a', 'b', 'c', 'd'], teamNumber: 3 },
    ]);
  });

  it('shamble: total score in strokes; a team without a counted hole is left out', () => {
    const lines = ceremonyLines(
      result({
        kind: 'shamble',
        variant: 'shamble',
        count: 2,
        scoring: 'net',
        teamSize: 4,
        holes: [],
        teams: [
          { teamNumber: 1, members: ['a', 'b'], totalScore: 140, holesCounted: 18, rank: 1, tiedWith: [] },
          { teamNumber: 2, members: ['c', 'd'], totalScore: 0, holesCounted: 0, rank: 2, tiedWith: [] },
        ],
      }),
    );
    expect(lines).toEqual([
      { key: 'team-1', rank: 1, total: 140, unit: 'net', members: ['a', 'b'], teamNumber: 1 },
    ]);
  });

  it('best ball: the net team total in strokes', () => {
    const lines = ceremonyLines(
      result({
        kind: 'best_ball',
        teams: [{ teamNumber: 4, playerIds: ['a', 'b'], holes: [], total: 66, missingHoles: [], rank: 1, tiedWith: [] }],
      }),
    );
    expect(lines).toEqual([
      { key: 'team-4', rank: 1, total: 66, unit: 'net', members: ['a', 'b'], teamNumber: 4 },
    ]);
  });

  it('patsome: team points', () => {
    const lines = ceremonyLines(
      result({
        kind: 'patsome',
        scoring: 'net',
        teams: [
          { teamNumber: 1, playerIds: ['a', 'b'], captainUserId: 'a', holes: [], totalPoints: 37, rank: 1, tiedWith: [] },
        ],
      }),
    );
    expect(lines).toEqual([
      { key: 'team-1', rank: 1, total: 37, unit: 'points', members: ['a', 'b'], teamNumber: 1 },
    ]);
  });

  it('a player with no played hole is not on the podium (strokeplay and stableford)', () => {
    const stroke = ceremonyLines(
      result({
        kind: 'solo_strokeplay',
        ranking: 'net_total',
        holes: [],
        players: [
          { userId: 'a', totalNetStrokes: 70, holesPlayed: 18, netToPar: -2, rank: 1, tiedWith: [] },
          { userId: 'b', totalNetStrokes: 0, holesPlayed: 0, netToPar: null, rank: 2, tiedWith: [] },
        ],
      }),
    );
    const points = ceremonyLines(
      result({
        kind: 'stableford',
        variant: 'solo',
        holes: [],
        players: [
          { userId: 'a', totalPoints: 30, rank: 1, holesPlayed: 18, tiedWith: [] },
          { userId: 'b', totalPoints: 0, rank: 2, holesPlayed: 0, tiedWith: [] },
        ],
      }),
    );
    expect(stroke.map((l) => l.key)).toEqual(['a']);
    expect(points.map((l) => l.key)).toEqual(['a']);
  });

  it.each(['singles_matchplay', 'wolf', 'skins'] as const)('%s has no podium here: []', (kind) => {
    expect(ceremonyLines(result({ kind }))).toEqual([]);
  });
});

describe('ceremonyPlaces — one group per podium rank, ties together', () => {
  it.each([
    ['clear podium of 8', [1, 2, 3, 4, 5, 6, 7, 8], [[1, 1], [2, 1], [3, 1]]],
    ['shared 1st', [1, 1, 3, 4], [[1, 2], [3, 1]]],
    ['shared 2nd', [1, 2, 2, 4], [[1, 1], [2, 2]]],
    ['shared 3rd', [1, 2, 3, 3, 5], [[1, 1], [2, 1], [3, 2]]],
    ['four share 3rd', [1, 2, 3, 3, 3, 3], [[1, 1], [2, 1], [3, 4]]],
    ['three share 1st', [1, 1, 1, 4], [[1, 3]]],
    ['two players', [1, 2], [[1, 1], [2, 1]]],
    ['one player', [1], [[1, 1]]],
    ['nobody', [], []],
  ] as [string, number[], [number, number][]][])('%s', (_name, ranks, expected) => {
    const places = ceremonyPlaces(ranks.map((r, i) => line(r, `p${i}`)));
    expect(places.map((p) => [p.rank, p.lines.length])).toEqual(expected);
  });

  it('keeps the engine order inside a shared place, for teams too', () => {
    const places = ceremonyPlaces([line(1, 'team-1', 1), line(2, 'team-4', 4), line(2, 'team-2', 2)]);
    expect(places[1]!.lines.map((l) => l.teamNumber)).toEqual([4, 2]);
  });
});

describe('ceremonySteps — side prizes, then from the lowest place up to the winner', () => {
  it.each([
    ['full podium with side prizes', [1, 2, 3], true, ['side', 3, 2, 1]],
    ['full podium without', [1, 2, 3], false, [3, 2, 1]],
    ['shared 1st skips 2nd', [1, 1, 3], false, [3, 1]],
    ['shared 2nd has no 3rd', [1, 2, 2], true, ['side', 2, 1]],
    ['two players', [1, 2], false, [2, 1]],
    ['one player', [1], false, [1]],
    ['nobody, side prizes only', [], true, ['side']],
    ['nobody at all', [], false, []],
  ] as [string, number[], boolean, (number | 'side')[]][])('%s', (_name, ranks, side, expected) => {
    const steps = ceremonySteps(ceremonyPlaces(ranks.map((r, i) => line(r, `p${i}`))), side);
    expect(steps.map((s) => (s === 'side' ? 'side' : s.rank))).toEqual(expected);
  });
});

describe('ceremonyView — what the screen shows at a step', () => {
  const steps = ceremonySteps(ceremonyPlaces([line(1, 'a'), line(2, 'b'), line(3, 'c')]), true);
  const rankOf = (s: (typeof steps)[number] | null) => (s === null ? null : s === 'side' ? 'side' : s.rank);

  it.each([
    [0, 0, null, 'side', false],
    [1, 1, 'side', 3, false],
    [2, 2, 3, 2, false],
    [3, 3, 2, 1, false],
    [4, 4, 1, null, true],
    // Clamped: a step beyond the list is the end, a negative one the start.
    [9, 4, 1, null, true],
    [-2, 0, null, 'side', false],
  ] as [number, number, number | 'side' | null, number | 'side' | null, boolean][])(
    'step %i → %i shown, current %s, next %s, done %s',
    (step, shown, current, next, done) => {
      const view = ceremonyView(steps, step);
      expect(view.step).toBe(shown);
      expect(view.shown).toHaveLength(shown);
      expect(rankOf(view.current)).toBe(current);
      expect(rankOf(view.next)).toBe(next);
      expect(view.done).toBe(done);
    },
  );

  it('no steps: done at once', () => {
    const view = ceremonyView([], 0);
    expect(view).toEqual({ step: 0, shown: [], current: null, next: null, done: true });
  });
});

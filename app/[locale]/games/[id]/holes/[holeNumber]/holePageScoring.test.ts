import { describe, it, expect } from 'vitest';
import type { GameForHole, PlayerForHole } from '@/lib/games/getGameWithPlayers';
import { fourPlayers, holeScores, par4Holes } from '@/lib/scoring/__fixtures__/wolf';
import type {
  ScoringHole,
  ScoringHoleScore,
  ScoringPlayer,
  WolfHoleChoice,
} from '@/lib/scoring/modes/types';
import { computeWolfContext } from './holePageScoring';

// #2313 — Type A: innsatsen Wolf-valget ganger gevinsten med, kommer fra samme
// `computeLeaderboard`-kjøring som tavla. Dette er første ledd i webkjeden
// (computeWolfContext → page.tsx → HoleClient → useWolfHole → WolfChoiceModal).
// Scenarioene er motorens egne fikstur-hjelpere, gjort om til radene hull-siden
// leser fra databasen.

const WOLF_GAME = {
  id: 'g-wolf',
  game_mode: 'wolf',
  mode_config: { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'gross' },
} as unknown as GameForHole;

/** Slot 1 går alene på hull 1. */
const HOLE_1_LONE: WolfHoleChoice = {
  holeNumber: 1,
  wolfUserId: 'p1',
  choice: 'lone',
  partnerUserId: null,
};
const TIED_HOLE_1 = holeScores(1, { p1: 4, p2: 4, p3: 4, p4: 4 });
const WON_HOLE_1 = holeScores(1, { p1: 3, p2: 4, p3: 5, p4: 5 });

function playerRows(players: ScoringPlayer[]): PlayerForHole[] {
  return players.map(({ userId, teamNumber, flightNumber, courseHandicap }) => {
    if (teamNumber == null || flightNumber == null) {
      throw new Error(`Wolf-fiksturen mangler slot eller flight for ${userId}`);
    }
    return {
      user_id: userId,
      team_number: teamNumber,
      flight_number: flightNumber,
      course_handicap: courseHandicap,
      submitted_at: null,
      submitted_by_user_id: null,
      approved_at: null,
      rejection_reason: null,
      withdrawn_at: null,
      withdrawn_by_user_id: null,
      accepted_at: null,
      paid_at: null,
      users: { name: userId, nickname: null, is_guest: false },
      tee_gender: 'mens',
    };
  });
}

function holeRows(holes: ScoringHole[]) {
  return holes.map((h) => ({
    hole_number: h.number,
    par_mens: h.par,
    par_ladies: h.par,
    par_juniors: h.par,
    stroke_index: h.strokeIndex,
  }));
}

function scoreRows(scores: ScoringHoleScore[]) {
  return scores.map((s) => ({
    user_id: s.userId,
    hole_number: s.holeNumber,
    strokes: s.gross,
  }));
}

function contextFor(opts: {
  isWolf?: boolean;
  scores: ScoringHoleScore[];
  scoresError?: Error;
  holeNumber?: number;
  game?: GameForHole;
}) {
  return computeWolfContext({
    isWolf: opts.isWolf ?? true,
    gameId: 'g-wolf',
    holeNumber: opts.holeNumber ?? 2,
    game: opts.game ?? WOLF_GAME,
    allPlayers: playerRows(fourPlayers()),
    unknownPlayer: 'Ukjent spiller',
    wolfChoicesData: [HOLE_1_LONE],
    wolfAllHolesRes: {
      success: true,
      data: holeRows(par4Holes(18)),
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    },
    wolfAllScoresRes: opts.scoresError
      ? { data: null, error: opts.scoresError }
      : { data: scoreRows(opts.scores), error: null },
  });
}

describe('computeWolfContext — innsatsen på hullet (#2313)', () => {
  it.each<[string, Parameters<typeof contextFor>[0], number | undefined]>([
    ['etter et delt hull 1 er innsatsen 2 på hull 2', { scores: TIED_HOLE_1 }, 2],
    ['etter et avgjort hull 1 er innsatsen 1 på hull 2', { scores: WON_HOLE_1 }, 1],
    ['et spill som ikke er Wolf, har ingen innsats', { isWolf: false, scores: TIED_HOLE_1 }, undefined],
    [
      'en lesing av slagene som feiler, gir ingen innsats',
      { scores: TIED_HOLE_1, scoresError: new Error('read failed') },
      undefined,
    ],
  ])('%s', (_name, opts, expected) => {
    expect(contextFor(opts).stake).toBe(expected);
  });
});

// #2314: hvem som er ulv på hullet, kommer fra motorens rad i samme kjøring,
// så nettsiden aldri låser en annen ulv enn den tavla regner med.
describe('computeWolfContext — ulven på hullet (#2314)', () => {
  const CATCH_UP_GAME = {
    ...WOLF_GAME,
    mode_config: { ...WOLF_GAME.mode_config, wolf_rotation: 'catch_up' },
  } as unknown as GameForHole;

  it('gir motorens ulv og catch-up på hull 17 i et nytt spill', () => {
    // p1 vinner hull 1 alene (+4): p2 ligger 4 bak og er sist (lavest slot).
    const ctx = contextFor({ scores: WON_HOLE_1, holeNumber: 17, game: CATCH_UP_GAME });
    expect(ctx.turn).toEqual({ userId: 'p2', catchUp: true });
    expect(ctx.rule).toBe('catch_up');
  });

  it('et gammelt spill gir den som ligger sist, uten catch-up-merket', () => {
    const ctx = contextFor({ scores: WON_HOLE_1, holeNumber: 17 });
    expect(ctx.turn).toEqual({ userId: 'p2', catchUp: false });
    expect(ctx.rule).toBe('trailing');
  });

  it('poengene er stillingen før hullet, ikke etter', () => {
    expect(contextFor({ scores: WON_HOLE_1, holeNumber: 1 }).pointsByUser).toEqual({});
    expect(contextFor({ scores: WON_HOLE_1, holeNumber: 2 }).pointsByUser).toEqual({ p1: 4 });
  });

  it('uten motoren finnes ingen ulv fra motoren, men regelen er med', () => {
    const ctx = contextFor({
      scores: WON_HOLE_1,
      scoresError: new Error('read failed'),
      holeNumber: 17,
      game: CATCH_UP_GAME,
    });
    expect(ctx.turn).toBeUndefined();
    expect(ctx.rule).toBe('catch_up');
  });
});

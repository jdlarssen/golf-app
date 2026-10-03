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
}) {
  return computeWolfContext({
    isWolf: opts.isWolf ?? true,
    gameId: 'g-wolf',
    holeNumber: 2,
    game: WOLF_GAME,
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

// #2254: fasongene startboden-testene bygger på — et spill med bundel, lokale
// slag og hjem-kortet. Samlet her fordi både `homeHero.test.ts` og
// `Home.test.tsx` trenger dem, og en kopi per suite er nettopp det
// test-disiplinen kaller en manglende delt hjelper.
import type { LocalScore } from '../data/db';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import type { HomeCard } from '../data/homeList';

export function homePlayer(
  overrides: Partial<BundlePlayer> & { userId: string },
): BundlePlayer {
  return {
    name: overrides.userId,
    nickname: null,
    teamNumber: null,
    flightNumber: 1,
    courseHandicap: 0,
    teeGender: 'mens',
    acceptedAt: '2026-09-01T08:00:00.000Z',
    submittedAt: null,
    submittedByUserId: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    withdrawnByUserId: null,
    isGuest: false,
    ...overrides,
  };
}

/** 18 hull, par 4 og indeks lik hullnummeret — enkle poeng å regne for hånd. */
export function homeBundle(opts: {
  game?: Partial<BundleGame>;
  players: BundlePlayer[];
  holes?: number;
}): GameBundle {
  const game: BundleGame = {
    id: 'g-live',
    name: 'Torsdagsrunden',
    status: 'active',
    gameMode: 'stableford',
    modeConfig: {},
    courseId: 'course-1',
    teeBoxId: null,
    requirePeerApproval: false,
    scheduledTeeOffAt: '2026-09-29T08:00:00.000Z',
    holeSegment: 'full',
    sourceGameId: null,
    createdBy: 'organiser',
    scoreVisibility: 'live',
    tournamentId: null,
    foursomesSide1TeeStarterUserId: null,
    foursomesSide2TeeStarterUserId: null,
    sideTournamentEnabled: false,
    sideLdCount: 0,
    sideCtpCount: 0,
    sideDisabledCategories: [],
    ...opts.game,
  };
  return {
    game,
    players: opts.players,
    courseName: 'Losby',
    teeBoxName: null,
    holes: Array.from({ length: opts.holes ?? 18 }, (_, i) => ({
      holeNumber: i + 1,
      parMens: 4,
      parLadies: 4,
      parJuniors: 4,
      strokeIndex: i + 1,
    })),
    fetchedAt: '2026-09-29T09:00:00.000Z',
  };
}

/** Slag på hull `from`–`to` for én spiller, samme antall på hvert hull. */
export function holeScores(
  gameId: string,
  userId: string,
  to: number,
  strokes: number,
  from = 1,
): LocalScore[] {
  return Array.from({ length: to - from + 1 }, (_, i) => {
    const holeNumber = from + i;
    return {
      id: `${gameId}:${userId}:${holeNumber}`,
      gameId,
      userId,
      holeNumber,
      strokes,
      putts: null,
      enteredBy: userId,
      clientUpdatedAt: '2026-09-29T09:00:00.000Z',
      serverUpdatedAt: '2026-09-29T09:00:00.000Z',
    };
  });
}

export function homeCard(overrides: Partial<HomeCard> & { gameId: string }): HomeCard {
  return {
    name: overrides.gameId,
    status: 'active',
    courseName: 'Losby',
    scheduledTeeOffAt: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    state: overrides.status === undefined || overrides.status === 'active' ? 'continue' : null,
    gameMode: 'stableford',
    holeSegment: 'full',
    endedAt: null,
    resultSummary: null,
    flightNumber: null,
    ...overrides,
  };
}

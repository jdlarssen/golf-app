// Native N4 (#1828): scorekortets rader og summer.
//
// Det som prøves er de tre grenene som skiller et lagkort fra et vanlig kort:
// hvem sine slag som leses, hvor tildelingen kommer fra, og hva som skjer når
// motoren ikke kan svare. Tallene i lag-tilfellet kjøres gjennom den EKTE
// motoren — et håndbygd resultat ville bare bevist at koden leser sitt eget
// felt.
import type { GameMode, ScoringGender } from '../../../../lib/scoring/modes/types';
import { strokesForHole } from '../../../../lib/scoring/strokeAllocation';
import type { LocalScore } from '../data/db';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import { buildScorecardRows } from './scorecardRows';
import { computeGameLeaderboard, type LeaderboardOutcome } from './scoringContext';

const SOLO: GameMode = 'solo_strokeplay';
const GREENSOME: GameMode = 'greensome_matchplay';
const MENS: ScoringGender = 'mens';

/** 18 hull, SI = hullnummer. */
const HOLES = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  parMens: 4,
  parLadies: 5,
  parJuniors: 4,
  strokeIndex: i + 1,
}));

function player(
  overrides: Partial<BundlePlayer> & { userId: string },
): BundlePlayer {
  return {
    name: overrides.userId,
    nickname: null,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: 0,
    teeGender: 'mens',
    submittedAt: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    ...overrides,
  };
}

function score(
  userId: string,
  holeNumber: number,
  strokes: number | null,
): LocalScore {
  return {
    gameId: 'game-1',
    userId,
    holeNumber,
    strokes,
    putts: null,
    clientUpdatedAt: '2026-08-30T10:00:00.000Z',
  } as LocalScore;
}

const GAME_BASE: BundleGame = {
  id: 'game-1',
  name: 'Testrunden',
  status: 'active',
  gameMode: GREENSOME,
  modeConfig: null,
  courseId: 'course-1',
  teeBoxId: 'tee-1',
  requirePeerApproval: false,
  scheduledTeeOffAt: null,
  holeSegment: 'full',
  sourceGameId: null,
  createdBy: 'anna',
  scoreVisibility: 'live',
  tournamentId: null,
  foursomesSide1TeeStarterUserId: null,
  foursomesSide2TeeStarterUserId: null,
};

/** Greensome 2v2: side 1 = 20 (60/40 av 20/20), side 2 = 0, allowance 50 %. */
const greensomeBundle: GameBundle = {
  game: {
    ...GAME_BASE,
    modeConfig: {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 50,
    },
  },
  players: [
    player({ userId: 'anna', teamNumber: 1, courseHandicap: 20 }),
    player({ userId: 'bjorn', teamNumber: 1, courseHandicap: 20 }),
    player({ userId: 'cato', teamNumber: 2, courseHandicap: 0 }),
    player({ userId: 'dina', teamNumber: 2, courseHandicap: 0 }),
  ],
  courseName: 'Testbanen',
  teeBoxName: 'Gul',
  holes: HOLES,
  fetchedAt: '2026-08-30T10:00:00.000Z',
};

describe('buildScorecardRows — vanlig kort', () => {
  it('leser mine egne slag og fordeler MITT banehandicap', () => {
    const { rows, totals } = buildScorecardRows({
      holes: HOLES,
      scores: [score('me', 1, 5), score('me', 2, 4), score('mate', 3, 9)],
      mode: SOLO,
      viewerId: 'me',
      teamOwnerId: null,
      teeGender: MENS,
      courseHandicap: 18,
      teamNumber: null,
      leaderboard: null,
    });

    expect(rows[0]!.strokes).toBe(5);
    expect(rows[0]!.extra).toBe(strokesForHole(18, 1));
    expect(rows[0]!.netto).toBe(5 - strokesForHole(18, 1));
    // Makkerens rad hører ikke hjemme på mitt kort.
    expect(rows[2]!.strokes).toBeNull();
    expect(rows[2]!.netto).toBeNull();
    expect(totals.playedHoles).toBe(2);
    expect(totals.totalGross).toBe(9);
    expect(totals.totalExtra).toBe(2);
    expect(totals.totalNet).toBe(7);
  });

  it('par følger tee-kjønnet, ikke herre-paret som standard', () => {
    const { rows } = buildScorecardRows({
      holes: HOLES,
      scores: [],
      mode: SOLO,
      viewerId: 'me',
      teamOwnerId: null,
      teeGender: 'ladies',
      courseHandicap: 0,
      teamNumber: null,
      leaderboard: null,
    });

    expect(rows[0]!.par).toBe(5);
  });
});

describe('buildScorecardRows — lagkort', () => {
  const leaderboard = computeGameLeaderboard(greensomeBundle, [
    score('anna', 1, 5),
    score('anna', 2, 4),
  ]);

  it('viser KAPTEINENS slag, også når det er makkeren som ser på kortet', () => {
    const { rows, totals } = buildScorecardRows({
      holes: HOLES,
      scores: [score('anna', 1, 5), score('anna', 2, 4), score('bjorn', 3, 9)],
      mode: GREENSOME,
      viewerId: 'bjorn',
      teamOwnerId: 'anna',
      teeGender: MENS,
      courseHandicap: 20,
      teamNumber: 1,
      leaderboard,
    });

    expect(rows[0]!.strokes).toBe(5);
    expect(rows[1]!.strokes).toBe(4);
    // Min egen rad på hull 3 finnes, men den er ikke lagets — laget spilte
    // ikke hullet.
    expect(rows[2]!.strokes).toBeNull();
    expect(totals.playedHoles).toBe(2);
  });

  it('netto bruker LAGETS tildeling fra motoren, ikke mitt eget handicap', () => {
    const { rows, totals } = buildScorecardRows({
      holes: HOLES,
      scores: [score('anna', 1, 5), score('anna', 2, 4)],
      mode: GREENSOME,
      viewerId: 'bjorn',
      teamOwnerId: 'anna',
      teeGender: MENS,
      // Mitt eget banehandicap er 20; laget får 10. Ville koden falt tilbake
      // til mitt, ga hull 1 og 2 to slag i stedet for ett hver.
      courseHandicap: 20,
      teamNumber: 1,
      leaderboard,
    });

    expect(rows[0]!.extra).toBe(1);
    expect(rows[0]!.netto).toBe(4);
    expect(rows[1]!.extra).toBe(1);
    expect(rows[1]!.netto).toBe(3);
    expect(totals.totalExtra).toBe(2);
    expect(totals.totalNet).toBe(7);
    // Hull 11 ligger utenfor lagets ti slag.
    expect(rows[10]!.extra).toBe(0);
  });

  it('lavsiden får ingen slag — netto er brutto', () => {
    const { rows } = buildScorecardRows({
      holes: HOLES,
      scores: [score('cato', 1, 4)],
      mode: GREENSOME,
      viewerId: 'dina',
      teamOwnerId: 'cato',
      teeGender: MENS,
      courseHandicap: 0,
      teamNumber: 2,
      leaderboard,
    });

    expect(rows[0]!.extra).toBe(0);
    expect(rows[0]!.netto).toBe(4);
  });

  it('kan ikke motoren svare, står netto som ukjent — aldri som brutto', () => {
    const blind: LeaderboardOutcome = { ok: false, problem: 'no-course' };
    const { rows, totals } = buildScorecardRows({
      holes: HOLES,
      scores: [score('anna', 1, 5)],
      mode: GREENSOME,
      viewerId: 'bjorn',
      teamOwnerId: 'anna',
      teeGender: MENS,
      courseHandicap: 20,
      teamNumber: 1,
      leaderboard: blind,
    });

    expect(rows[0]!.strokes).toBe(5);
    expect(rows[0]!.extra).toBeNull();
    expect(rows[0]!.netto).toBeNull();
    // Brutto er fortsatt kjent; netto-summen er det ikke.
    expect(totals.totalGross).toBe(5);
    expect(totals.totalExtra).toBeNull();
    expect(totals.totalNet).toBeNull();
  });

  it('uten lagnummer finnes ingen lag-tildeling å hente', () => {
    const { rows } = buildScorecardRows({
      holes: HOLES,
      scores: [score('anna', 1, 5)],
      mode: GREENSOME,
      viewerId: 'bjorn',
      teamOwnerId: 'anna',
      teeGender: MENS,
      courseHandicap: 20,
      teamNumber: null,
      leaderboard,
    });

    expect(rows[0]!.extra).toBeNull();
  });
});

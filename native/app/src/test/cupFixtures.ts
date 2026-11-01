// #2752: cupen slik `GET /api/cup/[id]` sender den, med tegningenes eksempeldata
// (Klubbmesterskapet). Brukt av `Cup.test.tsx`.
import type { AppCupMatch, AppCupResults, AppCupView } from '../../../../lib/cup/appCupView';

export const ME = 'user-me';

export function cupMatch(overrides: Partial<AppCupMatch> = {}): AppCupMatch {
  return {
    gameId: 'game-1',
    label: 'Singel 1',
    side1: 'Anne',
    side2: 'Jonas',
    status: 'notStarted',
    withdrawnName: '',
    walkoverTeam: '',
    soloPartnerName: null,
    mine: false,
    canOpen: false,
    outcome: null,
    ...overrides,
  };
}

/** Cupen midt i spillet: din kamp først, og ingenting om resultatet. */
export function liveCup(overrides: Partial<AppCupView> = {}): AppCupView {
  return {
    id: 'cup-1',
    name: 'Klubbmesterskapet',
    status: 'active',
    team1Name: 'Team Nord',
    team2Name: 'Team Sør',
    pointsToWin: 14.5,
    progress: { played: 3, total: 8 },
    lineupPending: false,
    canManage: false,
    canWithdrawSelf: false,
    selfWithdrawn: false,
    matches: [
      cupMatch({
        gameId: 'mine-1',
        label: 'Greensome 2',
        side1: 'Ola og Testspiller',
        side2: 'Kari og Per',
        status: 'inProgress',
        mine: true,
        canOpen: true,
      }),
      cupMatch({ gameId: 'other-1', label: 'Singel 4', status: 'scorecardsSubmitted' }),
      cupMatch({ gameId: 'other-2', label: 'Singel 5', side1: 'Marte', side2: 'Kari N.' }),
    ],
    results: null,
    ...overrides,
  };
}

export const RESULTS: AppCupResults = {
  winner: 1,
  winnerName: 'Team Nord',
  team1Points: 15.5,
  team2Points: 12.5,
  sideAwardPoints: { team1: 2, team2: 1 },
  mvp: { names: ['Ola Kompis'], points: 4 },
  underperformer: { names: ['Per Å.'], overPar: 7 },
  playerGroups: [
    {
      team: 1,
      teamName: 'Team Nord',
      rows: [
        {
          userId: ME,
          displayName: 'Ola Kompis',
          team: 1,
          points: 4,
          contributions: [
            {
              type: 'match',
              gameId: 'mine-1',
              matchLabel: 'Greensome 2',
              opponentLabel: 'Kari',
              outcome: 'won',
              points: 1,
            },
            { type: 'ctp', holeNumber: 7, points: 1 },
          ],
          withdrawn: false,
        },
      ],
    },
    {
      team: 2,
      teamName: 'Team Sør',
      rows: [
        {
          userId: 'kari',
          displayName: 'Kari Nord',
          team: 2,
          points: 2.5,
          contributions: [],
          withdrawn: true,
        },
      ],
    },
  ],
  sideAwards: [
    {
      holeNumber: 7,
      rows: [
        {
          id: 'side-ctp',
          kind: 'ctp',
          holeNumber: 7,
          points: 1,
          slot: 1,
          slotCount: 1,
          showSlot: false,
          outcome: 'won',
          winnerName: 'Ola Kompis',
          winnerTeam: 1,
        },
        {
          id: 'side-ld',
          kind: 'ld',
          holeNumber: 7,
          points: 1,
          slot: 2,
          slotCount: 3,
          showSlot: true,
          outcome: 'noWinner',
          winnerName: null,
          winnerTeam: null,
        },
      ],
    },
    {
      holeNumber: 12,
      rows: [
        {
          id: 'side-gir',
          kind: 'gir',
          holeNumber: 12,
          points: 0.5,
          maxPerTeam: 4,
          registered: true,
          teams: [
            { team: 1, count: 2, points: 1 },
            { team: 2, count: 0, points: 0 },
          ],
        },
      ],
    },
  ],
};

export function finishedCup(overrides: Partial<AppCupView> = {}): AppCupView {
  return liveCup({
    status: 'finished',
    progress: { played: 8, total: 8 },
    matches: [
      cupMatch({
        gameId: 'mine-1',
        label: 'Greensome 2',
        side1: 'Ola og Testspiller',
        side2: 'Kari og Per',
        status: 'played',
        mine: true,
        canOpen: true,
        outcome: { points1: 1, points2: 0, tied: false, formatted: '3&2', winnerName: 'Team Nord' },
      }),
      cupMatch({
        gameId: 'other-1',
        status: 'played',
        outcome: { points1: 0.5, points2: 0.5, tied: true, formatted: null, winnerName: null },
      }),
    ],
    results: RESULTS,
    ...overrides,
  });
}

// #2265 PR 2: en full kavalkade til testene av Kavalkaden i appen. Samme tall
// som webbens `makeFacts` (`lib/kavalkade/kavalkadeCards.test.ts`), med
// sesong-raden på formtoppen i tillegg, så start/nå/beste også tegnes.
import type { KavalkadeFacts } from '../../../../lib/kavalkade/buildKavalkadeFacts';

export function makeKavalkadeFacts(overrides: Partial<KavalkadeFacts> = {}): KavalkadeFacts {
  return {
    year: 2026,
    cutoff: '2026-12-23T23:00:00.000Z',
    rounds: 12,
    soloRounds: 10,
    teamRounds: 2,
    roundsNeeded: 3,
    personal: {
      rounds: 10,
      season: null,
      bestRound: {
        gameId: 'g1',
        gameName: 'Lørdagscup',
        courseName: 'Losby',
        brutto: 82,
        playedAt: new Date(2026, 5, 14, 10).toISOString(),
      },
      nemesisHole: { holeNumber: 7, played: 9, averageToPar: 1.44, worstStrokes: 8 },
      rival: { userId: 'u2', name: 'Ola', met: 8, decided: 8, wins: 3, losses: 4, ties: 1 },
      formPeak: {
        stretch: {
          rounds: 3,
          averageBrutto: 84,
          fromDate: new Date(2026, 5, 1, 10).toISOString(),
          toDate: new Date(2026, 6, 1, 10).toISOString(),
        },
        season: { brutto: { start: 92, now: 86, best: 82 }, netto: { start: 78, now: 72, best: 68 } },
      },
    },
    team: {
      rounds: 2,
      bestRound: {
        gameId: 'g9',
        gameName: 'Texas',
        courseName: 'Losby',
        playedAt: new Date(2026, 7, 2, 10).toISOString(),
        brutto: 68,
        teammates: [{ userId: 'u3', name: 'Kari' }],
      },
      teammates: [{ userId: 'u3', name: 'Kari', rounds: 2, averageBrutto: 70, scoredRounds: 2 }],
      bestTeammates: [{ userId: 'u3', name: 'Kari', rounds: 2, averageBrutto: 70, scoredRounds: 2 }],
    },
    gang: {
      members: 6,
      games: 12,
      topWinner: { userId: 'u2', name: 'Ola', count: 5 },
      mostBirdies: { userId: 'u1', name: 'Jørgen', count: 11 },
      mostSnowmen: { userId: 'u4', name: 'Per', count: 4 },
      tightestFinish: {
        gameId: 'g4',
        gameName: 'Tirsdagsrunden',
        courseName: 'Losby',
        playedAt: new Date(2026, 4, 5, 10).toISOString(),
        strokeMargin: 1,
        leader: { userId: 'u1', name: 'Jørgen', brutto: 84 },
        runnerUp: { userId: 'u2', name: 'Ola', brutto: 85 },
      },
    },
    ...overrides,
  };
}

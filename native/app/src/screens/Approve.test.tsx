// #2228: den ene render-testen (Type C) for godkjenningen.
//
// Foldingen selv (`foldLocalScores`) er ren logikk og testet i
// `teamPlay.test.ts`. Det som blir igjen er koblingen: at skjermen faktisk
// leser de foldede radene. Sletter kapteinen på et enballslag kontoen midt i
// runden, ligger hullene som alt er ført, igjen på den trukne raden. Den nye
// kapteinens kort skal likevel vise dem, slik webbens godkjenningsside gjør.
//
// Bevisst avvik fra Type C («ikke konkrete tall»): tallet under er fikstur-input
// som går rett gjennom, ikke et regnet resultat. Bare en render-test som ser
// det på skjermen, fanger at skjermen igjen leser rå rader.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { render, screen, waitFor, within } from '@testing-library/react-native';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import type { ScreenProps } from '../navigation';
import { Approve } from './Approve';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
// #2201: merk-lest har sin egen test; manuell mock i lib/__mocks__/.
jest.mock('../lib/useMarkVisitRead');
jest.mock('../data/gameBundle', () => ({
  loadGameBundle: jest.fn(async () => mockState.bundle),
  refreshGameBundle: jest.fn(async () => mockState.bundle),
}));
jest.mock('../data/seedScores', () => ({ seedGameScores: jest.fn(async () => 0) }));
// Slag-innhentingen (#2228) drar inn realtime og «appen kom tilbake».
jest.mock('../data/realtime', () => ({
  subscribeGameScores: jest.fn(() => () => undefined),
}));
jest.mock('../data/syncTriggers', () => require('../test/syncTriggersMock'));
jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listScoresForGame: jest.fn(async () => mockState.scores),
}));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'rival-a', email: 'rival@example.test' }),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

// Navnet må starte med `mock`: jest.mock-factoryene heises over importene.
const mockState: { bundle: GameBundle | null; scores: unknown[] } = {
  bundle: null,
  scores: [],
};

function player(overrides: Partial<BundlePlayer> & { userId: string }): BundlePlayer {
  return {
    name: overrides.userId,
    nickname: null,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: 0,
    teeGender: 'mens',
    acceptedAt: '2026-09-17T08:00:00.000Z',
    submittedAt: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    withdrawnByUserId: null,
    submittedByUserId: null,
    isGuest: false,
    ...overrides,
  };
}

describe('Approve', () => {
  it('viser hullene en trukket kaptein førte på den nye kapteinens kort', async () => {
    const game: BundleGame = {
      id: 'game-1',
      name: 'Testrunden',
      status: 'active',
      gameMode: 'texas_scramble',
      modeConfig: { kind: 'texas_scramble', team_size: 2, teams_count: 2, team_handicap_pct: 25 },
      courseId: 'course-1',
      teeBoxId: 'tee-1',
      requirePeerApproval: true,
      scheduledTeeOffAt: null,
      holeSegment: 'full',
      sourceGameId: null,
      createdBy: 'rival-a',
      scoreVisibility: 'live',
      tournamentId: null,
      foursomesSide1TeeStarterUserId: null,
      foursomesSide2TeeStarterUserId: null,
      sideTournamentEnabled: false,
      sideLdCount: 0,
      sideCtpCount: 0,
      sideDisabledCategories: [],
    };
    const submitted = '2026-09-17T12:00:00.000Z';
    mockState.bundle = {
      game,
      players: [
        // «kaptein» er lex-min på lag 1 og slettet kontoen etter hull 9.
        player({ userId: 'kaptein', teamNumber: 1, withdrawnAt: '2026-09-17T10:00:00.000Z' }),
        player({
          userId: 'ny-kaptein',
          name: 'Nora Ny',
          teamNumber: 1,
          submittedAt: submitted,
          submittedByUserId: 'ny-kaptein',
        }),
        player({ userId: 'rival-a', teamNumber: 2 }),
        player({ userId: 'rival-b', teamNumber: 2 }),
      ],
      courseName: 'Testbanen',
      teeBoxName: 'Gul',
      holes: Array.from({ length: 18 }, (_, i) => ({
        holeNumber: i + 1,
        parMens: 4,
        parLadies: 4,
        parJuniors: 4,
        strokeIndex: i + 1,
      })),
      fetchedAt: '2026-09-17T08:00:00.000Z',
    };
    mockState.scores = Array.from({ length: 18 }, (_, i) => {
      const holeNumber = i + 1;
      const userId = holeNumber <= 9 ? 'kaptein' : 'ny-kaptein';
      return {
        id: `game-1#${userId}#${holeNumber}`,
        gameId: 'game-1',
        userId,
        holeNumber,
        strokes: holeNumber === 3 ? 3 : 4,
        putts: null,
        enteredBy: userId,
        clientUpdatedAt: '2026-09-17T09:00:00.000Z',
        serverUpdatedAt: null,
      };
    });

    await render(
      <Approve
        {...({
          route: { params: { gameId: 'game-1' } },
          navigation: { navigate: jest.fn(), setOptions: jest.fn() },
        } as unknown as ScreenProps<'Approve'>)}
      />,
    );

    await waitFor(() => {
      const card = screen.getByTestId('summary-ny-kaptein');
      expect(within(card).getByTestId('scorecard-col-3')).toHaveProp(
        'accessibilityLabel',
        'Hull 3, par 4, 3 slag',
      );
    });
  });

  it('sier fra når spillet ikke kunne hentes, i stedet for å stå på «Henter …» (#1954 A2)', async () => {
    // Ingen bundel i cachen og en henting som feiler (nettet falt): skjermen
    // skal si det, som hull- og tavleskjermen gjør, ikke vente for alltid.
    mockState.bundle = null;
    const { refreshGameBundle } = require('../data/gameBundle') as { refreshGameBundle: jest.Mock };
    refreshGameBundle.mockRejectedValueOnce(new Error('Network request failed'));

    await render(
      <Approve
        {...({
          route: { params: { gameId: 'game-1' } },
          navigation: { navigate: jest.fn(), setOptions: jest.fn() },
        } as unknown as ScreenProps<'Approve'>)}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('approve-error')).toHaveTextContent('Fikk ikke tak i spillet.'));
  });
});

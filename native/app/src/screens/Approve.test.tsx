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
import { Platform } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { bottomPadding, setBottomInset } from '../test/safeAreaMock';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import type { ScreenProps } from '../navigation';
import { Approve } from './Approve';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
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

const texasGame: BundleGame = {
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
  leagueRoundId: null,
  foursomesSide1TeeStarterUserId: null,
  foursomesSide2TeeStarterUserId: null,
  sideTournamentEnabled: false,
  sideLdCount: 0,
  sideCtpCount: 0,
  sideDisabledCategories: [],
};

describe('Approve', () => {
  function rigPending(): void {
    const submitted = '2026-09-17T12:00:00.000Z';
    mockState.bundle = {
      game: texasGame,
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

  }

  async function renderApprove(): Promise<void> {
    await render(
      <Approve
        {...({
          route: { params: { gameId: 'game-1' } },
          navigation: { navigate: jest.fn(), setOptions: jest.fn() },
        } as unknown as ScreenProps<'Approve'>)}
      />,
    );
  }

  it('viser hullene en trukket kaptein førte på den nye kapteinens kort', async () => {
    rigPending();
    await renderApprove();

    await waitFor(() => {
      const card = screen.getByTestId('summary-ny-kaptein');
      expect(within(card).getByTestId('scorecard-col-3')).toHaveProp(
        'accessibilityLabel',
        'Hull 3, par 4, 3 slag',
      );
    });
  });

  // #1954 D3 (kontrollrunden på #2624): begge rullevisningene ender over
  // systemlinja, kortene som venter og tom-tilstanden.
  it('kortene som venter: luften under står over systemlinja', async () => {
    rigPending();
    setBottomInset(48);
    try {
      await renderApprove();
      await waitFor(() => expect(screen.getByTestId('summary-ny-kaptein')).toBeTruthy());
      expect(bottomPadding('approve-screen')).toBe(32 + 48);
    } finally {
      setBottomInset(0);
    }
  });

  it('ingenting å godkjenne: luften under står over systemlinja', async () => {
    rigPending();
    // En runde uten godkjenning: ingenting å godkjenne her.
    const bundle = mockState.bundle as GameBundle;
    mockState.bundle = { ...bundle, game: { ...bundle.game, requirePeerApproval: false } };
    setBottomInset(48);
    try {
      await renderApprove();
      await waitFor(() => expect(screen.getByTestId('approve-empty')).toBeTruthy());
      expect(bottomPadding('approve-screen')).toBe(20 + 48);
    } finally {
      setBottomInset(0);
    }
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

    await waitFor(() => expect(screen.getByTestId('approve-error')).toBeTruthy());
    // #1954 D2: en vei videre, som de andre spillskjermene (blokka er testet i GameLoadFailed.test).
    expect(screen.getByTestId('game-retry')).toBeTruthy();
    const calls = refreshGameBundle.mock.calls.length;
    await fireEvent.press(screen.getByTestId('game-retry'));
    expect(refreshGameBundle.mock.calls.length).toBe(calls + 1);
  });

  // #2560: «Du får beskjed når kortet kommer» stemmer ikke på Android, som ikke
  // har push ved lansering. Raden under en makker som ikke har levert er den
  // eneste som sier det.
  it.each([
    ['ios', 'Du får beskjed når kortet kommer.'],
    ['android', 'Kortet står her når det er levert.'],
  ] as const)('sier «%s» under en makker som ikke har levert', async (os, hint) => {
    const platform = jest.replaceProperty(Platform, 'OS', os);
    try {
      mockState.bundle = {
        game: texasGame,
        players: [
          player({ userId: 'ny-kaptein', name: 'Nora Ny', teamNumber: 1 }),
          player({ userId: 'rival-a', teamNumber: 2 }),
          player({ userId: 'rival-b', teamNumber: 2 }),
        ],
        courseName: 'Testbanen',
        teeBoxName: 'Gul',
        holes: [],
        fetchedAt: '2026-09-17T08:00:00.000Z',
      };
      mockState.scores = [];
      await render(
        <Approve
          {...({
            route: { params: { gameId: 'game-1' } },
            navigation: { navigate: jest.fn(), setOptions: jest.fn() },
          } as unknown as ScreenProps<'Approve'>)}
        />,
      );
      expect(await screen.findByText(hint)).toBeTruthy();
    } finally {
      platform.restore();
    }
  });
});

// #1874: den ene render-testen (Type C) for roster-raden på spill-hjem.
//
// Hva raden SIER er ren logikk og dekket i `roster.test.ts` — det gjentas ikke
// her. Det som blir igjen er de to koblingene ingen ren funksjon kan bekrefte:
//
//  1. **Merkelappene kommer faktisk ut på skjermen** — wolf-raden med sine hull
//     og uten «Flight N»/«Lag N», round robin uten noe, lag-formatene som før.
//     Eieren leste «Flight 3 · Lag 3» som «dere går hver for dere»; det er
//     motsatt av sant, og feilen var synlig først i tapptest.
//  2. **Den lengste merkelappen får plass.** «Wolf på hull 3, 6, 9, 12, 15 og
//     18» er så lang som det blir, og uten `flexShrink` renner den ut av raden
//     på en smal telefon (#1842: tekst som klippes er tekst som lyver).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import type { ScreenProps } from '../navigation';
import { homeBundle, homePlayer } from '../test/homeFixtures';
import { GameHome, RosterRow } from './GameHome';

// Skjermen drar inn arrangør-seksjonen, som drar inn klienten. Raden selv rører
// ingenting av det — mocken er der bare for at modulgrafen skal kunne lastes.
jest.mock('../supabase', () => require('../test/supabaseMock'));
// Skjerm-testen (#2067) under: bundel og slag fra enheten, ingen nett.
jest.mock('../data/gameBundle', () => ({
  loadGameBundle: jest.fn(async () => mockState.bundle),
  refreshGameBundle: jest.fn(async () => mockState.bundle),
}));
jest.mock('../data/seedScores', () => ({ seedGameScores: jest.fn(async () => 0) }));
// Venterommet (#2219) lytter på spillets status. Testen fyrer oppdateringen selv.
jest.mock('../data/realtime', () => ({
  subscribeGameStatus: jest.fn(() => () => undefined),
}));
jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listScoresForGame: jest.fn(async () => mockState.scores),
}));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'me', email: 'meg@example.test' }),
}));
// Fokus-refetchen kommer fra navigasjonen; effekten er den samme uten en hel
// NavigationContainer.
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
    courseHandicap: 12,
    teeGender: 'mens',
    acceptedAt: null,
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

/** n spillere med slot 1..n, slik `assignRotationSlots` setter dem ved start. */
function rotation(n: number): BundlePlayer[] {
  return Array.from({ length: n }, (_, i) =>
    player({ userId: `p${i + 1}`, name: `Spiller ${i + 1}`, teamNumber: i + 1, flightNumber: i + 1 }),
  );
}

const HIDDEN = { includeHiddenElements: true };

describe('RosterRow', () => {
  it('tegner rotasjons-plassen som hull i wolf, ingenting i round robin, og lag som før', async () => {
    // 1. Wolf: hullene plassen gir Wolf-rollen på — og INGEN Flight/Lag.
    const four = rotation(4);
    const { rerender } = await render(
      <RosterRow player={four[2]} isMe={false} gameMode="wolf" players={four} />,
    );
    expect(screen.getByTestId('roster-marks-p3')).toHaveTextContent(
      'Wolf på hull 3, 7, 11 og 15',
    );
    expect(screen.queryByText(/Flight/)).toBeNull();
    expect(screen.queryByText(/Lag/)).toBeNull();

    // 2. Den lengste merkelappen som finnes står hel, og raden lar den krympe
    //    i stedet for å la den renne ut av kanten.
    const three = rotation(3);
    await rerender(
      <RosterRow player={three[2]} isMe={false} gameMode="wolf" players={three} />,
    );
    const longest = screen.getByTestId('roster-marks-p3');
    expect(longest).toHaveTextContent('Wolf på hull 3, 6, 9, 12, 15 og 18');
    expect(longest).toHaveStyle({ flexShrink: 1 });

    // 3. Round robin: rekkefølgen er rent kosmetisk for poengene, og nettsiden
    //    viser heller ingenting. Ingen merkelapp i det hele tatt.
    await rerender(
      <RosterRow player={four[1]} isMe={false} gameMode="round_robin" players={four} />,
    );
    expect(screen.getByTestId('roster-row-p2')).toBeTruthy();
    expect(screen.queryByTestId('roster-marks-p2')).toBeNull();

    // 4. Lag-formatene er urørt av denne slicen.
    const teamPlayer = player({
      userId: 'a',
      name: 'Anna',
      teamNumber: 1,
      flightNumber: 2,
    });
    await rerender(
      <RosterRow player={teamPlayer} isMe gameMode="best_ball" players={[teamPlayer]} />,
    );
    expect(screen.getByTestId('roster-marks-a')).toHaveTextContent('Flight 2 · Lag 1');
    expect(screen.getByTestId('roster-row-a')).toHaveTextContent(/Anna \(deg\)/);
  });

  it('statusen står med hake for levert og godkjent, som ord alene for trukket (#1879)', async () => {
    const submitted = player({
      userId: 's',
      flightNumber: 1,
      submittedAt: '2026-09-01T09:00:00.000Z',
    });
    const { rerender } = await render(
      <RosterRow player={submitted} isMe={false} gameMode="solo_strokeplay" players={[submitted]} />,
    );
    expect(screen.getByTestId('roster-marks-s')).toHaveTextContent('Flight 1');
    expect(screen.getByTestId('roster-status-s')).toHaveTextContent('Levert');
    // Haken er dekor — ordet bærer meningen — så skjermleseren ser den ikke.
    expect(screen.queryByTestId('roster-status-check-s')).toBeNull();
    expect(screen.getByTestId('roster-status-check-s', HIDDEN)).toBeTruthy();

    const approved = { ...submitted, approvedAt: '2026-09-01T10:00:00.000Z' };
    await rerender(
      <RosterRow player={approved} isMe={false} gameMode="solo_strokeplay" players={[approved]} />,
    );
    expect(screen.getByTestId('roster-status-s')).toHaveTextContent('Godkjent');
    expect(screen.getByTestId('roster-status-check-s', HIDDEN)).toBeTruthy();

    const withdrawn = { ...approved, withdrawnAt: '2026-09-01T11:00:00.000Z' };
    await rerender(
      <RosterRow player={withdrawn} isMe={false} gameMode="solo_strokeplay" players={[withdrawn]} />,
    );
    expect(screen.getByTestId('roster-status-s')).toHaveTextContent('Trukket');
    expect(screen.queryByTestId('roster-status-check-s', HIDDEN)).toBeNull();
  });
});

describe('GameHome', () => {
  it('med eget kort levert og et makkerkort klart, går «Lever kortet du har ført» til scorekortet (#2200)', async () => {
    const game: BundleGame = {
      id: 'game-1',
      name: 'Testrunden',
      status: 'active',
      gameMode: 'stableford',
      modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
      courseId: 'course-1',
      teeBoxId: 'tee-1',
      requirePeerApproval: true,
      scheduledTeeOffAt: null,
      holeSegment: 'full',
      sourceGameId: null,
      createdBy: 'other',
      scoreVisibility: 'live',
      tournamentId: null,
      foursomesSide1TeeStarterUserId: null,
      foursomesSide2TeeStarterUserId: null,
      sideTournamentEnabled: false,
      sideLdCount: 0,
      sideCtpCount: 0,
      sideDisabledCategories: [],
    } as BundleGame;
    const at = '2026-09-17T08:00:00.000Z';
    mockState.bundle = {
      game,
      players: [
        player({ userId: 'me', acceptedAt: at, submittedAt: at, submittedByUserId: 'me' }),
        player({ userId: 'ola', acceptedAt: at }),
        player({ userId: 'other', acceptedAt: at }),
      ],
      courseName: 'Testbanen',
      teeBoxName: 'Gul',
      holes: Array.from({ length: 18 }, (_, i) => ({
        holeNumber: i + 1,
        parMens: 4,
        parLadies: 5,
        parJuniors: 4,
        strokeIndex: i + 1,
      })),
      fetchedAt: at,
    };
    // I førte alle 18 hullene for meg selv og for Ola.
    mockState.scores = ['me', 'ola'].flatMap((userId) =>
      Array.from({ length: 18 }, (_, i) => ({
        id: `game-1#${userId}#${i + 1}`,
        gameId: 'game-1',
        userId,
        holeNumber: i + 1,
        strokes: 4,
        putts: null,
        enteredBy: 'me',
        clientUpdatedAt: at,
        serverUpdatedAt: null,
      })),
    );
    const navigation = { navigate: jest.fn() };

    await render(
      <GameHome
        {...({
          route: { params: { gameId: 'game-1' } },
          navigation,
        } as unknown as ScreenProps<'GameHome'>)}
      />,
    );

    await waitFor(async () => {
      await fireEvent.press(screen.getByTestId('deliver-flight-cta'));
      expect(navigation.navigate).toHaveBeenLastCalledWith('Scorecard', { gameId: 'game-1' });
    });
    expect(screen.getByTestId('submitted-banner')).toBeTruthy();
  });

  it('venterommet teller ned og åpner seg når runden starter (#2219); kapteinen har slettet kontoen: 9 hull på kapteinen og 9 på makkeren gir lever-knappen (#2067)', async () => {
    const game: BundleGame = {
      id: 'game-1',
      name: 'Testrunden',
      status: 'active',
      gameMode: 'texas_scramble',
      modeConfig: {
        kind: 'texas_scramble',
        team_size: 2,
        teams_count: 2,
        team_handicap_pct: 25,
      },
      courseId: 'course-1',
      teeBoxId: 'tee-1',
      requirePeerApproval: false,
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
    const accepted = '2026-09-17T08:00:00.000Z';
    const active: GameBundle = {
      game,
      players: [
        // «makker» er lex-min og var kaptein; kontoen er slettet etter hull 9.
        player({
          userId: 'makker',
          teamNumber: 1,
          acceptedAt: accepted,
          withdrawnAt: '2026-09-17T10:00:00.000Z',
        }),
        player({ userId: 'me', teamNumber: 1, acceptedAt: accepted }),
        player({ userId: 'rival-a', teamNumber: 2, acceptedAt: accepted }),
        player({ userId: 'rival-b', teamNumber: 2, acceptedAt: accepted }),
      ],
      courseName: 'Testbanen',
      teeBoxName: 'Gul',
      holes: Array.from({ length: 18 }, (_, i) => ({
        holeNumber: i + 1,
        parMens: 4,
        parLadies: 5,
        parJuniors: 4,
        strokeIndex: i + 1,
      })),
      fetchedAt: '2026-09-17T08:00:00.000Z',
    };
    // #2219: spilleren står på spill-hjem før tee-off.
    mockState.bundle = {
      ...active,
      game: {
        ...game,
        status: 'scheduled',
        scheduledTeeOffAt: new Date(Date.now() + 12 * 60_000).toISOString(),
      },
    };
    mockState.scores = Array.from({ length: 18 }, (_, i) => {
      const holeNumber = i + 1;
      const userId = holeNumber <= 9 ? 'makker' : 'me';
      return {
        id: `game-1#${userId}#${holeNumber}`,
        gameId: 'game-1',
        userId,
        holeNumber,
        strokes: 4,
        putts: null,
        enteredBy: userId,
        clientUpdatedAt: '2026-09-17T09:00:00.000Z',
        serverUpdatedAt: null,
      };
    });
    const navigation = { navigate: jest.fn() };

    await render(
      <GameHome
        {...({
          route: { params: { gameId: 'game-1' } },
          navigation,
        } as unknown as ScreenProps<'GameHome'>)}
      />,
    );

    // Venterommet teller ned til tee-off.
    await waitFor(() => {
      expect(screen.getByTestId('waiting-room-countdown')).toBeTruthy();
    });
    expect(screen.getByTestId('waiting-room')).toBeTruthy();
    expect(screen.queryByTestId('primary-cta')).toBeNull();

    // Runden starter (cron ved tee-off eller arrangøren). Realtime melder det,
    // og skjermen henter spillet uten at spilleren går ut og inn.
    const { subscribeGameStatus } = require('../data/realtime') as {
      subscribeGameStatus: jest.Mock;
    };
    mockState.bundle = active;
    await act(async () => {
      subscribeGameStatus.mock.calls.at(-1)![1].onUpdate({ id: 'game-1', status: 'active' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('primary-cta')).toBeTruthy();
    });
    expect(screen.queryByTestId('waiting-room')).toBeNull();
    // Leveringen går via scorekortet; en runde med hull igjen peker på neste
    // hull. Trykket står inne i waitFor fordi bundelen og slagene lastes hver
    // for seg: CTA-en finnes før slagene har landet.
    await waitFor(async () => {
      await fireEvent.press(screen.getByTestId('primary-cta'));
      expect(navigation.navigate).toHaveBeenLastCalledWith('Scorecard', { gameId: 'game-1' });
    });
  });
});

// #2358: angre-knappen står bare hos den som trakk seg selv. Et trekk
// arrangøren satte, er arrangørens å angre — serveren nekter uansett.
describe('GameHome — trukket-banneret (#2358)', () => {
  it.each([
    ['meg selv', 'me', true],
    ['arrangøren', 'other', false],
  ])('trukket av %s: angre-knappen vises=%s', async (_who, by, showsUndo) => {
    const at = '2026-09-17T08:00:00.000Z';
    mockState.bundle = {
      game: {
        id: 'game-1',
        name: 'Testrunden',
        status: 'active',
        gameMode: 'stableford',
        modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        requirePeerApproval: false,
        scheduledTeeOffAt: null,
        holeSegment: 'full',
        sourceGameId: null,
        createdBy: 'other',
        scoreVisibility: 'live',
        tournamentId: null,
        foursomesSide1TeeStarterUserId: null,
        foursomesSide2TeeStarterUserId: null,
        sideTournamentEnabled: false,
        sideLdCount: 0,
        sideCtpCount: 0,
        sideDisabledCategories: [],
      } as BundleGame,
      players: [
        player({ userId: 'me', acceptedAt: at, withdrawnAt: at, withdrawnByUserId: by }),
        player({ userId: 'other', acceptedAt: at }),
      ],
      courseName: 'Testbanen',
      teeBoxName: 'Gul',
      holes: Array.from({ length: 18 }, (_, i) => ({
        holeNumber: i + 1,
        parMens: 4,
        parLadies: 5,
        parJuniors: 4,
        strokeIndex: i + 1,
      })),
      fetchedAt: at,
    };
    mockState.scores = [];

    await render(
      <GameHome
        {...({
          route: { params: { gameId: 'game-1' } },
          navigation: { navigate: jest.fn() },
        } as unknown as ScreenProps<'GameHome'>)}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('withdrawn-banner')).toBeTruthy());
    expect(screen.queryByTestId('withdrawn-undo') !== null).toBe(showsUndo);
  });
});

// #2255: spillets side er én startbillett. Rekkefølgen og hva som står per
// status låses her; hva billetten og stubben SIER, er låst i sine egne tester.
describe('GameHome — startbilletten (#2255)', () => {
  /** testID-ene på skjermen, i den rekkefølgen de tegnes. */
  function testIdsInOrder(): string[] {
    const ids: string[] = [];
    const walk = (node: unknown): void => {
      if (node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      const element = node as { props?: { testID?: string }; children?: unknown };
      if (element.props?.testID) ids.push(element.props.testID);
      walk(element.children);
    };
    walk(screen.toJSON());
    return ids;
  }

  const SECTIONS = ['game-ticket', 'game-tiles', 'roster', 'rules-section'];

  it.each([
    ['planlagt', { status: 'scheduled' }, ['game-ticket', 'roster', 'rules-section'], 'waiting-room'],
    ['utkast', { status: 'draft' }, ['game-ticket', 'roster', 'rules-section'], 'ticket-draft'],
    ['pågår', { status: 'active' }, ['game-ticket', 'game-tiles', 'rules-section'], 'primary-cta'],
    ['avsluttet', { status: 'finished' }, ['game-ticket', 'game-tiles', 'rules-section'], 'finished-banner'],
  ])('%s: seksjonene i riktig rekkefølge', async (_case, game, expected, stubId) => {
    mockState.bundle = homeBundle({
      game: { id: 'game-1', modeConfig: { kind: 'stableford', team_size: 1 }, ...game },
      players: [homePlayer({ userId: 'me' }), homePlayer({ userId: 'ola' })],
    });
    mockState.scores = [];

    await render(
      <GameHome
        {...({
          route: { params: { gameId: 'game-1' } },
          navigation: { navigate: jest.fn() },
        } as unknown as ScreenProps<'GameHome'>)}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('game-ticket')).toBeTruthy());
    expect(screen.getByTestId(stubId)).toBeTruthy();
    expect(testIdsInOrder().filter((id) => SECTIONS.includes(id))).toEqual(expected);
    expect(screen.getByTestId('rules-heading')).toHaveTextContent('Regler: Stableford');
  });

  it('pågående runde: Tavla og Scorekort går til sine skjermer, og Regler står', async () => {
    mockState.bundle = homeBundle({
      game: { id: 'game-1', modeConfig: { kind: 'stableford', team_size: 1 } },
      players: [homePlayer({ userId: 'me' })],
    });
    mockState.scores = [];
    const navigation = { navigate: jest.fn() };

    await render(
      <GameHome
        {...({ route: { params: { gameId: 'game-1' } }, navigation } as unknown as ScreenProps<'GameHome'>)}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('game-tiles')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('open-leaderboard'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Leaderboard', { gameId: 'game-1' });
    await fireEvent.press(screen.getByTestId('open-scorecard'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Scorecard', { gameId: 'game-1' });
    await fireEvent.press(screen.getByTestId('open-rules'));
    expect(navigation.navigate).toHaveBeenCalledTimes(2);
  });

  it('stengt runde (halv cup-dag): bare Regler-flisa, og stengeteksten med nettlenken', async () => {
    mockState.bundle = homeBundle({
      game: { id: 'game-1', gameMode: 'singles_matchplay', modeConfig: {}, holeSegment: 'front9' },
      players: [homePlayer({ userId: 'me', teamNumber: 1 }), homePlayer({ userId: 'ola', teamNumber: 2 })],
    });
    mockState.scores = [];

    await render(
      <GameHome
        {...({
          route: { params: { gameId: 'game-1' } },
          navigation: { navigate: jest.fn() },
        } as unknown as ScreenProps<'GameHome'>)}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('game-tiles')).toBeTruthy());
    expect(screen.getByTestId('open-rules')).toBeTruthy();
    expect(screen.queryByTestId('open-leaderboard')).toBeNull();
    expect(screen.queryByTestId('open-scorecard')).toBeNull();
    expect(screen.getByTestId('format-gate-link')).toBeTruthy();
  });
});

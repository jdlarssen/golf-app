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
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import type { ScreenProps } from '../navigation';
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
  it('kapteinen har slettet kontoen: 9 hull på kapteinen og 9 på makkeren gir lever-knappen (#2067)', async () => {
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
    mockState.bundle = {
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

    await waitFor(() => {
      expect(screen.getByTestId('primary-cta')).toBeTruthy();
    });
    // Leveringen går via scorekortet; en runde med hull igjen peker på neste
    // hull. Trykket står inne i waitFor fordi bundelen og slagene lastes hver
    // for seg: CTA-en finnes før slagene har landet.
    await waitFor(async () => {
      await fireEvent.press(screen.getByTestId('primary-cta'));
      expect(navigation.navigate).toHaveBeenLastCalledWith('Scorecard', { gameId: 'game-1' });
    });
  });
});

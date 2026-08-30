// Native N3 (#1825), utvidet i N4 (#1828): den ene render-testen (Type C) på
// spillerskjermene.
//
// Den svarer på det ingen ren funksjon kan svare på: at kortene faktisk tegnes
// og at et tapp på «+» havner i N2-datalaget med RIKTIGE argumenter. To
// varianter av samme spørsmål, og begge kan gå galt uten at noen Type A-test
// ser det:
//
//  1. **Solo:** `userId` = makkeren, `enteredBy` = meg. Bytter de to plass,
//     skriver appen stille i feil rad.
//  2. **Lag (greensome):** hele laget deler kapteinens rad, så `userId` skal
//     være KAPTEINEN selv når det er jeg som taster. Her er feilen enda
//     stillere: begge id-ene finnes i spillet, og RLS slipper begge gjennom.
//
// Alt utenfor skjermen er mocket (nett, SQLite, realtime); flight-regelen,
// kaptein-regelen, par-oppslaget og lag-handicapet er ekte delt kode.
//
// ÉN render-test per skjerm (docs/test-discipline.md, Type C) — tallene og
// reglene er dekket av Type A-testene, så det som står igjen her er koblingen.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { writeScore } from '../data/writeScore';
import type { ScreenProps } from '../navigation';
import { Hole } from './Hole';

const GAME_ID = 'game-1';

const HOLES = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  parMens: 4,
  parLadies: 5,
  parJuniors: 4,
  strokeIndex: i + 1,
}));

const GAME_BASE = {
  id: GAME_ID,
  name: 'Testrunden',
  status: 'active',
  modeConfig: null as unknown,
  courseId: 'course-1',
  teeBoxId: 'tee-1',
  requirePeerApproval: true,
  scheduledTeeOffAt: null,
  holeSegment: 'full',
  sourceGameId: null,
  createdBy: 'me',
  scoreVisibility: 'live',
  tournamentId: null,
  foursomesSide1TeeStarterUserId: null,
  foursomesSide2TeeStarterUserId: null,
};

const PLAYER_BASE = {
  nickname: null,
  teamNumber: null as number | null,
  flightNumber: null as number | null,
  teeGender: 'mens',
  submittedAt: null,
  approvedAt: null,
  rejectionReason: null,
  withdrawnAt: null,
};

const mockSoloBundle = {
  game: { ...GAME_BASE, gameMode: 'solo_strokeplay' },
  players: [
    { ...PLAYER_BASE, userId: 'me', name: 'Meg Selv', courseHandicap: 18 },
    { ...PLAYER_BASE, userId: 'mate', name: 'Makker Makkersen', courseHandicap: 9 },
  ],
  courseName: 'Testbanen',
  teeBoxName: 'Gul',
  holes: HOLES,
  fetchedAt: '2026-08-30T10:00:00.000Z',
};

// Greensome: 2v2 alternate shot. Lag 1 er «makker» + «me» — kapteinen er
// lex-min, altså «makker», og det er DEN raden begge taster i.
// Side-handicap 60/40 gir lag 1 = 20 og lag 2 = 0; allowance 50 % gir høysiden
// 10 slag, altså ett ekstra slag på SI 1.
const mockTeamBundle = {
  game: {
    ...GAME_BASE,
    gameMode: 'greensome_matchplay',
    modeConfig: {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 50,
    },
  },
  players: [
    { ...PLAYER_BASE, userId: 'me', name: 'Meg Selv', teamNumber: 1, courseHandicap: 20 },
    {
      ...PLAYER_BASE,
      userId: 'makker',
      name: 'Makker Makkersen',
      teamNumber: 1,
      courseHandicap: 20,
    },
    { ...PLAYER_BASE, userId: 'rival-a', name: 'Rival Ravn', teamNumber: 2, courseHandicap: 0 },
    { ...PLAYER_BASE, userId: 'rival-b', name: 'Rita Rask', teamNumber: 2, courseHandicap: 0 },
  ],
  courseName: 'Testbanen',
  teeBoxName: 'Gul',
  holes: HOLES,
  fetchedAt: '2026-08-30T10:00:00.000Z',
};

// Hvilken bundel skjermen får, satt per test. Navnet må starte med `mock` —
// jest.mock-factoryene heises over importene og ser bare slike variabler.
const mockState: { bundle: unknown } = { bundle: mockSoloBundle };

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/writeScore', () => ({
  writeScore: jest.fn(async () => undefined),
}));
jest.mock('../data/gameBundle', () => ({
  loadGameBundle: jest.fn(async () => mockState.bundle),
  refreshGameBundle: jest.fn(async () => mockState.bundle),
}));
jest.mock('../data/seedScores', () => ({
  seedGameScores: jest.fn(async () => 0),
}));
jest.mock('../data/realtime', () => ({
  subscribeGameScores: jest.fn(() => () => undefined),
}));
jest.mock('../data/syncWorker', () => ({ drainQueue: jest.fn(async () => undefined) }));
jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listScoresForGame: jest.fn(async () => []),
}));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'me', email: 'meg@example.test' }),
}));
// Skjermene henter fokus-refetchen fra navigasjonen. Å dra inn en hel
// NavigationContainer for én render-test er mer rigg enn testen er verdt —
// effekten er den samme: kjør callbacken når skjermen står på skjermen.
jest.mock('@react-navigation/native', () => ({
   
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

// RNTL 14 er asynkron hele veien: både `render` og `fireEvent` returnerer
// løfter (de wrapper act selv). Uten await settes aldri `screen`.
async function renderHole(holeNumber = 1) {
  const navigation = { setParams: jest.fn(), navigate: jest.fn() };
  await render(
    <Hole
      {...({
        route: { params: { gameId: GAME_ID, holeNumber } },
        navigation,
      } as unknown as ScreenProps<'Hole'>)}
    />,
  );
  return navigation;
}

describe('Hole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.bundle = mockSoloBundle;
  });

  it('tegner hele flighten og sender et tapp på «+» videre til writeScore', async () => {
    await renderHole();

    // Begge spillerne er i samme flight (≤4 aktive → én gruppe, delt regel).
    await waitFor(() => {
      expect(screen.getByText('Makker Makkersen')).toBeTruthy();
    });
    expect(screen.getByText('Meg Selv (deg)')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('player-mate-plus'));

    await waitFor(() => {
      expect(writeScore).toHaveBeenCalledWith({
        gameId: GAME_ID,
        userId: 'mate',
        holeNumber: 1,
        strokes: 1,
        enteredBy: 'me',
      });
    });

    // Samme render, andre stepper: putt-tastingen skal sende PUTTS ALENE.
    // Sendes `strokes` med her, vasker mergen ut slaget som står der (#939).
    await fireEvent.press(screen.getByTestId('player-me-putts-plus'));

    await waitFor(() => {
      expect(writeScore).toHaveBeenCalledWith({
        gameId: GAME_ID,
        userId: 'me',
        holeNumber: 1,
        putts: 2,
        enteredBy: 'me',
      });
    });
  });

  it('lag-format: ett kort per lag, og tappet havner i KAPTEINENS rad', async () => {
    mockState.bundle = mockTeamBundle;
    await renderHole();

    // Ett kort per lag — ikke fire spillerkort.
    await waitFor(() => {
      expect(screen.getByTestId('team-card-1')).toBeTruthy();
    });
    expect(screen.getByText('Lag 1 · Makker, Meg (ditt lag)')).toBeTruthy();
    expect(screen.getByText('Lag 2 · Rival, Rita')).toBeTruthy();
    expect(screen.queryByTestId('player-card-me')).toBeNull();

    // Badgen er motorens tall: høysiden får 10 slag, altså ett på SI 1.
    expect(screen.getByTestId('team-1-extra').props.children).toBe('+1');
    // Lavsiden får ingen — og da vises ingen badge i det hele tatt.
    expect(screen.queryByTestId('team-2-extra')).toBeNull();

    // Jeg taster, men raden er kapteinens («makker» er lex-min av laget).
    await fireEvent.press(screen.getByTestId('team-1-plus'));

    await waitFor(() => {
      expect(writeScore).toHaveBeenCalledWith({
        gameId: GAME_ID,
        userId: 'makker',
        holeNumber: 1,
        strokes: 1,
        enteredBy: 'me',
      });
    });

    // Putter går i SAMME lagrad, og fortsatt uten `strokes` (#939).
    await fireEvent.press(screen.getByTestId('team-1-putts-plus'));

    await waitFor(() => {
      expect(writeScore).toHaveBeenCalledWith({
        gameId: GAME_ID,
        userId: 'makker',
        holeNumber: 1,
        putts: 2,
        enteredBy: 'me',
      });
    });
  });
});

// Native N3 (#1825): den ene render-testen (Type C) på spillerskjermene.
//
// Den svarer på det ingen ren funksjon kan svare på: at flighten faktisk tegnes
// og at et tapp på «+» havner i N2-datalaget med RIKTIGE argumenter — særlig
// `userId` = makkeren og `enteredBy` = meg. Bytter de to plass, skriver appen
// stille i feil rad, og ingen Type A-test ville sett det.
//
// Alt utenfor skjermen er mocket (nett, SQLite, realtime); flight-regelen og
// par-oppslaget er ekte delt kode.
//
// ÉN render-test på skjermen (docs/test-discipline.md, Type C) — tallene og
// reglene er dekket av Type A-testene, så det som står igjen her er koblingen.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { writeScore } from '../data/writeScore';
import type { ScreenProps } from '../navigation';
import { Hole } from './Hole';

const GAME_ID = 'game-1';

const mockBundle = {
  game: {
    id: GAME_ID,
    name: 'Testrunden',
    status: 'active',
    gameMode: 'solo_strokeplay',
    modeConfig: null,
    courseId: 'course-1',
    teeBoxId: 'tee-1',
    requirePeerApproval: true,
    scheduledTeeOffAt: null,
    holeSegment: 'full',
    sourceGameId: null,
    createdBy: 'me',
  },
  players: [
    {
      userId: 'me',
      name: 'Meg Selv',
      nickname: null,
      teamNumber: null,
      flightNumber: null,
      courseHandicap: 18,
      teeGender: 'mens',
      submittedAt: null,
      approvedAt: null,
      rejectionReason: null,
      withdrawnAt: null,
    },
    {
      userId: 'mate',
      name: 'Makker Makkersen',
      nickname: null,
      teamNumber: null,
      flightNumber: null,
      courseHandicap: 9,
      teeGender: 'mens',
      submittedAt: null,
      approvedAt: null,
      rejectionReason: null,
      withdrawnAt: null,
    },
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
  fetchedAt: '2026-08-30T10:00:00.000Z',
};

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/writeScore', () => ({
  writeScore: jest.fn(async () => undefined),
}));
jest.mock('../data/gameBundle', () => ({
  loadGameBundle: jest.fn(async () => mockBundle),
  refreshGameBundle: jest.fn(async () => mockBundle),
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
});

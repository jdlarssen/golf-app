// Native N4 (#1828): den ene render-testen (Type C) på leaderboard-skjermen.
//
// Den svarer på det ingen ren funksjon kan svare på: at slagene fra den lokale
// basen faktisk går gjennom adapteren og den DELTE motoren og kommer ut som
// rader på skjermen — med spillerne i motorens rekkefølge, ikke rosterets.
// Tallene selv er dekket av Type A-testene og av 1176 tester i `lib/scoring`.
//
// Alt utenfor skjermen er mocket (nett, SQLite, realtime); adapteren, motoren
// og reveal-predikatet er ekte delt kode.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { render, screen, waitFor } from '@testing-library/react-native';
import { ResultView } from '../components/leaderboard/ResultView';
import type { ModeResult } from '../../../../lib/scoring/modes/types';
import type { ScreenProps } from '../navigation';
import { Leaderboard, LeaderboardBody } from './Leaderboard';

const GAME_ID = 'game-1';

const bundleGame = {
  id: GAME_ID,
  name: 'Torsdagsrunden',
  status: 'active',
  gameMode: 'stableford',
  modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
  courseId: 'course-1',
  teeBoxId: 'tee-1',
  requirePeerApproval: false,
  scheduledTeeOffAt: null,
  holeSegment: 'full',
  sourceGameId: null,
  createdBy: 'me',
  scoreVisibility: 'live',
  tournamentId: null,
  foursomesSide1TeeStarterUserId: null,
  foursomesSide2TeeStarterUserId: null,
};

// Par 4 på alle hull, banehandicap 0: 4 slag = 2 poeng, 6 slag = 0 poeng.
// Makkeren taster bedre enn meg, så motoren skal sette HAM øverst.
const mockBundle = {
  game: bundleGame,
  players: [
    {
      userId: 'me',
      name: 'Meg Selv',
      nickname: null,
      teamNumber: null,
      flightNumber: null,
      courseHandicap: 0,
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
      courseHandicap: 0,
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
    parLadies: 4,
    parJuniors: 4,
    strokeIndex: i + 1,
  })),
  fetchedAt: '2026-08-30T10:00:00.000Z',
};

const mockLocalScores = [
  { userId: 'me', holeNumber: 1, strokes: 6 },
  { userId: 'mate', holeNumber: 1, strokes: 4 },
  { userId: 'me', holeNumber: 2, strokes: 4 },
  { userId: 'mate', holeNumber: 2, strokes: 4 },
].map((row) => ({
  id: `${GAME_ID}:${row.userId}:${row.holeNumber}`,
  gameId: GAME_ID,
  putts: null,
  enteredBy: 'me',
  clientUpdatedAt: '2026-08-30T10:00:00.000Z',
  serverUpdatedAt: null,
  ...row,
}));

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/gameBundle', () => ({
  loadGameBundle: jest.fn(async () => mockBundle),
  refreshGameBundle: jest.fn(async () => mockBundle),
}));
jest.mock('../data/seedScores', () => ({ seedGameScores: jest.fn(async () => 0) }));
jest.mock('../data/realtime', () => ({
  subscribeGameScores: jest.fn(() => () => undefined),
}));
jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listScoresForGame: jest.fn(async () => mockLocalScores),
}));
jest.mock('@react-navigation/native', () => ({

  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

/** Verdien i én celle, som tekst. */
function cell(rowKey: string, columnKey: string): string {
  return String(
    screen.getByTestId(`leaderboard-table-row-${rowKey}-${columnKey}`).props.children,
  );
}

async function renderLeaderboard() {
  await render(
    <Leaderboard
      {...({
        route: { params: { gameId: GAME_ID } },
        navigation: { navigate: jest.fn(), setParams: jest.fn() },
      } as unknown as ScreenProps<'Leaderboard'>)}
    />,
  );
}

describe('Leaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('regner ut poengtabellen fra de lokale slagene og tegner motorens rekkefølge', async () => {
    await renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-table')).toBeTruthy();
    });

    // Makkeren: 2 + 2 poeng, plass 1. Meg: 0 + 2 poeng, plass 2. Rekkefølgen
    // og plasseringen kommer fra motoren — appen sorterer ikke om.
    expect(cell('mate', 'rank')).toBe('1');
    expect(cell('mate', 'name')).toBe('Makker Makkersen');
    expect(cell('mate', 'points')).toBe('4');

    expect(cell('me', 'rank')).toBe('2');
    expect(cell('me', 'name')).toBe('Meg Selv');
    expect(cell('me', 'points')).toBe('2');

    // Ingen kanal nummer to: skjermen henger på abonnementet appen alt har.
    const { subscribeGameScores } = require('../data/realtime') as {
      subscribeGameScores: jest.Mock;
    };
    expect(subscribeGameScores).toHaveBeenCalledTimes(1);
    expect(subscribeGameScores.mock.calls[0]![0]).toBe(GAME_ID);
  });
});

describe('LeaderboardBody', () => {
  const withGame = (overrides: Record<string, unknown>) =>
    ({ ...mockBundle, game: { ...bundleGame, ...overrides } }) as never;

  it('holder netto og poeng tilbake i en reveal-runde som fortsatt går', async () => {
    // Stableford i reveal: brutto vises, poengene ikke. En «Poeng»-kolonne her
    // ville vært hele lekkasjen.
    await render(
      <LeaderboardBody
        bundle={withGame({ scoreVisibility: 'reveal', status: 'active' })}
        scores={mockLocalScores}
      />,
    );

    expect(screen.getByTestId('leaderboard-gross-only')).toBeTruthy();
    expect(screen.queryByText('Poeng')).toBeNull();
    // Brutto for meg: 6 + 4. Ingen plassering.
    expect(cell('me', 'gross')).toBe('10');
    expect(screen.queryByText('#')).toBeNull();
  });

  it('viser INGENTING i en matchplay-duell som spilles blindt', async () => {
    await render(
      <LeaderboardBody
        bundle={withGame({
          gameMode: 'singles_matchplay',
          modeConfig: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
          scoreVisibility: 'reveal',
          status: 'active',
        })}
        scores={mockLocalScores}
      />,
    );

    expect(screen.getByTestId('leaderboard-hidden')).toBeTruthy();
    expect(screen.queryByTestId('leaderboard-table')).toBeNull();
  });

  it('henviser til nettsiden for et gatet format, uten å røre motoren', async () => {
    await render(
      <LeaderboardBody
        bundle={withGame({
          gameMode: 'wolf',
          modeConfig: { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' },
        })}
        scores={mockLocalScores}
      />,
    );
    expect(screen.getByTestId('leaderboard-web-only')).toBeTruthy();
  });

  it('sier rolig fra når ingen har ført et slag ennå', async () => {
    await render(<LeaderboardBody bundle={withGame({})} scores={[]} />);
    expect(screen.getByTestId('leaderboard-empty')).toBeTruthy();
  });
});

describe('ResultView', () => {
  it('viser en rolig henvisning i stedet for å krasje på en ukjent resultatform', async () => {
    // Eldre app, nyere server: motoren sender en `kind` denne versjonen ikke
    // kjenner. `tsc` fanger den når vi bygger MOT den nye motoren — dette er
    // fallskjermen for tilfellet der appen alt står på telefonen.
    const fromTheFuture = { kind: 'lasersnooker', players: [] } as unknown as ModeResult;
    await render(
      <ResultView result={fromTheFuture} status="active" nameOf={() => 'Ukjent'} />,
    );
    expect(screen.getByTestId('leaderboard-web-only')).toBeTruthy();
    expect(screen.getByText('Formatet vises på nettsiden ennå.')).toBeTruthy();
  });
});

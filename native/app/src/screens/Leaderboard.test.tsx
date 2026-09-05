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

  // #1978: best ball er det ene formatet der webben klipper den LIVE tabellen
  // til første halvdel. Fikstur med to lag på par 4 og banehandicap 0, så
  // tallene er lette å regne i hodet: lag 1 fører 4 på hvert hull, lag 2 fører
  // 5. Front 9 = 36 mot 45; hele runden = 72 mot 90. Forskjellen mellom de to
  // ER regresjonen.
  const BEST_BALL_TEAMS = [
    { userId: 'me', name: 'Meg Selv', teamNumber: 1, strokes: 4 },
    { userId: 'mate', name: 'Makker Makkersen', teamNumber: 1, strokes: 5 },
    { userId: 'rival', name: 'Rival Rivalsen', teamNumber: 2, strokes: 5 },
    { userId: 'rival2', name: 'Andre Rival', teamNumber: 2, strokes: 6 },
  ];

  const bestBallBundle = (holesScored: number) =>
    ({
      ...mockBundle,
      game: {
        ...bundleGame,
        gameMode: 'best_ball',
        modeConfig: { kind: 'best_ball', team_size: 2, teams_count: 2 },
        status: 'active',
        scoreVisibility: 'live',
      },
      players: BEST_BALL_TEAMS.map((p) => ({
        userId: p.userId,
        name: p.name,
        nickname: null,
        teamNumber: p.teamNumber,
        flightNumber: 1,
        courseHandicap: 0,
        teeGender: 'mens',
        submittedAt: null,
        approvedAt: null,
        rejectionReason: null,
        withdrawnAt: null,
      })),
      _holesScored: holesScored,
    }) as never;

  const bestBallScores = (holesScored: number) =>
    BEST_BALL_TEAMS.flatMap((p) =>
      Array.from({ length: holesScored }, (_, i) => ({
        id: `${GAME_ID}:${p.userId}:${i + 1}`,
        gameId: GAME_ID,
        userId: p.userId,
        holeNumber: i + 1,
        strokes: p.strokes,
        putts: null,
        enteredBy: p.userId,
        clientUpdatedAt: '2026-08-30T10:00:00.000Z',
        serverUpdatedAt: null,
      })),
    );

  it('klipper best ball til front 9 mens runden går — som nettsiden', async () => {
    // Alle 18 hull ført. Webben viser likevel bare front 9 og skriver at
    // resten kommer når arrangøren avslutter; appen viste 18-hulls-summen.
    await render(
      <LeaderboardBody bundle={bestBallBundle(18)} scores={bestBallScores(18)} />,
    );

    expect(screen.getByTestId('leaderboard-first-half-locked')).toBeTruthy();
    // 36/45 er ni-hulls-summen. 72/90 ville vært lekkasjen.
    expect(cell('1', 'net')).toBe('36');
    expect(cell('2', 'net')).toBe('45');
  });

  it('sier fra før noe lag er gjennom hull 9', async () => {
    await render(<LeaderboardBody bundle={bestBallBundle(3)} scores={bestBallScores(3)} />);

    expect(screen.getByTestId('leaderboard-first-half-waiting')).toBeTruthy();
    expect(screen.queryByTestId('leaderboard-table')).toBeNull();
  });

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
    // Patsome er formatet som fortsatt står i gaten — #1832 slapp wolf og BBB
    // ut da valg-UI-en kom på hull-siden.
    await render(
      <LeaderboardBody
        bundle={withGame({
          gameMode: 'patsome',
          modeConfig: {
            kind: 'patsome',
            team_size: 2,
            teams_count: 2,
            patsome_scoring: 'net',
          },
        })}
        scores={mockLocalScores}
      />,
    );
    expect(screen.getByTestId('leaderboard-gated-format')).toBeTruthy();
    // Ordlyden er `gateMessage('mode')`. Nettsiden nevnes KUN her (#1844), og
    // #1891 fester «Åpne runden på nettsiden»-knappen på nettopp denne grenen.
    expect(screen.getByText('Dette formatet føres på nettsiden ennå.')).toBeTruthy();
    expect(screen.getByTestId('leaderboard-gated-format-link')).toBeTruthy();
  });

  it('sier at oppsettet mangler — ikke at formatet finnes på nettsiden', async () => {
    // Raden gir to motstridende svar på hva runden er: `game_mode` sier
    // stableford, `mode_config.kind` sier skins. Motoren narrower på `kind`,
    // så en gjetning her ville gitt tall som ser riktige ut. Fram til #1844
    // delte grenen tekst med den gatede over og sendte spilleren til en
    // nettside-tabell vi ikke vet finnes.
    //
    // En config som bare MANGLER er noe annet og havner ikke her lenger
    // (#1976) — den utledes fra `game_mode`, slik webben gjør.
    await render(
      <LeaderboardBody
        bundle={withGame({ modeConfig: { kind: 'skins', team_size: 1, skins_scoring: 'net' } })}
        scores={mockLocalScores}
      />,
    );
    expect(screen.getByTestId('leaderboard-missing-config')).toBeTruthy();
    expect(screen.getByText('Formatet er ikke satt opp for denne runden.')).toBeTruthy();
    expect(screen.queryByTestId('leaderboard-gated-format')).toBeNull();
    // Og ingen knapp: nettsiden har ikke svaret her (eierpresisering på #1891).
    expect(screen.queryByTestId('leaderboard-gated-format-link')).toBeNull();
  });

  it('sier rolig fra når ingen har ført et slag ennå', async () => {
    await render(<LeaderboardBody bundle={withGame({})} scores={[]} />);
    expect(screen.getByTestId('leaderboard-empty')).toBeTruthy();
  });
});

describe('ResultView', () => {
  // Én render-test per ny visning (#1832). De svarer på ÉN ting: at motorens
  // rader faktisk blir til rader på skjermen, og at `ResultView` ruter de to
  // kindsene dit. Tallene selv er motorens og er dekket i `lib/scoring`.
  it('tegner wolf-totalene og hullene wolfen har valgt på', async () => {
    const result = {
      kind: 'wolf',
      scoring: 'net',
      rotation: 'random_with_trailing',
      players: [
        {
          userId: 'me',
          teamNumber: 1,
          totalPoints: 4,
          wolfHolesPlayed: 2,
          blindWolfWins: 0,
          rank: 1,
          tiedWith: [],
        },
        {
          userId: 'mate',
          teamNumber: 2,
          totalPoints: 1,
          wolfHolesPlayed: 1,
          blindWolfWins: 0,
          rank: 2,
          tiedWith: [],
        },
      ],
      holes: [
        {
          holeNumber: 1,
          par: 4,
          strokeIndex: 1,
          wolfUserId: 'me',
          choice: 'partner',
          partnerUserId: 'mate',
          stake: 2,
          outcome: 'wolf_side_wins',
          players: [],
          pointsByPlayer: { me: 4, mate: 4, other: 0 },
        },
        // Ingen har valgt her ennå — raden skal ikke tegnes i det hele tatt.
        {
          holeNumber: 2,
          par: 4,
          strokeIndex: 2,
          wolfUserId: 'mate',
          choice: null,
          partnerUserId: null,
          stake: 1,
          outcome: 'pending',
          players: [],
          pointsByPlayer: {},
        },
      ],
    } as unknown as ModeResult;

    await render(
      <ResultView
        result={result}
        status="active"
        gameId={GAME_ID}
        nameOf={(userId) => (userId === 'me' ? 'Meg Selv' : 'Makker Makkersen')}
      />,
    );

    expect(screen.getByTestId('wolf-view')).toBeTruthy();
    expect(cell('me', 'points')).toBe('4');
    expect(cell('mate', 'rank')).toBe('2');

    expect(screen.getByTestId('wolf-hole-1-line').props.children).toBe(
      'Wolf: Meg Selv · Partner: Makker Makkersen · Wolf vant',
    );
    expect(screen.getByTestId('wolf-hole-1-points').props.children).toBe(
      'Meg Selv +4 · Makker Makkersen +4',
    );
    expect(screen.queryByTestId('wolf-hole-2')).toBeNull();
  });

  it('tegner BBB-poengene med fordelingen bak dem', async () => {
    const result = {
      kind: 'bingo_bango_bongo',
      holes: [],
      players: [
        {
          userId: 'me',
          bingos: 2,
          bangos: 1,
          bongos: 0,
          totalPoints: 3,
          rank: 1,
          tiedWith: [],
        },
        {
          userId: 'mate',
          bingos: 0,
          bangos: 1,
          bongos: 1,
          totalPoints: 2,
          rank: 2,
          tiedWith: [],
        },
      ],
    } as unknown as ModeResult;

    await render(
      <ResultView
        result={result}
        status="active"
        gameId={GAME_ID}
        nameOf={(userId) => (userId === 'me' ? 'Meg Selv' : 'Makker Makkersen')}
      />,
    );

    expect(screen.getByTestId('bbb-view')).toBeTruthy();
    expect(screen.getByTestId('bbb-player-me-points').props.children).toBe(3);
    expect(
      screen.getByTestId('bbb-player-mate-breakdown').props.children.join(''),
    ).toBe('0 bingo · 1 bango · 1 bongo');
    // Noen har poeng, så «ingenting registrert ennå» skal ikke stå der.
    expect(screen.queryByTestId('bbb-no-points')).toBeNull();
  });

  it('sier rolig fra i stedet for å krasje på en ukjent resultatform', async () => {
    // Eldre app, nyere server: motoren sender en `kind` denne versjonen ikke
    // kjenner. `tsc` fanger den når vi bygger MOT den nye motoren — dette er
    // fallskjermen for tilfellet der appen alt står på telefonen.
    const fromTheFuture = { kind: 'lasersnooker', players: [] } as unknown as ModeResult;
    await render(
      <ResultView
        result={fromTheFuture}
        status="active"
        gameId={GAME_ID}
        nameOf={() => 'Ukjent'}
      />,
    );
    expect(screen.getByTestId('leaderboard-unknown-format')).toBeTruthy();
    // Nevner IKKE nettsiden (#1844): vi vet ikke om formatet finnes der.
    expect(screen.getByText('Appen kjenner ikke dette formatet ennå.')).toBeTruthy();
    expect(screen.queryByTestId('leaderboard-gated-format-link')).toBeNull();
  });
});

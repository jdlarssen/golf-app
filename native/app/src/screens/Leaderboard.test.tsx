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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ResultView } from '../components/leaderboard/ResultView';
import type { ModeResult } from '../../../../lib/scoring/modes/types';
import type { Settlement } from '../../../../lib/scoring/settlement';
import type { GameBundle } from '../data/gameBundle';
import { soloBoardFor } from '../lib/soloBoard';
import { teamBoardFor } from '../lib/teamBoard';
import type { ScreenProps } from '../navigation';
import { fireForeground } from '../test/syncTriggersMock';
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
/** Et annet spill enn standardbundelen, når en test trenger det. */
const mockBundleOverride: { current: unknown } = { current: null };

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

// #2561: kronebryteren (rot-`lib/launchRules.ts`), styrt per test.
const mockKroner = { on: false };
jest.mock('../../../../lib/launchRules', () => ({
  get SHOW_KRONER_IN_APP() {
    return mockKroner.on;
  },
}));
beforeEach(() => {
  mockKroner.on = false;
});
jest.mock('../supabase', () => require('../test/supabaseMock'));
// #2579: tavla vet hvem som ser den («DU», stripa), og stripa står over sikker sone.
jest.mock('../session', () => ({ useSession: () => ({ userId: 'me', email: null }) }));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
// #2201: merk-lest har sin egen test; manuell mock i lib/__mocks__/.
jest.mock('../lib/useMarkVisitRead');
jest.mock('../data/gameBundle', () => ({
  loadGameBundle: jest.fn(async () => mockBundleOverride.current ?? mockBundle),
  refreshGameBundle: jest.fn(async () => mockBundleOverride.current ?? mockBundle),
}));
jest.mock('../data/seedScores', () => ({ seedGameScores: jest.fn(async () => 0) }));
// Wolf-valgene (#2255 PR 3b): testen styrer når og om de kommer.
const mockFetchWolfChoices = jest.fn();
jest.mock('../data/choices', () => ({
  fetchWolfChoices: (...args: unknown[]) => mockFetchWolfChoices(...args),
  fetchBingoBangoBongoHoles: jest.fn(async () => []),
}));
jest.mock('../data/realtime', () => ({
  subscribeGameScores: jest.fn(() => () => undefined),
}));
jest.mock('../data/syncTriggers', () => require('../test/syncTriggersMock'));
jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listScoresForGame: jest.fn(async () => mockLocalScores),
}));
jest.mock('@react-navigation/native', () => ({

  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  useIsFocused: () => true,
}));

/** Verdien i én celle, som tekst. */
function cell(rowKey: string, columnKey: string): string {
  return String(
    screen.getByTestId(`leaderboard-table-row-${rowKey}-${columnKey}`).props.children,
  );
}

/** Rekkefølgen på lagtavlas kort (#2579 PR 2), som lagnumre. */
function teamOrder(): string[] {
  return screen
    .getAllByTestId(/^team-row-\d+$/)
    .map((row) => String(row.props.testID).replace('team-row-', ''));
}

/** Rekkefølgen på tavlas rader (#2579), som userId-er. */
function boardOrder(): string[] {
  return screen
    .getAllByTestId(/^board-row-[a-z]+$/)
    .map((row) => String(row.props.testID).replace('board-row-', ''));
}

const mockNavigate = jest.fn();

async function renderLeaderboard() {
  await render(
    <Leaderboard
      {...({
        route: { params: { gameId: GAME_ID } },
        navigation: { navigate: mockNavigate, setParams: jest.fn(), setOptions: jest.fn() },
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
    // og plasseringen kommer fra motoren — appen sorterer ikke om. Tavla
    // (#2579) tegner dem.
    expect(boardOrder()).toEqual(['mate', 'me']);
    expect(screen.getByTestId('board-row-mate-place')).toHaveTextContent('1');
    expect(screen.getByTestId('board-row-mate-name')).toHaveTextContent('Makker Makkersen', { exact: false });
    expect(screen.getByTestId('board-row-mate-total')).toHaveTextContent('4');

    expect(screen.getByTestId('board-row-me-place')).toHaveTextContent('2');
    expect(screen.getByTestId('board-row-me-name')).toHaveTextContent('Meg Selv', { exact: false });
    expect(screen.getByTestId('board-row-me-total')).toHaveTextContent('2');

    // Stripas knapp går til neste hull, som Hjem-kortet: jeg har ført 1 og 2.
    await fireEvent.press(screen.getByTestId('board-strip-action'));
    expect(mockNavigate).toHaveBeenCalledWith(
      'Hole',
      expect.objectContaining({ gameId: GAME_ID, holeNumber: 3 }),
    );

    // Ingen kanal nummer to: skjermen henger på abonnementet appen alt har.
    const { subscribeGameScores } = require('../data/realtime') as {
      subscribeGameScores: jest.Mock;
    };
    expect(subscribeGameScores).toHaveBeenCalledTimes(1);
    expect(subscribeGameScores.mock.calls[0]![0]).toBe(GAME_ID);

    // #2093: kanalen tilbake etter et brudd → slagene hentes på nytt.
    const { seedGameScores } = require('../data/seedScores') as {
      seedGameScores: jest.Mock;
    };
    expect(seedGameScores).toHaveBeenCalledTimes(1);
    await act(async () => {
      subscribeGameScores.mock.calls[0]![1].onResubscribed();
    });
    expect(seedGameScores).toHaveBeenCalledTimes(2);

    // #2228: appen kom i forgrunnen og sokkelen overlevde. Slagene og spillet
    // hentes likevel på nytt, uten en ny kanal.
    const { refreshGameBundle } = require('../data/gameBundle') as {
      refreshGameBundle: jest.Mock;
    };
    const bundleCalls = refreshGameBundle.mock.calls.length;
    await act(async () => {
      fireForeground();
    });
    expect(seedGameScores).toHaveBeenCalledTimes(3);
    expect(refreshGameBundle).toHaveBeenCalledTimes(bundleCalls + 1);
    expect(subscribeGameScores).toHaveBeenCalledTimes(1);
  });
});

describe('Leaderboard — ferdig tavle (#2579)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });
  afterEach(() => {
    mockBundleOverride.current = null;
  });

  it('stripas knapp åpner scorekortet', async () => {
    mockBundleOverride.current = { ...mockBundle, game: { ...bundleGame, status: 'finished' } };
    await renderLeaderboard();
    await waitFor(() => expect(screen.getByTestId('board-strip-action')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('board-strip-action'));
    expect(mockNavigate).toHaveBeenCalledWith('Scorecard', { gameId: GAME_ID });
  });
});

describe('Leaderboard — hentingen av slagene (#2255 PR 3a)', () => {
  it('feiler den (uten nett): tavla fra telefonens slag, og en linje som sier det', async () => {
    const { seedGameScores } = require('../data/seedScores') as { seedGameScores: jest.Mock };
    seedGameScores.mockRejectedValueOnce(new Error('nett'));
    await renderLeaderboard();
    await waitFor(() => expect(screen.getByTestId('leaderboard-seed-failed')).toBeTruthy());
    expect(screen.getByTestId('leaderboard-table')).toBeTruthy();
  });

  it('lykkes den: ingen linje', async () => {
    await renderLeaderboard();
    await waitFor(() => expect(screen.getByTestId('leaderboard-table')).toBeTruthy());
    expect(screen.queryByTestId('leaderboard-seed-failed')).toBeNull();
  });
});

describe('Leaderboard — Wolf-valgene (#2255 PR 3b)', () => {
  const wolfBundle = () => ({
    ...mockBundle,
    game: {
      ...mockBundle.game,
      gameMode: 'wolf',
      modeConfig: { kind: 'wolf', team_size: 1, teams_count: 4, wolf_scoring: 'net' },
    },
  });

  afterEach(() => {
    mockBundleOverride.current = null;
    mockFetchWolfChoices.mockReset();
  });

  // #1954 D2: uten lagret kopi og uten svar (tidstaket) sto bare «Fikk ikke
  // tak i spillet.», uten en vei videre. Nå har den «Prøv igjen», som Spill-hjem.
  it('spillet kom ikke, og ingenting er lagret: «Prøv igjen» henter på nytt', async () => {
    const { loadGameBundle, refreshGameBundle } = require('../data/gameBundle') as {
      loadGameBundle: jest.Mock;
      refreshGameBundle: jest.Mock;
    };
    loadGameBundle.mockResolvedValueOnce(undefined);
    refreshGameBundle.mockRejectedValueOnce(new TypeError('Network request failed (timeout)'));
    await renderLeaderboard();
    await waitFor(() =>
      expect(screen.getByTestId('game-error')).toHaveTextContent('Fikk ikke tak i spillet. Sjekk nettet og prøv igjen.'),
    );
    await fireEvent.press(screen.getByTestId('game-retry'));
    await waitFor(() => expect(screen.queryByTestId('game-error')).toBeNull());
  });

  it('mens første henting går: et hjul, ikke «Fikk ikke tak i valgene»', async () => {
    mockBundleOverride.current = wolfBundle();
    mockFetchWolfChoices.mockReturnValue(new Promise(() => undefined));
    await renderLeaderboard();
    await waitFor(() => expect(screen.getByTestId('leaderboard-spinner')).toBeTruthy());
    expect(screen.queryByTestId('leaderboard-missing-choices')).toBeNull();
  });

  it('når hentingen feiler: den ærlige beskjeden', async () => {
    mockBundleOverride.current = wolfBundle();
    mockFetchWolfChoices.mockRejectedValue(new Error('nett'));
    await renderLeaderboard();
    await waitFor(() => expect(screen.getByTestId('leaderboard-missing-choices')).toBeTruthy());
    expect(screen.getByTestId('leaderboard-missing-choices')).toHaveTextContent(
      'Fikk ikke tak i valgene som avgjør poengene. Tabellen kommer når nettet er tilbake.',
    );
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

  // `holesByTeam` overstyrer antallet for enkeltlag (#1982: lag 2 henger etter).
  const bestBallScores = (holesScored: number, holesByTeam: Record<number, number> = {}) =>
    BEST_BALL_TEAMS.flatMap((p) =>
      Array.from({ length: holesByTeam[p.teamNumber] ?? holesScored }, (_, i) => ({
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

  // Lagtavla (#2579 PR 2) får modellen fra skjermen, som i appen.
  const bestBallBody = (holesScored: number, holesByTeam: Record<number, number> = {}) => {
    const bundle = bestBallBundle(holesScored);
    const scores = bestBallScores(holesScored, holesByTeam);
    return { bundle, scores, teamBoard: teamBoardFor({ bundle, scores, userId: 'me' }) };
  };

  it('klipper best ball til front 9 mens runden går — som nettsiden', async () => {
    // Alle 18 hull ført. Webben viser likevel bare front 9 og skriver at
    // resten kommer når arrangøren avslutter; appen viste 18-hulls-summen.
    await render(<LeaderboardBody {...bestBallBody(18)} />);

    expect(screen.getByTestId('leaderboard-first-half-locked')).toBeTruthy();
    // 36/45 er ni-hulls-summen. 72/90 ville vært lekkasjen.
    expect(teamOrder()).toEqual(['1', '2']);
    expect(screen.getByTestId('team-row-1-total')).toHaveTextContent('36');
    expect(screen.getByTestId('team-row-2-total')).toHaveTextContent('45');
    // Hullene står ved summen (#1982), og teller bare front 9.
    expect(screen.getByTestId('team-row-1-under')).toHaveTextContent(/^9\D/);
    expect(screen.getByTestId('team-row-2-under')).toHaveTextContent(/^9\D/);
  });

  it('lister trukne spillere under den ferdige best ball-tavla, som nettsiden (#1954 A3)', async () => {
    // Best ball viser lista bare når spillet er ferdig (webbens `full`); regelen
    // per visning er testet som ren funksjon i `withdrawnBoard.test.ts`.
    const bundle = bestBallBundle(18) as unknown as {
      game: Record<string, unknown>;
      players: { userId: string; withdrawnAt: string | null }[];
    };
    bundle.game = { ...bundle.game, status: 'finished' };
    bundle.players = bundle.players.map((p) =>
      p.userId === 'rival2' ? { ...p, withdrawnAt: '2026-08-30T11:00:00.000Z' } : p,
    );
    const scores = bestBallScores(18);
    await render(
      <LeaderboardBody
        bundle={bundle as never}
        scores={scores}
        teamBoard={teamBoardFor({ bundle: bundle as never, scores, userId: 'me' })}
      />,
    );

    const section = screen.getByTestId('withdrawn-players');
    expect(section).toHaveTextContent(/^Trukne spillere/);
    expect(screen.getByTestId('withdrawn-player-rival2')).toHaveTextContent('Andre RivalTrukket');
    expect(screen.queryByTestId('withdrawn-player-me')).toBeNull();
  });

  it('viser hvor mange hull hvert lag har spilt når lagene er ulikt langt (#1982)', async () => {
    // Lag 1 er gjennom hull 9 og åpner porten; lag 2 har ført 7. Motoren
    // teller hullene som mangler som 0, så lag 2 leder på 35 mot 36. Uten
    // hullene ved summen sa ingenting på skjermen at summene gjelder ulikt antall hull.
    await render(<LeaderboardBody {...bestBallBody(9, { 2: 7 })} />);

    expect(screen.getByTestId('leaderboard-first-half-locked')).toBeTruthy();
    expect(teamOrder()).toEqual(['2', '1']);
    expect(screen.getByTestId('team-row-1-under')).toHaveTextContent(/^9\D/);
    expect(screen.getByTestId('team-row-2-under')).toHaveTextContent(/^7\D/);
    expect(screen.getByTestId('team-row-2-total')).toHaveTextContent('35');
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

  // #2221 ga resultatskjermen et pengeoppgjør når spillet har kroner per enhet.
  // #2561: appen viser ingen kroner ved lansering (eieren 13.10, rot-
  // `lib/launchRules.ts`), så kortet står bare når bryteren er på. Makker vinner
  // hull 1, hull 2 er likt: 1 skin mot 0. Beløpene er Type A-dekket i
  // `lib/scoring/settlement.test.ts`.
  it('#2561: pengeoppgjøret følger kronebryteren', async () => {
    mockKroner.on = false;
    const skinsConfig = { kind: 'skins', team_size: 1, skins_scoring: 'gross' };
    const { rerender } = await render(
      <LeaderboardBody
        bundle={withGame({ gameMode: 'skins', modeConfig: skinsConfig })}
        scores={mockLocalScores}
      />,
    );
    expect(screen.getByTestId('skins-view')).toBeTruthy();
    expect(screen.queryByTestId('settlement')).toBeNull();

    await rerender(
      <LeaderboardBody
        bundle={withGame({
          gameMode: 'skins',
          modeConfig: { ...skinsConfig, kr_per_unit: 50 },
        })}
        scores={mockLocalScores}
      />,
    );
    expect(screen.getByTestId('skins-view')).toBeTruthy();
    expect(screen.queryByTestId('settlement')).toBeNull();

    // Bryteren på: kortet fra #2221 står som før.
    mockKroner.on = true;
    await rerender(
      <LeaderboardBody
        bundle={withGame({
          gameMode: 'skins',
          modeConfig: { ...skinsConfig, kr_per_unit: 50 },
        })}
        scores={mockLocalScores}
      />,
    );
    expect(screen.getByTestId('settlement')).toBeTruthy();
    expect(screen.getByTestId('settlement-stake').props.children).toBe('50 kr per skin');
    expect(screen.getAllByTestId(/^settlement-player-[a-z]+$/)).toHaveLength(2);
    expect(screen.getByTestId('settlement-player-mate-net').props.children).toMatch(/^\+/);
    expect(screen.getByTestId('settlement-player-me-net').props.children).toMatch(/^−/);
    expect(screen.getByTestId('settlement-payment-0-line').props.children).toBe(
      'Meg Selv → Makker Makkersen',
    );
    mockKroner.on = false;
  });
});

describe('ResultView', () => {
  // #2221: et ferdig oppgjør som prop. Tallene er motorens og Type A-dekket;
  // her gjelder det bare at visningen tegner kortet når det finnes.
  const SETTLEMENT: Settlement = {
    krPerUnit: 20,
    unitLabel: 'poeng',
    perPlayer: [
      { userId: 'me', units: 4, netKr: 30 },
      { userId: 'mate', units: 1, netKr: -30 },
    ],
    payments: [{ fromUserId: 'mate', toUserId: 'me', kr: 30 }],
  };

  // Én render-test per ny visning (#1832). De svarer på ÉN ting: at motorens
  // rader faktisk blir til rader på skjermen, og at `ResultView` ruter de to
  // kindsene dit. Tallene selv er motorens og er dekket i `lib/scoring`.
  it('tegner wolf-totalene og alle hullene: avgjorte som kort, uspilte som en smal linje', async () => {
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
        // Ingen har valgt her ennå — hullet står likevel, som en smal linje
        // med hvem som er wolf, slik nettsiden viser alle hullene (#1990).
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
        settlement={SETTLEMENT}
        nameOf={(userId) => (userId === 'me' ? 'Meg Selv' : 'Makker Makkersen')}
      />,
    );

    expect(screen.getByTestId('wolf-view')).toBeTruthy();
    expect(screen.getByTestId('settlement')).toBeTruthy();
    expect(cell('me', 'points')).toBe('4');
    expect(cell('mate', 'rank')).toBe('2');

    expect(screen.getByTestId('wolf-hole-1-line').props.children).toBe(
      'Wolf: Meg Selv · Partner: Makker Makkersen · Wolf vant',
    );
    expect(screen.getByTestId('wolf-hole-1-points').props.children).toBe(
      'Meg Selv +4 · Makker Makkersen +4',
    );
    // Det uspilte hullet er med, men som linja, ikke som kortet.
    expect(screen.getByTestId('wolf-hole-2')).toBeTruthy();
    expect(screen.getByTestId('wolf-hole-2-pending').props.children).toBe(
      'Hull 2 · par 4 · Wolf: Makker Makkersen · Ikke valgt ennå',
    );
    expect(screen.queryByTestId('wolf-hole-2-line')).toBeNull();
    expect(screen.queryByTestId('wolf-hole-1-pending')).toBeNull();
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
        settlement={SETTLEMENT}
        nameOf={(userId) => (userId === 'me' ? 'Meg Selv' : 'Makker Makkersen')}
      />,
    );

    expect(screen.getByTestId('bbb-view')).toBeTruthy();
    expect(screen.getByTestId('settlement')).toBeTruthy();
    expect(screen.getByTestId('bbb-player-me-points').props.children).toBe(3);
    expect(
      screen.getByTestId('bbb-player-mate-breakdown').props.children.join(''),
    ).toBe('0 bingo · 1 bango · 1 bongo');
    // Noen har poeng, så «ingenting registrert ennå» skal ikke stå der.
    expect(screen.queryByTestId('bbb-no-points')).toBeNull();
  });

  // #2221: de tre pengeformatene appen ikke kan lage, men viser når de er
  // laget på nettsiden. Den eneste testen av at disse grenene tegner kortet.
  const twoPlayers = <T extends object>(line: (userId: string, i: number) => T) =>
    ['me', 'mate'].map((userId, i) => ({ userId, rank: i + 1, tiedWith: [], ...line(userId, i) }));
  const nassauSection = (name: string) => ({
    name,
    holeNumbers: [],
    players: [],
    winnerUserIds: [],
    isPending: true,
  });

  it.each([
    [
      'nassau',
      {
        kind: 'nassau',
        scoring: 'net',
        sections: {
          front9: nassauSection('front9'),
          back9: nassauSection('back9'),
          total18: nassauSection('total18'),
        },
        players: twoPlayers((_id, i) => ({ units: 1 - i })),
        holes: [],
      },
    ],
    [
      'nines',
      {
        kind: 'nines',
        variant: 'nines',
        scoring: 'net',
        holes: [],
        players: twoPlayers((_id, i) => ({ totalPoints: 9 - i, holesScored: 2 })),
      },
    ],
    [
      'acey_deucey',
      {
        kind: 'acey_deucey',
        scoring: 'net',
        holes: [],
        players: twoPlayers((_id, i) => ({ total: 3 - 3 * i, aces: 1 - i, deuces: i })),
      },
    ],
  ])('tegner pengeoppgjøret i %s når spillet har kroner per enhet', async (_kind, result) => {
    await render(
      <ResultView
        result={result as unknown as ModeResult}
        status="active"
        gameId={GAME_ID}
        settlement={SETTLEMENT}
        nameOf={(userId) => (userId === 'me' ? 'Meg Selv' : 'Makker Makkersen')}
      />,
    );

    expect(screen.getByTestId('leaderboard-table')).toBeTruthy();
    expect(screen.getByTestId('settlement')).toBeTruthy();
  });

  // #1892: Hull-kolonnen er «thru»-informasjon under runden og støy på
  // sluttresultatet når alle spilte like mange. Regelen selv er Type A-dekket i
  // `lib/leaderboard/holesColumn.test.ts` — disse to svarer bare på om tavla
  // (#2579) faktisk får kolonnen eller ikke.
  const finishedBoard = (holesPlayed: Record<string, number>, overrides: Record<string, unknown> = {}) => {
    const bundle = {
      ...mockBundle,
      game: { ...bundleGame, status: 'finished', ...overrides },
    } as never;
    const scores = Object.entries(holesPlayed).flatMap(([userId, holes]) =>
      Array.from({ length: holes }, (_, i) => ({
        id: `${GAME_ID}:${userId}:${i + 1}`,
        gameId: GAME_ID,
        userId,
        holeNumber: i + 1,
        strokes: userId === 'mate' ? 4 : 5,
        putts: null,
        enteredBy: userId,
        clientUpdatedAt: '2026-08-30T10:00:00.000Z',
        serverUpdatedAt: null,
      })),
    );
    return { bundle, scores, soloBoard: soloBoardFor({ bundle, scores, userId: 'me' }) };
  };

  it('dropper Hull-kolonnen på et ferdig spill der alle spilte like mange hull', async () => {
    await render(<LeaderboardBody {...finishedBoard({ mate: 18, me: 18 })} />);

    expect(screen.getByTestId('board-row-me-total')).toBeTruthy();
    expect(screen.queryByTestId('board-row-me-holes')).toBeNull();
    expect(screen.queryByTestId('board-row-mate-holes')).toBeNull();
  });

  it('beholder Hull-kolonnen på et ferdig spill der én ga seg etter 12', async () => {
    await render(<LeaderboardBody {...finishedBoard({ mate: 18, me: 12 })} />);

    // Tavla bytter ikke form per rad: begge radene får kolonnen.
    expect(screen.getByTestId('board-row-mate-holes')).toHaveTextContent('18');
    expect(screen.getByTestId('board-row-me-holes')).toHaveTextContent('12');
  });

  // #1982: samme regel på lagtavla (#2579 PR 2). Texas-grenen tegner også
  // ambrose og florida scramble — motoren sender `texas_scramble` for alle tre.
  it('viser hullene i Texas scramble når et ferdig lag mangler hull', async () => {
    const texas = finishedBoard(
      { me: 16, mate: 18 },
      { gameMode: 'texas_scramble', modeConfig: { kind: 'texas_scramble', team_size: 1, teams_count: 2, team_handicap_pct: 0 } },
    );
    const bundle = {
      ...(texas.bundle as GameBundle),
      players: (texas.bundle as GameBundle).players.map((p, i) => ({ ...p, teamNumber: i + 1 })),
    };
    await render(
      <LeaderboardBody
        bundle={bundle}
        scores={texas.scores}
        teamBoard={teamBoardFor({ bundle, scores: texas.scores, userId: 'me' })}
      />,
    );

    const team = (userId: string) => String(bundle.players.find((p) => p.userId === userId)?.teamNumber);
    expect(screen.getByTestId(`team-row-${team('me')}-under`)).toHaveTextContent(/16$/);
    expect(screen.getByTestId(`team-row-${team('mate')}-under`)).toHaveTextContent(/18$/);
  });

  it('viser Hull-kolonnen i slagspill og beholder streken for den som ikke har ført noe', async () => {
    await render(
      <LeaderboardBody
        {...finishedBoard(
          { mate: 18, me: 0 },
          { gameMode: 'solo_strokeplay', modeConfig: { kind: 'solo_strokeplay', team_size: 1 } },
        )}
      />,
    );

    expect(screen.getByTestId('board-row-mate-holes')).toHaveTextContent('18');
    expect(screen.getByTestId('board-row-me-holes')).toHaveTextContent('0');
    expect(screen.getByTestId('board-row-me-total')).toHaveTextContent('—');
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
        settlement={null}
        nameOf={() => 'Ukjent'}
      />,
    );
    expect(screen.getByTestId('leaderboard-unknown-format')).toBeTruthy();
    // Nevner IKKE nettsiden (#1844): vi vet ikke om formatet finnes der.
    expect(screen.getByText('Appen kjenner ikke dette formatet ennå.')).toBeTruthy();
    expect(screen.queryByTestId('leaderboard-gated-format-link')).toBeNull();
  });
});

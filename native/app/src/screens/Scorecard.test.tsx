// native/app/src/screens/Scorecard.test.tsx
// Native #1918: den ene render-testen (Type C) for scorekortet.
//
// Kortets tall er dekket av `lib/scorecardRows.test.ts`, lag-oppslaget av
// `lib/teamPlay.test.ts` og rute-kallet (solo og lag, #2215, og makker-kortene
// i `alsoFor`, #2200) av `data/submitCard.test.ts`. Hvem som kan leveres for
// flighten, og hva blokken over knappen sier, er `lib/roster.test.ts` sitt.
// Ingen av dem gjentas her.
//
// Det som blir igjen er sju koblinger:
//
//  1. **I et format som kollapser til ett lagkort leverer appen selv.** Fram
//     til #1918 sto det en setning og en lenke ut («Levering av lagkort gjøres
//     på nettsiden ennå»), fordi lag-leveringen markerer alle medlemmenes rader
//     med service-role — en evne appen ikke har. Nå gjør ruta det på appens
//     vegne, og testen låser at det er lagets knapp som står der: ikke
//     setningen, ikke lenka, ikke solo-knappen, og ikke flight-knappen
//     (#2200).
//  2. **Et kort som kan leveres, kan også rettes (#2220).** «Rediger hullene»
//     tar spilleren til hull 1, som nettsidens «← Rediger». Uten den var et
//     avvist, fullt kort en blindvei: scorekortet var eneste stopp, og radene
//     er ren visning.
//  3. **Lever-knappen er sperret til køen er lest (#2219).** Kø-vakta (#668)
//     sto åpen fram til første `listQueue` svarte, og et komplett kort gikk da
//     rett til levering. `listQueue` er et utsatt løfte her, så testen ser
//     knappen både før og etter svaret.
//  4. **En blind runde skjuler netto (#2219).** Samme delte regel som
//     resultatlista (`shouldHideNetto`): NETTO-raden og netto-summen står i en
//     live-runde og er borte mens en reveal-runde pågår, og det samme er POENG
//     (#2262). Brutto står. Etter #2262 er tabellen et klassisk kort, så
//     sjekkene leser kortets radetiketter (skjult for skjermleseren, derav
//     `HIDDEN`) i stedet for tabellens netto-kolonne.
//  5. **Kortet og stempelet (#2262).** Før levering: UT og INN, og ikke noe
//     stempel. Etter levering: stempel og godkjenningslinje. Tallene er
//     `scorecardGrid`- og `scorecardStamp`-testenes; her låses bare koblingen.
//  6. **Oppsummeringen og linja nederst (#2299).** Med alle 18 hull ført står
//     oppsummeringen og linja med «Se over og lever scorekortet». Ruller du
//     så langt at «Lever scorekort» kommer over linja, viker den, og ruller du
//     opp igjen, kommer den tilbake. Uten oppsummering står ingen linje.
//     Regelen selv er `roundDone.test.ts` sin; her låses koblingen til rulla.
//  7. **Utslagene (#2580).** Mangler noen på laget utslag, står raden
//     «Utslag» med pille, boksen over knappene og den sperrede leverknappen,
//     og «Lever likevel» kan ikke nås. Tekstene er `teeShotsCopy.test.ts` sine
//     og regelen `teeShots.test.ts` sin; her låses koblingen.
//
// Innlesingen ved fokus testes ikke: mocken under gjør `useFocusEffect` om til
// `useEffect`, så testen kan ikke skille fokus fra mount.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ScreenProps } from '../navigation';
import { Scorecard } from './Scorecard';

const GAME_ID = 'game-1';

const HOLES = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  parMens: 4,
  parLadies: 5,
  parJuniors: 4,
  strokeIndex: i + 1,
}));

const PLAYER_BASE = {
  nickname: null,
  flightNumber: null as number | null,
  teeGender: 'mens',
  acceptedAt: null,
  submittedAt: null as string | null,
  submittedByUserId: null,
  approvedAt: null,
  rejectionReason: null,
  withdrawnAt: null,
  isGuest: false,
};

// Greensome: 2v2 alternate shot — hele laget deler kapteinens rad hele veien
// til hull 18, så `modeCollapsesToTeamCard` er sann og kortet er lagets.
const mockBundle = {
  game: {
    id: GAME_ID,
    name: 'Torsdagsrunden',
    status: 'active',
    gameMode: 'greensome_matchplay',
    modeConfig: {
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: 50,
    },
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
    sideTournamentEnabled: false,
    sideLdCount: 0,
    sideCtpCount: 0,
    sideDisabledCategories: [],
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
  fetchedAt: '2026-09-01T10:00:00.000Z',
};

// Solo stableford med skjult resultat til slutt, midt i runden (#2219).
const mockRevealBundle = {
  ...mockBundle,
  game: {
    ...mockBundle.game,
    id: 'game-2',
    gameMode: 'stableford',
    modeConfig: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    createdBy: 'other',
    scoreVisibility: 'reveal',
  },
  players: [
    { ...PLAYER_BASE, userId: 'me', name: 'Meg Selv', teamNumber: null, courseHandicap: 20 },
    { ...PLAYER_BASE, userId: 'other', name: 'Ola Kompis', teamNumber: null, courseHandicap: 8 },
  ],
};

// Greensome-laget, nå i en blind runde, der kortet mitt er levert og venter på
// godkjenning (#2262). Et netto-format med vilje: stableford-runden over viser
// POENG, så bare denne kan fange en reveal-regel som skjuler poeng, men lar
// NETTO lekke.
const mockDeliveredBundle = {
  ...mockBundle,
  game: { ...mockBundle.game, id: 'game-3', scoreVisibility: 'reveal', requirePeerApproval: true },
  players: mockBundle.players.map((player) =>
    player.userId === 'me' ? { ...player, submittedAt: '2026-09-01T12:32:00.000Z' } : player,
  ),
};

// Radetikettene er skjult for skjermleseren (kolonnene sier alt), så de må
// letes fram med vilje.
const HIDDEN = { includeHiddenElements: true };

// Navnet må starte med `mock`: jest.mock-factoryene heises over importene.
const mockState: {
  bundle: unknown;
  queue: Promise<unknown[]>;
  scores: unknown[];
  teeShots: unknown[];
  teeShotQueue: unknown[];
} = {
  bundle: mockBundle,
  queue: Promise.resolve([]),
  scores: [],
  teeShots: [],
  teeShotQueue: [],
};

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
jest.mock('../data/submitCard', () => ({
  submitCard: jest.fn(async () => ({ ok: true, alreadySubmitted: false, alsoDelivered: 0 })),
}));
jest.mock('../data/seedScores', () => ({
  seedGameScores: jest.fn(async () => 0),
  seedGameTeeShots: jest.fn(async () => 0),
}));
// Slag-innhentingen (#2228) drar inn realtime-modulen.
jest.mock('../data/realtime', () => ({
  subscribeGameScores: jest.fn(() => () => undefined),
}));
jest.mock('../data/syncWorker', () => ({ drainQueue: jest.fn(async () => undefined) }));
jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listQueue: jest.fn(() => mockState.queue),
  listScoresForGame: jest.fn(async () => mockState.scores),
  // #2580: utslagskøen leses ved siden av slagkøen.
  listTeeShotQueue: jest.fn(async () => mockState.teeShotQueue),
  listTeeShotsForGame: jest.fn(async () => mockState.teeShots),
}));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'me', email: 'meg@example.test' }),
}));
// Fokus-refetchen kommer fra navigasjonen. En hel NavigationContainer for én
// render-test er mer rigg enn testen er verdt; effekten er den samme.
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

const mockSetOptions = jest.fn();

function scorecardElement(gameId: string, navigate: jest.Mock) {
  return (
    <Scorecard
      {...({
        route: { params: { gameId } },
        navigation: { navigate, setOptions: mockSetOptions },
      } as unknown as ScreenProps<'Scorecard'>)}
    />
  );
}

describe('Scorecard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.bundle = mockBundle;
    mockState.queue = Promise.resolve([]);
    mockState.scores = [];
    mockState.teeShots = [];
    mockState.teeShotQueue = [];
  });

  // Gjennomgangen av #2622: «Lever for <makker>» etter at mitt kort alt er
  // levert. Serveren svarer `alreadySubmitted` (mitt kort sto som levert) og 0
  // makkerkort. Det er IKKE et nytt forsøk etter tidsavbrudd, så #2200-beskjeden
  // skal stå og kortet hentes på nytt.
  it('lever for makker etter eget levert kort: beskjeden står når makkerkortet ikke kom med', async () => {
    const { submitCard } = require('../data/submitCard') as { submitCard: jest.Mock };
    const { refreshGameBundle } = require('../data/gameBundle') as { refreshGameBundle: jest.Mock };
    submitCard.mockResolvedValueOnce({ ok: true, alreadySubmitted: true, alsoDelivered: 0 });
    mockState.bundle = {
      ...mockRevealBundle,
      game: { ...mockRevealBundle.game, id: 'game-7', scoreVisibility: 'live' },
      players: mockRevealBundle.players.map((player) =>
        player.userId === 'me' ? { ...player, submittedAt: '2026-09-01T12:32:00.000Z' } : player,
      ),
    };
    mockState.scores = Array.from({ length: 18 }, (_, i) => ({
      id: `game-7:other:${i + 1}`,
      gameId: 'game-7',
      userId: 'other',
      holeNumber: i + 1,
      strokes: 4,
      putts: null,
      enteredBy: 'me',
      clientUpdatedAt: '2026-09-01T10:00:00.000Z',
      serverUpdatedAt: '2026-09-01T10:00:00.000Z',
    }));
    const navigate = jest.fn();
    await render(scorecardElement('game-7', navigate));
    await waitFor(() => expect(screen.getByTestId('deliver-for-flight')).toBeEnabled());
    const fetchesBefore = refreshGameBundle.mock.calls.length;

    await fireEvent.press(screen.getByTestId('deliver-for-flight'));

    await waitFor(() => expect(screen.getByTestId('submit-partial')).toBeTruthy());
    expect(refreshGameBundle.mock.calls.length).toBeGreaterThan(fetchesBefore);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sier fra når spillet ikke kunne hentes, i stedet for å stå på «Henter scorekortet …» (#1954 A2)', async () => {
    // Ingen bundel i cachen og en henting som feiler (nettet falt): skjermen
    // skal si det, som hull- og tavleskjermen gjør, ikke vente for alltid.
    mockState.bundle = undefined;
    const { refreshGameBundle } = require('../data/gameBundle') as { refreshGameBundle: jest.Mock };
    refreshGameBundle.mockRejectedValueOnce(new Error('Network request failed'));

    await render(scorecardElement(GAME_ID, jest.fn()));

    await waitFor(() => expect(screen.getByTestId('scorecard-error')).toBeTruthy());
    // #1954 D2: en vei videre, som de andre spillskjermene (blokka er testet i GameLoadFailed.test).
    expect(screen.getByTestId('game-retry')).toBeTruthy();
    const calls = refreshGameBundle.mock.calls.length;
    await fireEvent.press(screen.getByTestId('game-retry'));
    expect(refreshGameBundle.mock.calls.length).toBe(calls + 1);
  });

  it('viser lever-knappen for laget når køen er lest, en vei til hullene for å rette, netto i åpen stableford og ikke i blind runde', async () => {
    let releaseQueue!: (items: unknown[]) => void;
    mockState.queue = new Promise((resolve) => {
      releaseQueue = resolve;
    });
    const navigate = jest.fn();
    const { rerender } = await render(scorecardElement(GAME_ID, navigate));

    await waitFor(() => {
      expect(screen.getByTestId('submit-team-card')).toBeTruthy();
    });
    // #2219: køen er ikke lest ennå. Et trykk nå kunne levert kortet foran
    // slag som fortsatt ligger i kø, og da fryser serveren kortet uten dem.
    expect(screen.getByTestId('submit-team-card')).toBeDisabled();
    expect(screen.queryByTestId('queue-guard')).toBeNull();
    // Live-runde: NETTO står på begge kortene, UT og INN (#2262). Ikke noe
    // stempel før kortet er levert.
    expect(screen.getByTestId('scorecard-half-out')).toBeTruthy();
    expect(screen.getByTestId('scorecard-half-in')).toBeTruthy();
    expect(screen.getAllByTestId('scorecard-row-label-net', HIDDEN)).toHaveLength(2);
    expect(screen.queryByTestId('scorecard-row-label-points', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('scorecard-stamp')).toBeNull();

    await act(async () => {
      releaseQueue([]);
    });
    await waitFor(() => {
      expect(screen.getByTestId('submit-team-card')).toBeEnabled();
    });
    // Veien ut av appen er borte, og det samme er setningen som sto der i
    // stedet for en knapp.
    expect(screen.queryByTestId('team-submit-link')).toBeNull();
    expect(screen.queryByTestId('team-submit-gate')).toBeNull();
    // Og det er LAGETS knapp som står der, ikke solo-knappen: leveringen går
    // gjennom ruta, ikke gjennom spillerens egen rad. Heller ikke flight-
    // knappen (#2200): laget med én ball leveres som ett lag.
    expect(screen.queryByTestId('submit-scorecard')).toBeNull();
    expect(screen.queryByTestId('submit-flight')).toBeNull();
    // Ingen hull ført: ingen oppsummering, og ingen linje (#2299).
    expect(screen.queryByTestId('round-done-bar')).toBeNull();

    // #2220: kortet kan rettes før det leveres. Knappen går til hull 1, og
    // hull-stripen tar spilleren videre derfra.
    await fireEvent.press(screen.getByTestId('scorecard-edit'));
    // #2228: toppen sendes med, så den står også om hullsiden kaster.
    expect(navigate).toHaveBeenCalledWith('Hole', {
      gameId: GAME_ID,
      holeNumber: 1,
      gameName: 'Torsdagsrunden',
      topLine: 'Greensome · Testbanen',
    });

    // #2385: stableford i en åpen runde. NETTO står ved siden av BRUTTO og
    // POENG til høyre, som i designet.
    mockState.bundle = {
      ...mockRevealBundle,
      game: { ...mockRevealBundle.game, id: 'game-4', scoreVisibility: 'live' },
    };
    await rerender(scorecardElement('game-4', navigate));
    await waitFor(() => {
      expect(screen.getByTestId('total-poeng')).toBeTruthy();
    });
    expect(screen.getByTestId('total-netto')).toBeTruthy();

    // #2299: alle 18 hull ført. Oppsummeringen og linja står. Rulla er 600 pt
    // høy og «Lever scorekort» står 1100 pt ned; linja dekker de nederste
    // 137 pt (ingen hjem-strek i testen).
    mockState.scores = Array.from({ length: 18 }, (_, i) => ({
      id: `game-5:me:${i + 1}`,
      gameId: 'game-5',
      userId: 'me',
      holeNumber: i + 1,
      strokes: 4,
      putts: null,
      enteredBy: 'me',
      clientUpdatedAt: '2026-09-01T10:00:00.000Z',
      serverUpdatedAt: '2026-09-01T10:00:00.000Z',
    }));
    mockState.bundle = {
      ...mockRevealBundle,
      game: { ...mockRevealBundle.game, id: 'game-5', scoreVisibility: 'live' },
    };
    await rerender(scorecardElement('game-5', navigate));
    await waitFor(() => {
      expect(screen.getByTestId('round-done-card')).toBeTruthy();
    });
    expect(screen.getByTestId('round-done-bar')).toBeTruthy();
    await fireEvent(screen.getByTestId('scorecard-screen'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 600 } },
    });
    await fireEvent(screen.getByTestId('submit-scorecard'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 1100, width: 350, height: 44 } },
    });
    // Knappen er i rulla, men fortsatt under linja: linja står.
    await fireEvent.scroll(screen.getByTestId('scorecard-screen'), {
      nativeEvent: { contentOffset: { x: 0, y: 600 } },
    });
    expect(screen.getByTestId('round-done-bar')).toBeTruthy();
    // Knappen er over linja: linja viker.
    await fireEvent.scroll(screen.getByTestId('scorecard-screen'), {
      nativeEvent: { contentOffset: { x: 0, y: 700 } },
    });
    expect(screen.queryByTestId('round-done-bar')).toBeNull();
    // Litt opp: knappen er fortsatt i syne, så linja blir borte (den blinker
    // ikke på grensen).
    await fireEvent.scroll(screen.getByTestId('scorecard-screen'), {
      nativeEvent: { contentOffset: { x: 0, y: 600 } },
    });
    expect(screen.queryByTestId('round-done-bar')).toBeNull();
    // Opp til knappen er ute av syne: linja er tilbake.
    await fireEvent.scroll(screen.getByTestId('scorecard-screen'), {
      nativeEvent: { contentOffset: { x: 0, y: 500 } },
    });
    expect(screen.getByTestId('round-done-bar')).toBeTruthy();
    mockState.scores = [];

    // #2219: en blind runde som pågår. Netto og tildelte slag er borte til
    // arrangøren avslutter, som på nettsiden. Brutto står.
    mockState.bundle = mockRevealBundle;
    await rerender(scorecardElement('game-2', navigate));
    await waitFor(() => {
      expect(screen.getByTestId('submit-scorecard')).toBeTruthy();
    });
    expect(screen.getByTestId('total-brutto')).toBeTruthy();
    expect(screen.getAllByTestId('scorecard-row-label-strokes', HIDDEN)).toHaveLength(2);
    expect(screen.queryByTestId('scorecard-row-label-net', HIDDEN)).toBeNull();
    // Stableford: poengene er like avslørende som netto (#2262).
    expect(screen.queryByTestId('scorecard-row-label-points', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('total-netto')).toBeNull();
    expect(screen.queryByTestId('total-poeng')).toBeNull();

    // #2262: kortet er levert. Stempelet og godkjenningslinja står, og
    // lever-knappen er borte.
    mockState.bundle = mockDeliveredBundle;
    await rerender(scorecardElement('game-3', navigate));
    await waitFor(() => {
      expect(screen.getByTestId('scorecard-stamp')).toBeTruthy();
    });
    expect(screen.getByTestId('scorecard-approval')).toBeTruthy();
    expect(screen.queryByTestId('submit-team-card')).toBeNull();
    // Netto-format i blind runde: NETTO er borte også her, BRUTTO står.
    expect(screen.queryByTestId('scorecard-row-label-net', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('total-netto')).toBeNull();
    expect(screen.getByTestId('total-brutto')).toBeTruthy();
  });
  it('#2580: et utslag som venter i køen, sperrer leveringen som et slag gjør', async () => {
    // Slagkøen er tom. Uten utslagskøen i kø-vakta ville knappen stått åpen,
    // og serveren ville talt bare utslagene som var framme.
    mockState.teeShotQueue = [
      {
        id: `${GAME_ID}:1:7`,
        teeShotId: `${GAME_ID}:1:7`,
        attemptCount: 0,
        lastError: null,
        createdAt: '2026-09-01T10:00:00.000Z',
        abandonedAt: null,
      },
    ];
    await render(scorecardElement(GAME_ID, jest.fn()));

    await waitFor(() => {
      expect(screen.getByTestId('queue-guard')).toBeTruthy();
    });
    expect(screen.getByTestId('submit-team-card')).toBeDisabled();
  });

  it('#2580: mangler noen utslag, er leveringen sperret og «Lever likevel» kan ikke nås', async () => {
    const { Alert } = require('react-native');
    const { submitCard } = require('../data/submitCard');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // Texas scramble med firemannslag og minst 4 hver. Utslag 3: Marte 7,
    // Jonas 5, jeg 4 og Per 2 på alle 18 hull.
    mockState.bundle = {
      ...mockBundle,
      game: {
        ...mockBundle.game,
        id: 'game-6',
        gameMode: 'texas_scramble',
        modeConfig: { kind: 'texas_scramble', team_size: 4, min_tee_shots: 4 },
      },
      players: [
        { ...PLAYER_BASE, userId: 'me', name: 'Meg Selv', teamNumber: 1, courseHandicap: 20 },
        { ...PLAYER_BASE, userId: 'marte', name: 'Marte Moe', teamNumber: 1, courseHandicap: 10 },
        { ...PLAYER_BASE, userId: 'jonas', name: 'Jonas Berg', teamNumber: 1, courseHandicap: 12 },
        { ...PLAYER_BASE, userId: 'per', name: 'Per Hauge', teamNumber: 1, courseHandicap: 30 },
      ],
    };
    const owners = [
      ...Array<string>(7).fill('marte'),
      ...Array<string>(5).fill('jonas'),
      ...Array<string>(4).fill('me'),
      ...Array<string>(2).fill('per'),
    ];
    mockState.teeShots = owners.map((teeShotBy, i) => ({
      id: `game-6:1:${i + 1}`,
      gameId: 'game-6',
      teamNumber: 1,
      holeNumber: i + 1,
      teeShotBy,
      enteredBy: 'me',
      clientUpdatedAt: '2026-09-01T10:00:00.000Z',
      serverUpdatedAt: '2026-09-01T10:00:00.000Z',
    }));

    await render(scorecardElement('game-6', jest.fn()));
    await waitFor(() => {
      expect(screen.getByTestId('tee-shot-short-box')).toBeTruthy();
    });
    expect(screen.getAllByTestId('scorecard-row-label-teeShots', HIDDEN)).toHaveLength(2);
    // Per valgt på hull 17 og 18: initialene i pille.
    expect(screen.getByTestId('scorecard-tee-shot-short-18', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('scorecard-tee-shot-short-1', HIDDEN)).toBeNull();

    const button = screen.getByTestId('submit-team-card');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button);
    // 18 hull uten slag ville ellers spurt «Lever likevel?».
    expect(alert).not.toHaveBeenCalled();
    expect(submitCard).not.toHaveBeenCalled();

    alert.mockRestore();
  });
});

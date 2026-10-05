// Native N3 (#1825), utvidet i N4 (#1828): den ene render-testen (Type C) på
// spillerskjermene.
//
// Den svarer på det ingen ren funksjon kan svare på: at radene og skinna
// (#2252) faktisk tegnes, og at et trykk havner i N2-datalaget med RIKTIGE
// argumenter. To varianter av samme spørsmål, og begge kan gå galt uten at noen
// Type A-test ser det:
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { useMemo, useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { writeScore } from '../data/writeScore';
import { loadSunlight, setSunlight } from '../lib/sunlight';
import type { ScreenProps } from '../navigation';
import { strokesLine } from '../components/hole/FlightRow';
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

/** En ferdig ført rad, slik SQLite ville gitt den tilbake. */
function localScore(
  userId: string,
  strokes: number | null,
  putts: number | null,
  holeNumber = 1,
) {
  return {
    id: `${GAME_ID}#${userId}#${holeNumber}`,
    gameId: GAME_ID,
    userId,
    holeNumber,
    strokes,
    putts,
    enteredBy: 'me',
    clientUpdatedAt: '2026-08-30T10:00:00.000Z',
    serverUpdatedAt: null,
  };
}

// #2067: texas scramble der kapteinen («makker», lex-min) har slettet kontoen
// etter ni hull. Raden hans er trukket, og «me» eier lagets rader nå.
const mockWithdrawnCaptainBundle = {
  ...mockTeamBundle,
  game: {
    ...GAME_BASE,
    gameMode: 'texas_scramble',
    modeConfig: {
      kind: 'texas_scramble',
      team_size: 2,
      teams_count: 2,
      team_handicap_pct: 25,
    },
  },
  players: mockTeamBundle.players.map((p) =>
    p.userId === 'makker' ? { ...p, withdrawnAt: '2026-09-17T10:00:00.000Z' } : p,
  ),
};

// Hvilken bundel skjermen får, satt per test. Navnet må starte med `mock` —
// jest.mock-factoryene heises over importene og ser bare slike variabler.
const mockState: { bundle: unknown; scores: unknown[] } = {
  bundle: mockSoloBundle,
  scores: [],
};

jest.mock('../supabase', () => require('../test/supabaseMock'));
// #2201: merk-lest har sin egen test; manuell mock i lib/__mocks__/.
jest.mock('../lib/useMarkVisitRead');
// Telefonens lys/mørk, satt per test. Sollys (#2252) skal slå den på hullsiden.
const mockScheme: { value: 'light' | 'dark' } = { value: 'light' };
const mockFocus = { value: true };
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme.value,
}));
// Skinna står over hjem-indikatoren. Uten navigatorens SafeAreaProvider gir
// pakkens egen mock innfelling 0.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
// Putt-bryteren (#2000) bor i AsyncStorage. Pakkens egen jest-mock er et lager
// i minnet — hver test starter med bryteren av, som på en fersk telefon.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
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
jest.mock('../data/syncTriggers', () => ({
  addForegroundListener: jest.fn(() => () => undefined),
  addOnlineListener: jest.fn(() => () => undefined),
}));
jest.mock('../data/db', () => ({
  getDb: jest.fn(async () => ({})),
  listScoresForGame: jest.fn(async () => mockState.scores),
}));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'me', email: 'meg@example.test' }),
}));
// Skjermene henter fokus-refetchen fra navigasjonen. Å dra inn en hel
// NavigationContainer for én render-test er mer rigg enn testen er verdt —
// effekten er den samme: kjør callbacken når skjermen står på skjermen.
jest.mock('@react-navigation/native', () => ({
   
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  // Står hullsiden øverst? Tavla og scorekortet legges oppå den (#2252).
  useIsFocused: () => mockFocus.value,
}));
// Statuslinja er appens, ikke skjermens: en merket stand-in viser om hullsiden
// ber om mørk tekst.
jest.mock('expo-status-bar', () => ({
  StatusBar: ({ style }: { style: string }) =>
    require('react').createElement(require('react-native').View, {
      testID: `status-bar-${style}`,
    }),
}));

// RNTL 14 er asynkron hele veien: både `render` og `fireEvent` returnerer
// løfter (de wrapper act selv). Uten await settes aldri `screen`.
type TestNavigation = { setParams: jest.Mock; navigate: jest.Mock; setOptions: jest.Mock };
type HeaderOptions = NativeStackHeaderProps['options'];

/**
 * Hullsiden med toppen den setter (#2385: den delte raden med Sollys og
 * pokalen). `setOptions` går fortsatt til testens mock, og toppen tegnes over
 * skjermen med navigatorens egne header-props, så testene kan trykke i den.
 */
function HoleWithTop({ holeNumber, navigation }: { holeNumber: number; navigation: TestNavigation }) {
  const [top, setTop] = useState<ReactNode>(null);
  const nav = useMemo(
    () => ({
      ...navigation,
      goBack: jest.fn(),
      setOptions: (options: HeaderOptions) => {
        navigation.setOptions(options);
        setTop(
          options.header?.({
            back: { title: 'Lørdagsrunden', href: undefined },
            options,
            route: { key: 'hole', name: 'Hole' },
            navigation: nav as unknown as NativeStackHeaderProps['navigation'],
          }) ?? null,
        );
      },
    }),
    [navigation],
  );
  return (
    <>
      {top}
      <Hole
        {...({
          route: { params: { gameId: GAME_ID, holeNumber } },
          navigation: nav,
        } as unknown as ScreenProps<'Hole'>)}
      />
    </>
  );
}

function holeElement(holeNumber: number, navigation: TestNavigation) {
  return <HoleWithTop holeNumber={holeNumber} navigation={navigation} />;
}

async function renderHole(holeNumber = 1) {
  const navigation = { setParams: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };
  await render(holeElement(holeNumber, navigation));
  return navigation;
}

describe('Hole', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockState.bundle = mockSoloBundle;
    mockState.scores = [];
    mockScheme.value = 'light';
    mockFocus.value = true;
    // Sollys bor i minnet for hele appen: hver test starter med det av.
    await AsyncStorage.clear();
    await loadSunlight();
  });

  it('henter slagene på nytt når kanalen er tilbake etter et brudd (#2093)', async () => {
    await renderHole();
    const { subscribeGameScores } = require('../data/realtime') as {
      subscribeGameScores: jest.Mock;
    };
    const { seedGameScores } = require('../data/seedScores') as {
      seedGameScores: jest.Mock;
    };
    await waitFor(() => {
      expect(seedGameScores).toHaveBeenCalledTimes(1);
    });

    // Det som ble ført mens kanalen lå nede, kommer aldri som en hendelse.
    await act(async () => {
      subscribeGameScores.mock.calls[0]![1].onResubscribed();
    });

    expect(seedGameScores).toHaveBeenCalledTimes(2);
    expect(seedGameScores).toHaveBeenLastCalledWith(GAME_ID);
  });

  it('henter slagene og spillet på nytt i forgrunnen, ved nett tilbake og ved hullbytte (#1980, #2219)', async () => {
    const navigation = { setParams: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };
    const { rerender } = await render(holeElement(1, navigation));
    const { subscribeGameScores } = require('../data/realtime') as {
      subscribeGameScores: jest.Mock;
    };
    const { seedGameScores } = require('../data/seedScores') as {
      seedGameScores: jest.Mock;
    };
    const { refreshGameBundle } = require('../data/gameBundle') as {
      refreshGameBundle: jest.Mock;
    };
    const { addForegroundListener, addOnlineListener } = require('../data/syncTriggers') as {
      addForegroundListener: jest.Mock;
      addOnlineListener: jest.Mock;
    };
    await waitFor(() => {
      expect(seedGameScores).toHaveBeenCalledTimes(1);
    });
    // Åpningen henter spillet én gang (fokus), ikke to.
    expect(refreshGameBundle).toHaveBeenCalledTimes(1);

    // Sokkelen overlevde bakgrunnen: ingen resubscribe, men forgrunnen skal
    // likevel hente det makkeren førte i mellomtiden, og spillet på nytt: ble
    // runden avsluttet mens telefonen lå i lomma, låses hullet (#2219).
    await act(async () => {
      for (const [listener] of addForegroundListener.mock.calls) listener();
    });
    expect(seedGameScores).toHaveBeenCalledTimes(2);
    expect(refreshGameBundle).toHaveBeenCalledTimes(2);

    // «Neste» bytter bare parameteren og gir ikke nytt fokus. Status leses
    // likevel på nytt, som på nettsiden (#2219).
    await rerender(holeElement(2, navigation));
    await waitFor(() => {
      expect(refreshGameBundle).toHaveBeenCalledTimes(3);
    });

    await act(async () => {
      addOnlineListener.mock.calls[0]![0]();
    });
    expect(seedGameScores).toHaveBeenCalledTimes(3);
    expect(seedGameScores).toHaveBeenLastCalledWith(GAME_ID);
    // Ingen ny kanal (#1366).
    expect(subscribeGameScores).toHaveBeenCalledTimes(1);
  });

  // #2252: skinna. Første trykk på en knapp fører scoren for setet skinna står
  // på, og skinna går videre til neste som mangler. Tallene på knappene er
  // dekket av Type A (railPoints, scoreRail); her er det koblingen som testes.
  it('tegner flighten som rader, og ett trykk på skinna fører scoren og går videre', async () => {
    // #2211: en tredje spiller har levert og har ingen score på hullet.
    mockState.bundle = {
      ...mockSoloBundle,
      players: [
        ...mockSoloBundle.players,
        {
          ...PLAYER_BASE,
          userId: 'done',
          name: 'Levert Larsen',
          courseHandicap: 5,
          submittedAt: '2026-08-30T09:30:00.000Z',
        },
      ],
    };
    await renderHole();

    // Alle er i samme flight (≤4 aktive → én gruppe, delt regel).
    await waitFor(() => {
      expect(screen.getByText('Makker Makkersen')).toBeTruthy();
    });
    // Designet (#2385): ingen «(deg)» på skjermen; skjermleseren får det.
    // Navnet står både i raden og øverst i skinna.
    expect(within(screen.getByTestId('flight-row-me')).getByText('Meg Selv')).toBeTruthy();
    expect(screen.getByLabelText('Meg Selv (deg): ingen score ennå')).toBeTruthy();
    expect(screen.queryByTestId('player-card-me')).toBeNull();

    // Den leverte raden er låst: grå, merket «Levert», og kan ikke velges.
    const doneRow = screen.getByTestId('flight-row-done');
    expect(doneRow).toBeDisabled();
    expect(doneRow).toHaveStyle({ opacity: 0.6 });
    expect(screen.getByTestId('flight-row-done-submitted')).toBeTruthy();

    // Skinna starter på meg. Slagene jeg får på hullet står i overskriften, og
    // netto på knappene regnes med dem (solo slagspill viser netto).
    expect(screen.getByTestId('score-rail-heading').props.children).toBe('Meg Selv');
    expect(screen.getByTestId('rail-option-4-detail').props.children).toBe('Par · netto 3');

    await fireEvent.press(screen.getByTestId('rail-option-4'));
    expect(writeScore).toHaveBeenCalledWith({
      gameId: GAME_ID,
      userId: 'me',
      holeNumber: 1,
      strokes: 4,
      enteredBy: 'me',
    });
    // Videre til makkeren. Den leverte hoppes over.
    await waitFor(() => {
      expect(screen.getByTestId('score-rail-heading').props.children).toBe('Makker Makkersen');
    });
    expect(screen.queryByTestId('score-rail-skip')).toBeNull();

    // #2000: putt-føring er opt-in. Solo-slagspill FANGER putter, så bryteren
    // finnes, men putte-valget kommer først når den er på.
    expect(screen.queryByTestId('rail-putts')).toBeNull();
    // #2385: bryteren står i skinnas nederste rad.
    await fireEvent.press(screen.getByTestId('rail-putts-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('rail-putts')).toBeTruthy();
    });

    // Putter skrives ALENE. Sendes `strokes` med, vasker mergen ut slaget som
    // står der (#939).
    await fireEvent.press(screen.getByTestId('rail-putts-2'));
    expect(writeScore).toHaveBeenLastCalledWith({
      gameId: GAME_ID,
      userId: 'mate',
      holeNumber: 1,
      putts: 2,
      enteredBy: 'me',
    });
  });

  it('lag-format: én rad per lag, og trykket havner i KAPTEINENS rad', async () => {
    mockState.bundle = mockTeamBundle;
    await renderHole();

    // Én rad per lag, ikke fire spillerrader. Setet er kapteinens.
    await waitFor(() => {
      expect(screen.getByTestId('flight-row-makker')).toBeTruthy();
    });
    expect(within(screen.getByTestId('flight-row-makker')).getByText('Lag 1 · Makker, Meg')).toBeTruthy();
    expect(screen.getByLabelText(/^Lag 1 · Makker, Meg \(ditt lag\)/)).toBeTruthy();
    expect(screen.getByText('Lag 2 · Rival, Rita')).toBeTruthy();
    expect(screen.queryByTestId('flight-row-me')).toBeNull();

    // Tildelingen er motorens tall: høysiden får 10 slag, altså ett på SI 1.
    // Laget som er på tur, har den øverst i skinna (#2385); lavsiden får
    // ingen, og raden sier «Scratch».
    expect(screen.getByTestId('score-rail-strokes')).toHaveTextContent(/^Får 1 slag her/);
    expect(screen.getByTestId('flight-row-rival-a-note').props.children).toBe(`${strokesLine(0)} · venter`);

    // Jeg taster, men raden er kapteinens («makker» er lex-min av laget).
    await fireEvent.press(screen.getByTestId('rail-option-4'));
    expect(writeScore).toHaveBeenCalledWith({
      gameId: GAME_ID,
      userId: 'makker',
      holeNumber: 1,
      strokes: 4,
      enteredBy: 'me',
    });

    // #2000: greensome fanger ikke putter (`formatCapturesPutts`), så hverken
    // bryteren eller putte-valget skal finnes.
    expect(screen.queryByTestId('rail-putts-toggle')).toBeNull();
    expect(screen.queryByTestId('rail-putts')).toBeNull();
  });

  // Retting: raden gir skinna til den spilleren, «Angre» skriver eksplisitt
  // `null` (utelatt felt = behold, #939), og «Annet» setter et hvilket som
  // helst tall og går videre som et vanlig trykk.
  it('rad-trykk velger setet, «Angre» nullstiller og lar putterne stå, og «Annet» setter et tall', async () => {
    mockState.scores = [localScore('me', 6, 2)];
    await renderHole();

    // Jeg har score, så skinna står på makkeren.
    await waitFor(() => {
      expect(screen.getByTestId('score-rail-heading').props.children).toBe('Makker Makkersen');
    });
    expect(screen.getByTestId('flight-row-me-score').props.children).toBe(6);

    await fireEvent.press(screen.getByTestId('flight-row-me'));
    expect(screen.getByTestId('score-rail-heading').props.children).toBe('Meg Selv');

    await fireEvent.press(screen.getByTestId('rail-undo'));
    expect(writeScore).toHaveBeenCalledTimes(1);
    expect(writeScore).toHaveBeenCalledWith({
      gameId: GAME_ID,
      userId: 'me',
      holeNumber: 1,
      strokes: null,
      enteredBy: 'me',
    });
    // `putts` er UTELATT, ikke null: mergen i writeScore beholder de 2 puttene.
    expect((writeScore as jest.Mock).mock.calls[0][0]).not.toHaveProperty('putts');

    // Skinna blir stående på meg etter «Angre».
    await fireEvent.press(screen.getByTestId('rail-other'));
    await fireEvent.press(screen.getByTestId('specific-value-9'));
    expect(writeScore).toHaveBeenLastCalledWith({
      gameId: GAME_ID,
      userId: 'me',
      holeNumber: 1,
      strokes: 9,
      enteredBy: 'me',
    });
    expect(screen.queryByTestId('specific-value-sheet')).toBeNull();
  });

  // Et hull i et spill som ikke er aktivt har ingenting å taste: skinna står
  // ikke, og radene kan ikke velges (#2219-låsen).
  it('et låst hull har ingen skinne', async () => {
    mockState.bundle = {
      ...mockSoloBundle,
      game: { ...mockSoloBundle.game, status: 'finished' },
    };
    await renderHole();
    await waitFor(() => {
      expect(screen.getByTestId('hole-locked')).toBeTruthy();
    });
    expect(screen.queryByTestId('score-rail')).toBeNull();
    expect(screen.getByTestId('flight-row-mate')).toBeDisabled();
    // Sollys styrer bare visningen, så bryteren virker på et låst hull.
    await fireEvent.press(screen.getByRole('switch', { name: 'Sollys' }));
    expect(screen.getByRole('switch', { name: 'Sollys' })).toBeChecked();
  });

  // «Neste» bytter bare parameteren. Skinnas valg hører til ett hull: en rad
  // du valgte på hull 1, skal ikke stå valgt på hull 2.
  it('et nytt hull starter skinna på meg igjen', async () => {
    const navigation = { setParams: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };
    const { rerender } = await render(holeElement(1, navigation));
    await waitFor(() => {
      expect(screen.getByTestId('flight-row-mate')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('flight-row-mate'));
    expect(screen.getByTestId('score-rail-heading').props.children).toBe('Makker Makkersen');

    await rerender(holeElement(2, navigation));
    expect(screen.getByTestId('score-rail-heading').props.children).toBe('Meg Selv');
  });

  // #2252 del 2: sollys. Med telefonen i mørk modus blir hullsiden hvit og svart
  // når bryteren er på, valget ligger på telefonen, og det står gjennom
  // hullbytte. Skjermroten, headeren og hullnummeret viser det.
  it('sollys gjør hullsiden hvit i mørk modus, huskes og står gjennom hullbytte', async () => {
    mockScheme.value = 'dark';
    const navigation = { setParams: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };
    const { rerender, unmount } = await render(holeElement(1, navigation));
    await waitFor(() => {
      expect(screen.getByTestId('hole-hero')).toBeTruthy();
    });
    expect(screen.getByTestId('hole-screen')).toHaveStyle({ backgroundColor: '#14201A' });

    const toggle = screen.getByRole('switch', { name: 'Sollys' });
    expect(toggle).not.toBeChecked();
    await fireEvent.press(toggle);
    expect(screen.getByRole('switch', { name: 'Sollys' })).toBeChecked();
    expect(screen.getByTestId('hole-screen')).toHaveStyle({ backgroundColor: '#FFFFFF' });
    expect(screen.getByTestId('hole-hero-number')).toHaveStyle({ fontSize: 132 });
    // Hull-sollys (#2385): knappene er 84 med kant på 3, og før noen score står
    // er par fylt svart. Raden på tur er en svart flate, og det er ingen stripe.
    expect(screen.getByTestId('rail-option-5')).toHaveStyle({ height: 84, borderWidth: 3 });
    expect(screen.getByTestId('rail-option-4')).toHaveStyle({ backgroundColor: '#000000' });
    expect(screen.getByTestId('flight-row-me')).toHaveStyle({ backgroundColor: '#000000' });
    expect(screen.queryByTestId('hole-strip')).toBeNull();
    // Mørk tekst i statuslinja mens hullsiden står øverst, men ikke når tavla
    // eller scorekortet er lagt oppå den.
    expect(screen.getByTestId('status-bar-dark')).toBeTruthy();
    mockFocus.value = false;
    await rerender(holeElement(1, navigation));
    expect(screen.queryByTestId('status-bar-dark')).toBeNull();
    mockFocus.value = true;
    await rerender(holeElement(1, navigation));
    expect(screen.getByTestId('status-bar-dark')).toBeTruthy();
    // Toppen er den delte raden, og den er hvit i sollys også.
    expect(screen.getByTestId('kicker-top-bar')).toHaveStyle({ backgroundColor: '#FFFFFF' });
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('torny-sunlight')).toBe('1');
    });

    // «Neste» bytter bare parameteren: sollys står.
    await rerender(holeElement(2, navigation));
    expect(screen.getByTestId('hole-screen')).toHaveStyle({ backgroundColor: '#FFFFFF' });

    // Appen startet på nytt: valget leses fra telefonen, og siden er hvit fra
    // første bilde, også mens spillet lastes.
    await unmount();
    await act(async () => {
      await loadSunlight();
    });
    mockState.bundle = null;
    await render(holeElement(1, navigation));
    expect(screen.getByTestId('hole-loading')).toHaveStyle({ backgroundColor: '#FFFFFF' });
    mockState.bundle = mockSoloBundle;

    // Av igjen: hullsiden og headeren følger telefonen, og nøkkelen er borte.
    await act(async () => setSunlight(false));
    expect(screen.getByTestId('hole-loading')).toHaveStyle({ backgroundColor: '#14201A' });
    expect(screen.getByTestId('kicker-top-bar')).toHaveStyle({ backgroundColor: '#14201A' });
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('torny-sunlight')).toBeNull();
    });
  });

  // #2385 (eierens svar): sollys har ingen hullstripe. Man bytter hull ved å
  // sveipe på hullnummeret (VoiceOver: handlingene), og når alle i flighten
  // har fått score, går siden selv til neste hull.
  it('sollys: VoiceOver-handlingene bytter hull, og bare de som finnes tilbys', async () => {
    await act(async () => setSunlight(true));
    const navigation = await renderHole(2);
    await waitFor(() => {
      expect(screen.getByTestId('hole-hero-swipe')).toBeTruthy();
    });
    const hero = screen.getByTestId('hole-hero-swipe');
    expect(hero.props.accessibilityLabel).toMatch(/^Hull 2 av 18, par \d, indeks \d+$/);

    // RNTL sin `fireEvent` regner en flate med PanResponder som avslått for
    // alle hendelser (den svarer nei på berøringsstart), så handlingen kalles
    // direkte, slik VoiceOver gjør.
    const a11yAction = (actionName: string) =>
      act(async () => hero.props.onAccessibilityAction({ nativeEvent: { actionName } }));
    await a11yAction('nextHole');
    expect(navigation.setParams).toHaveBeenLastCalledWith({ holeNumber: 3 });
    await a11yAction('previousHole');
    expect(navigation.setParams).toHaveBeenLastCalledWith({ holeNumber: 1 });

    // På hull 1 finnes ikke «Forrige hull».
    await render(holeElement(1, navigation));
    const names = screen
      .getByTestId('hole-hero-swipe')
      .props.accessibilityActions.map((action: { name: string }) => action.name);
    expect(names).toEqual(['nextHole']);
  });

  it('sollys: siste score i flighten går videre til neste hull', async () => {
    await act(async () => setSunlight(true));
    mockState.scores = [localScore('mate', 4, null, 2)];
    const navigation = await renderHole(2);
    await waitFor(() => {
      expect(screen.getByTestId('rail-option-4')).toBeTruthy();
    });
    mockState.scores = [localScore('mate', 4, null, 2), localScore('me', 4, null, 2)];
    await fireEvent.press(screen.getByTestId('rail-option-4'));
    await waitFor(
      () => {
        expect(navigation.setParams).toHaveBeenCalledWith({ holeNumber: 3 });
      },
      { timeout: 2000 },
    );
  });

  it('sollys: et hull som alt er ferdig når det åpnes, blir stående', async () => {
    await act(async () => setSunlight(true));
    // Som på telefonen: scorene kommer fra SQLite etter spillet.
    const { listScoresForGame } = jest.requireMock('../data/db') as { listScoresForGame: jest.Mock };
    listScoresForGame.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockState.scores), 30)),
    );
    try {
      mockState.scores = [localScore('mate', 4, null, 2), localScore('me', 4, null, 2)];
      const navigation = await renderHole(2);
      await waitFor(() => {
        expect(screen.getByTestId('flight-row-me-score')).toHaveTextContent('4');
      });
      await act(async () => new Promise((resolve) => setTimeout(resolve, 1200)));
      expect(navigation.setParams).not.toHaveBeenCalled();
    } finally {
      listScoresForGame.mockImplementation(async () => mockState.scores);
    }
  });

  it('sollys: siste score på hull 18 blir stående, for det finnes ikke noe neste hull', async () => {
    await act(async () => setSunlight(true));
    mockState.scores = [localScore('mate', 4, null, 18)];
    const navigation = await renderHole(18);
    await waitFor(() => {
      expect(screen.getByTestId('rail-option-4')).toBeTruthy();
    });
    mockState.scores = [localScore('mate', 4, null, 18), localScore('me', 4, null, 18)];
    await fireEvent.press(screen.getByTestId('rail-option-4'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1200)));
    expect(navigation.setParams).not.toHaveBeenCalled();
  });

  // #2219: i en blind runde som pågår viser hullsiden verken poeng eller
  // netto. Samme bundel med og uten blind runde, så forskjellen er regelen.
  it('stableford viser poeng på knappene, radene og «Stryk», men ikke i en blind runde', async () => {
    const stableford = {
      ...mockSoloBundle,
      game: { ...GAME_BASE, gameMode: 'stableford' },
    };
    mockState.bundle = stableford;
    mockState.scores = [localScore('mate', 5, null)];
    const { unmount } = await render(
      holeElement(1, { setParams: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('rail-option-4-detail').props.children).toBe('Par · 3 p');
    });
    // Slagene og poengene står i linja under navnet (#2385).
    expect(screen.getByTestId('flight-row-mate-note').props.children).toBe(`${strokesLine(1)} · 2 poeng`);
    await fireEvent.press(screen.getByTestId('rail-other'));
    expect(screen.getByTestId('specific-value-strike')).toHaveTextContent('Stryk · 0 p');
    await unmount();

    mockState.bundle = { ...stableford, game: { ...stableford.game, scoreVisibility: 'reveal' } };
    await renderHole();
    await waitFor(() => {
      expect(screen.getByTestId('rail-option-4-detail').props.children).toBe('Par');
    });
    // Blind runde: slagene er tildelingen og står, men poengene er borte.
    expect(screen.getByTestId('flight-row-mate-note').props.children).toBe(strokesLine(1));
    await fireEvent.press(screen.getByTestId('rail-other'));
    expect(screen.getByTestId('specific-value-strike')).toHaveTextContent('Stryk');
  });

  // Bingo Bango Bongo er formatet uten skinne (`formatUsesScoreRail`): kortene
  // står som før, og tapp på et tomt kort fører par.
  it('bingo bango bongo beholder kortene', async () => {
    mockState.bundle = {
      ...mockSoloBundle,
      game: { ...GAME_BASE, gameMode: 'bingo_bango_bongo' },
    };
    await renderHole();

    await waitFor(() => {
      expect(screen.getByTestId('player-card-me')).toBeTruthy();
    });
    expect(screen.queryByTestId('score-rail')).toBeNull();
    expect(screen.queryByTestId('flight-list')).toBeNull();

    await fireEvent.press(screen.getByTestId('player-card-me'));
    expect(writeScore).toHaveBeenCalledWith({
      gameId: GAME_ID,
      userId: 'me',
      holeNumber: 1,
      strokes: 4,
      enteredBy: 'me',
    });
  });

  it('kapteinen har slettet kontoen: hullet viser verdien hans, og «+» skriver til den nye eieren', async () => {
    mockState.bundle = mockWithdrawnCaptainBundle;
    mockState.scores = Array.from({ length: 9 }, (_, i) =>
      localScore('makker', i === 4 ? 6 : 5, null, i + 1),
    );
    await renderHole(5);

    // Hull 5 ble ført av kapteinen før slettingen. Raden er nå «me» sin.
    await waitFor(() => {
      expect(screen.getByTestId('flight-row-me-score').props.children).toBe(6);
    });

    await fireEvent.press(screen.getByTestId('flight-row-me'));
    await fireEvent.press(screen.getByTestId('rail-step-up'));

    await waitFor(() => {
      expect(writeScore).toHaveBeenCalledWith({
        gameId: GAME_ID,
        userId: 'me',
        holeNumber: 5,
        strokes: 7,
        enteredBy: 'me',
      });
    });
    // Den trukne raden kan ikke skrives til, og skal ikke prøves.
    expect(
      (writeScore as jest.Mock).mock.calls.map(([args]) => args.userId),
    ).toEqual(['me']);
  });
});

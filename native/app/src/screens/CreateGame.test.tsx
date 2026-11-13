// native/app/src/screens/CreateGame.test.tsx
// Native N6a (#1854): den ene render-testen (Type C) for opprett-veiviseren.
//
// Alle reglene er dekket andre steder: payload-fasongen i
// `wizardPayload.test.ts`, spillertaket i `rosterLimits.test.ts`, feilcopyen i
// `createGameCopy.test.ts`, skrivingen i `createGame.test.ts`. Det som står
// igjen — og som ingen ren funksjon kan svare på — er KOBLINGEN gjennom fem
// steg:
//
//  1. Havner valgene arrangøren gjør faktisk i utkastet som sendes? Et
//     format valgt i steg 1 og en sideturnering slått på i steg 2 skal fortsatt
//     være der i steg 5. Utkastet lever i minnet, så en feil her er stille:
//     runden opprettes, bare ikke den runden arrangøren satte opp.
//  2. Blir knappene STÅENDE etter en feilet publisering? En veiviser som låser
//     seg etter en nettverksfeil er verre enn en som feiler — arrangøren har
//     fylt ut fem steg og har ingen vei videre.
//  3. Går en vellykket publisering til `replace` og ikke `navigate`? Med
//     `navigate` ville «tilbake» fra den nye runden ført rett inn i en ferdig
//     veiviser.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { fetchCourses, fetchRosterCandidates, publishGame } from '../data/createGame';
import { fetchClubOptions } from '../data/clubOptions';
import { fetchFormatCatalog } from '../data/formatCatalog';
import { fetchOwnProfile } from '../data/profile';
import { describePendingOthers, PENDING_SELF_NOTE } from '../lib/createGameCopy';
import type { ScreenProps } from '../navigation';
import { SessionProvider } from '../session';
import { setBottomInset, bottomPadding } from '../test/safeAreaMock';
import { CreateGame, summaryLines } from './CreateGame';

// Den ekte `supabase.ts` kaster uten EXPO_PUBLIC_-variablene og kobler seg på
// AppState ved import. `formatCatalog` hentes med `requireActual` under, så
// den må stå her selv om ingen spørring kjøres i denne testen.
jest.mock('../supabase', () => require('../test/supabaseMock'));
// #2746: sperra som gjør pila, sveipet og Android-tilbake til ett steg tilbake.
// Testen holder på det siste skjermen meldte, og trykker «tilbake» ved å kalle
// tilbakekallet slik navigatoren gjør når skjermen er i ferd med å fjernes.
const mockPreventRemove: {
  enabled: boolean;
  callback: ((event: { data: { action: { type: string } } }) => void) | null;
} = { enabled: false, callback: null };
jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (
    enabled: boolean,
    callback: (event: { data: { action: { type: string } } }) => void,
  ) => {
    mockPreventRemove.enabled = enabled;
    mockPreventRemove.callback = callback;
  },
}));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());

// #2561: oppgjørsbryteren (rot-`lib/launchRules.ts`), styrt per test.
const mockSettlement = { on: false };
jest.mock('../../../../lib/launchRules', () => ({
  get SHOW_SETTLEMENT_IN_APP() {
    return mockSettlement.on;
  },
}));
beforeEach(() => {
  mockSettlement.on = false;
});

jest.mock('../data/syncTriggers', () => ({
  isDeviceOnline: () => true,
}));

jest.mock('../data/formatCatalog', () => ({
  ...jest.requireActual('../data/formatCatalog'),
  fetchFormatCatalog: jest.fn(async () => [
    {
      slug: 'stableford',
      label: 'Stableford',
      iconKey: 'flag',
      isPrimary: true,
      sortOrder: 1,
    },
    {
      slug: 'wolf',
      label: 'Wolf',
      iconKey: 'wolf',
      isPrimary: false,
      sortOrder: 2,
    },
  ]),
}));

// #2753: klubbvalget fra ruta. Uten klubbrolle står ikke flisen, som før.
const NO_CLUB = { canCreateClubGame: false, clubs: [], membersByClub: {} };
const mockClubOptions: { value: unknown } = { value: NO_CLUB };
jest.mock('../data/clubOptions', () => ({
  fetchClubOptions: jest.fn(async () => mockClubOptions.value),
}));
beforeEach(() => {
  mockClubOptions.value = NO_CLUB;
});

const member = (id: string, name: string) => ({
  id,
  name,
  nickname: null,
  hcpIndex: 14.2,
  gender: 'mens' as const,
  level: 'normal' as const,
  pending: false,
});
const CLUB_A = { id: 'club-a', name: 'Byneset GK', role: 'admin' as const, memberCount: 2 };
const CLUB_B = { id: 'club-b', name: 'Trondheim GK', role: 'member' as const, memberCount: 1 };
const ONE_CLUB = {
  canCreateClubGame: true,
  clubs: [CLUB_A],
  membersByClub: { 'club-a': [member('p5', 'Bente Birdie'), member('me', 'Jørgen Arrangør')] },
};
const TWO_CLUBS = {
  canCreateClubGame: true,
  clubs: [CLUB_A, CLUB_B],
  membersByClub: {
    ...ONE_CLUB.membersByClub,
    'club-b': [member('p6', 'Trine Tee')],
  },
};

// #1934: veiviseren leser egen profilrad for admin-flagget, og (#2441) for om
// din egen profil er fullført. Stubbet som de andre hentingene, så lesingen
// faktisk lykkes i riggen i stedet for å ende i en avvist promise som
// `useRemote` svelger stille.
const mockProfile = {
  name: 'Jørgen Arrangør',
  nickname: null,
  hcpIndex: 12.4,
  handicapUpdatedAt: null,
  gender: 'mens',
  level: null,
  isAdmin: false,
  profileCompletedAt: '2026-01-01T10:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z',
};

jest.mock('../data/profile', () => ({
  fetchOwnProfile: jest.fn(async () => mockProfile),
}));

// `roster_candidates` gir aldri kalleren tilbake (`u.id <> ctx.uid`), så lista
// har bare de andre. Du er «Deg» i veiviseren.
const mockCandidates = [
  {
    id: 'p2',
    name: 'Ada Aas',
    nickname: null,
    hcpIndex: 8.1,
    gender: 'ladies',
    level: 'normal',
    pending: false,
  },
  {
    id: 'p3',
    name: 'Ola Olsen',
    nickname: null,
    hcpIndex: 21.7,
    gender: 'mens',
    level: 'normal',
    pending: false,
  },
];

// Navnet må starte med `mock`: jest.mock-fabrikkene heises over importene.
let mockIdCount = 0;
jest.mock('../data/createGame', () => ({
  fetchCourses: jest.fn(async () => [
    {
      id: 'course-1',
      name: 'Losby Golfklubb',
      tees: [
        // Gul rater alle tre: uten dame-rating ville #1859-klemmen flyttet Ada
        // til herre, og «tee-settet følger profilen» hadde ikke vært testbart
        // i det hele tatt. Hvit mangler dame med vilje — den er den eneste
        // måten å se at et sett teen ikke rater faktisk er avslått, og at en
        // profilverdi teen ikke rater klemmes til noe den har.
        { id: 'tee-1', name: 'Gul', hasMens: true, hasLadies: true, hasJuniors: true },
        { id: 'tee-2', name: 'Hvit', hasMens: true, hasLadies: false, hasJuniors: true },
      ],
    },
  ]),
  fetchRosterCandidates: jest.fn(async () => mockCandidates),
  publishGame: jest.fn(),
  // En ny id per kall: lagde skjermen id-en per trykk, ville forsøkene fått hver sin.
  newGameId: jest.fn(() => `wizard-game-id-${++mockIdCount}`),
}));

const publishGameMock = publishGame as jest.MockedFunction<typeof publishGame>;
const fetchOwnProfileMock = fetchOwnProfile as jest.MockedFunction<typeof fetchOwnProfile>;
const fetchRosterCandidatesMock = fetchRosterCandidates as jest.MockedFunction<
  typeof fetchRosterCandidates
>;

/**
 * Veiviseren rendret. Uten `atType` er Kompis-runde valgt i steg 1, så testen
 * står på formatsteget som før #2753.
 */
async function renderWizard({ atType = false }: { atType?: boolean } = {}) {
  const navigation = {
    // `openOrReturn` leser stakken (#2753). Tom stakk: Cup åpnes på vanlig måte.
    getState: jest.fn(() => undefined),
    replace: jest.fn(),
    goBack: jest.fn(),
    navigate: jest.fn(),
    dispatch: jest.fn(),
    setParams: jest.fn(),
    // Veiviseren henter profilen på nytt når den får fokus igjen (#2441).
    addListener: jest.fn(() => jest.fn()),
  } as unknown as ScreenProps<'CreateGame'>['navigation'];

  const view = await render(
    <SessionProvider value={{ userId: 'me', email: 'admin@example.test' }}>
      <CreateGame
        navigation={navigation}
        route={{ key: 'CreateGame-1', name: 'CreateGame' }}
      />
    </SessionProvider>,
  );

  /** Fokus-lytteren skjermen meldte på, som om arrangøren kom tilbake hit. */
  const focusListener = () => {
    const calls = (navigation.addListener as unknown as jest.Mock).mock.calls as [
      string,
      () => void,
    ][];
    const call = calls.find(([event]) => event === 'focus');
    if (!call) throw new Error('skjermen meldte ikke på noen fokus-lytter');
    return call[1];
  };

  if (!atType) {
    await fireEvent.press(await screen.findByTestId('create-type-kompis'));
    await fireEvent.press(screen.getByTestId('create-next'));
  }

  return { ...view, navigation, focusListener };
}

async function goToCourseStep() {
  await fireEvent.press(await screen.findByTestId('create-format-stableford'));
  await fireEvent.press(screen.getByTestId('create-next'));
  await fireEvent.press(screen.getByTestId('create-next'));
}

describe('CreateGame: hva slags arrangement (#2753)', () => {
  it('starter med Kompis-runde og Cup, uten Klubb-turnering og «Solo / test»', async () => {
    await renderWizard({ atType: true });
    expect(await screen.findByTestId('create-step-type')).toBeTruthy();
    expect(screen.getByTestId('create-progress').props.children).toBe('Steg 1 av 6 · Arrangement');
    expect(screen.getByText('Hva slags arrangement?')).toBeTruthy();
    expect(screen.getByTestId('create-type-kompis')).toBeTruthy();
    expect(screen.getByTestId('create-type-cup')).toBeTruthy();
    // Vent til klubbvalget er hentet, så fravær av flisen betyr noe.
    await waitFor(() => expect(fetchClubOptions).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('create-type-klubb')).toBeNull();
    expect(screen.queryByTestId('create-type-solo')).toBeNull();
    expect(screen.queryByText('Solo / test')).toBeNull();

    // Ingen flis er valgt fra start, og «Neste» venter på et valg, som på nettet.
    expect(screen.getByTestId('create-next').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('create-next-hint').props.children).toBe('Velg hva slags arrangement først');
  });

  it('Kompis-runde går videre til formatene for kompis', async () => {
    (fetchFormatCatalog as jest.Mock).mockClear();
    await renderWizard();
    expect(await screen.findByTestId('create-step-format')).toBeTruthy();
    expect(fetchFormatCatalog).toHaveBeenCalledWith('kompis');
    expect(screen.getByTestId('create-format-stableford')).toBeTruthy();
    expect(screen.getByTestId('create-format-wolf')).toBeTruthy();
  });

  it('Cup åpner cup-veiviseren og blir stående på typevalget', async () => {
    const { navigation } = await renderWizard({ atType: true });
    await fireEvent.press(await screen.findByTestId('create-type-cup'));
    expect(screen.getByTestId('create-type-cup').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('create-next'));

    expect(navigation.navigate).toHaveBeenCalledWith('CreateCup', undefined);
    expect(screen.getByTestId('create-step-type')).toBeTruthy();
    expect(screen.queryByTestId('create-step-format')).toBeNull();
  });
});

describe('CreateGame: klubbturnering (#2753)', () => {
  it('en klubbadmin ser Kompis-runde, Klubb-turnering og Cup', async () => {
    mockClubOptions.value = ONE_CLUB;
    await renderWizard({ atType: true });
    expect(await screen.findByTestId('create-type-klubb')).toBeTruthy();
    expect(screen.getByTestId('create-type-kompis')).toBeTruthy();
    expect(screen.getByTestId('create-type-cup')).toBeTruthy();
  });

  it('med én klubb er den valgt, lista er medlemmene, og runden publiseres uten spillere', async () => {
    mockClubOptions.value = ONE_CLUB;
    (fetchFormatCatalog as jest.Mock).mockClear();
    publishGameMock.mockResolvedValueOnce({ ok: true, gameId: 'club-game' });
    const { navigation } = await renderWizard({ atType: true });

    await fireEvent.press(await screen.findByTestId('create-type-klubb'));
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(fetchFormatCatalog).toHaveBeenLastCalledWith('klubb');
    expect(screen.getByTestId('create-club-club-a').props.accessibilityState).toMatchObject({ selected: true });

    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(await screen.findByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // Spillersteget: medlemmene, du med, ingen valgt, og ingen fast rad for deg.
    expect(screen.getByTestId('create-roster-club')).toBeTruthy();
    expect(screen.getByTestId('create-player-p5').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByTestId('create-player-me').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.queryByText('Du er alltid med')).toBeNull();
    expect(screen.queryByTestId('create-player-p2')).toBeNull();
    expect(screen.queryByTestId('create-roster-fit')).toBeNull();
    // #2840 del 4: klubbturneringen har ikke påmeldingsvalget (#643).
    expect(screen.queryByTestId('create-registration')).toBeNull();

    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByText('Ingen spillere ennå.')).toBeTruthy();
    expect(screen.queryByTestId('create-summary-registration')).toBeNull();
    await fireEvent.press(screen.getByTestId('create-publish'));

    const [draft] = publishGameMock.mock.calls.at(-1)!;
    expect(draft.groupId).toBe('club-a');
    expect(draft.players).toEqual([]);
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', { gameId: 'club-game' });
    // Kallene lekker ellers til neste test, som teller dem.
    publishGameMock.mockClear();
  });

  it('en arrangør som ikke spiller, får ingen merknad om egen profil', async () => {
    mockClubOptions.value = ONE_CLUB;
    fetchOwnProfileMock.mockResolvedValue({ ...mockProfile, profileCompletedAt: null });
    try {
      await renderWizard({ atType: true });
      await fireEvent.press(await screen.findByTestId('create-type-klubb'));
      await fireEvent.press(screen.getByTestId('create-next'));
      await fireEvent.press(await screen.findByTestId('create-format-stableford'));
      await fireEvent.press(screen.getByTestId('create-next'));
      await fireEvent.press(screen.getByTestId('create-next'));
      await fireEvent.press(await screen.findByTestId('create-course-course-1'));
      await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
      await fireEvent.press(screen.getByTestId('create-next'));
      await fireEvent.press(screen.getByTestId('create-next'));
      expect(screen.queryByText(PENDING_SELF_NOTE)).toBeNull();

      // Velger arrangøren seg selv, gjelder sperren, og merknaden står.
      await fireEvent.press(screen.getByTestId('create-back'));
      await fireEvent.press(screen.getByTestId('create-player-me'));
      await fireEvent.press(screen.getByTestId('create-next'));
      expect(screen.getByText(PENDING_SELF_NOTE)).toBeTruthy();
    } finally {
      fetchOwnProfileMock.mockResolvedValue(mockProfile);
    }
  });

  it('med flere klubber venter «Neste» på et valg, og lista følger klubben', async () => {
    mockClubOptions.value = TWO_CLUBS;
    await renderWizard({ atType: true });
    await fireEvent.press(await screen.findByTestId('create-type-klubb'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(await screen.findByTestId('create-format-stableford'));

    expect(screen.getByTestId('create-next').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('create-next-hint').props.children).toBe('Velg klubben først');

    await fireEvent.press(screen.getByTestId('create-club-club-b'));
    expect(screen.getByTestId('create-next').props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(await screen.findByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByTestId('create-player-p6')).toBeTruthy();
    expect(screen.queryByTestId('create-player-p5')).toBeNull();
  });

  it('typebytte nullstiller formatet og spillerlista, navnet står', async () => {
    mockClubOptions.value = ONE_CLUB;
    await renderWizard({ atType: true });
    await fireEvent.press(await screen.findByTestId('create-type-kompis'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.changeText(screen.getByTestId('create-name'), 'Klubbkvelden');

    await fireEvent.press(screen.getByTestId('create-back'));
    await fireEvent.press(screen.getByTestId('create-back'));
    await fireEvent.press(screen.getByTestId('create-type-klubb'));
    await fireEvent.press(screen.getByTestId('create-next'));

    expect(screen.getByTestId('create-format-stableford').props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(screen.getByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByTestId('create-name').props.value).toBe('Klubbkvelden');
  });
});

describe('CreateGame: de nye formatene (#2753 D3)', () => {
  it('Patsome viser segmentene, tar tellemåten og fordeler i lag', async () => {
    (fetchFormatCatalog as jest.Mock).mockResolvedValueOnce([
      { slug: 'patsome', label: 'Patsome', iconKey: 'patsome', isPrimary: false, sortOrder: 50 },
    ]);
    publishGameMock.mockResolvedValueOnce({ ok: true, gameId: 'patsome-game' });
    await renderWizard();
    await fireEvent.press(await screen.findByTestId('create-format-patsome'));
    await fireEvent.press(screen.getByTestId('create-next'));

    expect(screen.getByTestId('create-patsome-Hull 1–6')).toBeTruthy();
    expect(screen.getByTestId('create-patsome-net').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('create-patsome-gross'));

    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(await screen.findByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // Lagknappene står, som for best ball.
    await fireEvent.press(await screen.findByTestId('create-player-p2'));
    await fireEvent.press(screen.getByTestId('create-team-me-1'));
    await fireEvent.press(screen.getByTestId('create-team-p2-1'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-publish'));

    const [draft] = publishGameMock.mock.calls.at(-1)!;
    expect(draft.gameMode).toBe('patsome');
    expect(draft.setup).toMatchObject({ patsomeScoring: 'gross' });
    expect(draft.players.map((p: { teamNumber: number | null }) => p.teamNumber)).toEqual([1, 1]);
    publishGameMock.mockClear();
  });
});

describe('CreateGame: scramble og shamble (#2753 D3b)', () => {
  it('Texas: lagstørrelse, lag-handicap i snitt-prosent, og lagene', async () => {
    (fetchFormatCatalog as jest.Mock).mockResolvedValueOnce([
      { slug: 'texas_scramble', label: 'Texas scramble', iconKey: 't', isPrimary: false, sortOrder: 10 },
    ]);
    publishGameMock.mockResolvedValueOnce({ ok: true, gameId: 'texas-game' });
    await renderWizard();
    await fireEvent.press(await screen.findByTestId('create-format-texas_scramble'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // Nettets standard: firemannslag, 40 av snittet = 10 % av summen.
    expect(screen.getByTestId('create-team-size-4').props.accessibilityState).toMatchObject({ selected: true });
    // Artboardets 10 pt luft på sidene, så «Tremannslag» står på én linje.
    expect(StyleSheet.flatten(screen.getByTestId('create-team-size-3').props.style)).toMatchObject({
      paddingHorizontal: 10,
    });
    // iOS tegner Fraunces bredere enn tegningen: tittelen krymper heller enn å dele ordet.
    expect(screen.getByText('Tremannslag').props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
    expect(screen.getByTestId('create-team-hcp').props.placeholder).toBe('40');
    await fireEvent.press(screen.getByTestId('create-team-size-2'));
    expect(screen.getByTestId('create-team-hcp').props.placeholder).toBe('50');
    await fireEvent.changeText(screen.getByTestId('create-team-hcp'), '60');
    expect(screen.getByTestId('create-team-hcp-sum').props.children).toBe(
      'Valget ditt tilsvarer 30\u00a0% av summen av banehandicapene.',
    );

    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(await screen.findByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(await screen.findByTestId('create-player-p2'));
    await fireEvent.press(screen.getByTestId('create-team-me-1'));
    await fireEvent.press(screen.getByTestId('create-team-p2-1'));
    // Laget er fullt med to: lag 1 er grått for den tredje.
    await fireEvent.press(screen.getByTestId('create-player-p3'));
    expect(screen.getByTestId('create-team-p3-1').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('create-player-p3'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-publish'));

    const [draft] = publishGameMock.mock.calls.at(-1)!;
    expect(draft.gameMode).toBe('texas_scramble');
    expect(draft.setup).toMatchObject({ teamSize: 2, teamHandicapSumPct: 30 });
    publishGameMock.mockClear();
  });

  it('Shamble: champagne viser antallet, brutto skjuler andelen', async () => {
    (fetchFormatCatalog as jest.Mock).mockResolvedValueOnce([
      { slug: 'shamble', label: 'Shamble / Champagne Scramble', iconKey: 's', isPrimary: false, sortOrder: 20 },
    ]);
    await renderWizard();
    await fireEvent.press(await screen.findByTestId('create-format-shamble'));
    await fireEvent.press(screen.getByTestId('create-next'));

    expect(screen.getByTestId('create-shamble-size-4').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.queryByTestId('create-shamble-count-3')).toBeNull();
    expect(screen.getByTestId('create-shamble-allowance')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('create-shamble-variant-champagne'));
    await fireEvent.press(screen.getByTestId('create-shamble-count-3'));
    await fireEvent.press(screen.getByTestId('create-shamble-gross'));
    expect(screen.queryByTestId('create-shamble-allowance')).toBeNull();
    expect(screen.getByTestId('create-shamble-count-3').props.accessibilityState).toMatchObject({ selected: true });
  });
});

const TEXAS_AND_STABLEFORD = [
  { slug: 'texas_scramble', label: 'Texas scramble', iconKey: 't', isPrimary: false, sortOrder: 1 },
  { slug: 'stableford', label: 'Stableford', iconKey: 'flag', isPrimary: true, sortOrder: 2 },
];

/** Fra formatsteget til spillersteget. Første gang velges bane og tee; de står etterpå. */
async function formatToPlayers(slug: string, { pickCourse = true }: { pickCourse?: boolean } = {}) {
  await fireEvent.press(await screen.findByTestId(`create-format-${slug}`));
  await fireEvent.press(screen.getByTestId('create-next'));
  await fireEvent.press(screen.getByTestId('create-next'));
  if (pickCourse) {
    await fireEvent.press(await screen.findByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
  }
  await fireEvent.press(screen.getByTestId('create-next'));
}

describe('CreateGame: påmeldingen i en kompisrunde (#2840 del 4)', () => {
  afterEach(() => publishGameMock.mockClear());

  it('tre valg, bryteren bare under godkjenning, og ingen «Hva melder man på?» uten lag', async () => {
    publishGameMock.mockResolvedValueOnce({ ok: true, gameId: 'g-approval' });
    await renderWizard();
    await formatToPlayers('stableford');

    expect(screen.getByText('Hvordan får dere spillere?')).toBeTruthy();
    for (const mode of ['invite_only', 'manual_approval', 'open']) {
      expect(screen.getByTestId(`create-registration-${mode}`)).toBeTruthy();
    }
    expect(screen.getByTestId('create-registration-invite_only').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.queryByTestId('create-registration-what')).toBeNull();
    expect(screen.queryByTestId('create-registration-friends')).toBeNull();
    expect(screen.getByTestId('create-players-heading').props.children).toBe('Hvem spiller?');

    await fireEvent.press(screen.getByTestId('create-registration-manual_approval'));
    expect(screen.getByText('Slipp venner direkte inn')).toBeTruthy();
    expect(screen.getByTestId('create-players-heading').props.children).toBe(
      'Vil du legge inn noen nå? Lista kan stå tom.',
    );
    // Uten lag står du på lista som før.
    expect(screen.getByTestId('create-player-me')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('create-registration-friends-switch'));

    await fireEvent.press(screen.getByTestId('create-registration-open'));
    expect(screen.queryByTestId('create-registration-friends')).toBeNull();
    await fireEvent.press(screen.getByTestId('create-registration-manual_approval'));

    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByTestId('create-summary-registration').props.children).toBe('Du godkjenner påmeldinger');
    await fireEvent.press(screen.getByTestId('create-publish'));
    const [draft] = publishGameMock.mock.calls.at(-1)!;
    expect(draft).toMatchObject({
      registrationMode: 'manual_approval',
      registrationType: 'solo',
      letFriendsSkipGate: true,
    });
    expect(draft.players.map((p) => p.userId)).toEqual(['me']);
  });

  it('Texas med åpen påmelding og Lag: du går av lista, og runden publiseres uten spillere', async () => {
    (fetchFormatCatalog as jest.Mock).mockResolvedValueOnce(TEXAS_AND_STABLEFORD);
    publishGameMock.mockResolvedValueOnce({ ok: true, gameId: 'g-team' });
    const { navigation } = await renderWizard();
    await formatToPlayers('texas_scramble');

    expect(screen.getByTestId('create-registration-what')).toBeTruthy();
    expect(screen.getByTestId('create-registration-type-solo').props.accessibilityState).toMatchObject({
      selected: true,
    });
    // «Jeg velger dem nå» og Lag: du står på lista, ingen merknad.
    await fireEvent.press(screen.getByTestId('create-registration-type-team'));
    expect(screen.queryByTestId('create-registration-organiser-note')).toBeNull();
    expect(screen.getByTestId('create-player-me')).toBeTruthy();
    // En venn valgt før påmeldingen byttes til lag via lenken.
    await fireEvent.press(screen.getByTestId('create-player-p2'));

    await fireEvent.press(screen.getByTestId('create-registration-open'));
    expect(screen.getByTestId('create-registration-organiser-note').props.children).toBe(
      'Du står ikke på lista nå. Når runden er publisert, melder du på laget ditt fra runden.',
    );
    // #2840: ingen liste med lag via lenken (tegningen): lagene melder seg på selv, og
    // en valgt venn ville stått uten lag og ikke kunnet melde på sitt eget.
    expect(screen.queryByTestId('create-player-me')).toBeNull();
    expect(screen.queryByTestId('create-player-p2')).toBeNull();
    expect(screen.queryByTestId('create-roster-count')).toBeNull();
    expect(screen.queryByTestId('create-players-heading')).toBeNull();
    expect(screen.queryByTestId('create-roster-fit')).toBeNull();

    // Lista kan stå tom: «Neste» er åpen, og publiseringen likeså.
    expect(screen.getByTestId('create-next').props.accessibilityState).not.toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByTestId('create-summary-registration').props.children).toBe('Åpen påmelding · lag');
    expect(screen.getByText('Spillere (0)')).toBeTruthy();
    expect(screen.getByTestId('create-summary-players').props.children).toBe('Lagene melder seg på selv');
    expect(screen.queryByTestId('create-warning-fit')).toBeNull();
    await fireEvent.press(screen.getByTestId('create-publish'));

    const [draft] = publishGameMock.mock.calls.at(-1)!;
    expect(draft).toMatchObject({ registrationMode: 'open', registrationType: 'team', players: [] });
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', { gameId: 'g-team' });
  });

  it('et format uten lag setter typen tilbake til Individuelt, og du er på lista igjen', async () => {
    (fetchFormatCatalog as jest.Mock).mockResolvedValueOnce(TEXAS_AND_STABLEFORD);
    await renderWizard();
    await formatToPlayers('texas_scramble');
    await fireEvent.press(screen.getByTestId('create-registration-open'));
    await fireEvent.press(screen.getByTestId('create-registration-type-team'));
    expect(screen.queryByTestId('create-player-me')).toBeNull();

    // Tilbake til formatene: Stableford har ikke lag.
    for (let i = 0; i < 3; i += 1) await fireEvent.press(screen.getByTestId('create-back'));
    await formatToPlayers('stableford', { pickCourse: false });
    expect(screen.queryByTestId('create-registration-what')).toBeNull();
    expect(screen.queryByTestId('create-registration-organiser-note')).toBeNull();
    expect(screen.getByTestId('create-player-me')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByTestId('create-summary-registration').props.children).toBe('Åpen påmelding');

    // Og Texas igjen: Individuelt står valgt, som på nettet.
    await fireEvent.press(screen.getByTestId('create-back'));
    for (let i = 0; i < 3; i += 1) await fireEvent.press(screen.getByTestId('create-back'));
    await formatToPlayers('texas_scramble', { pickCourse: false });
    expect(screen.getByTestId('create-registration-type-solo').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });
});

describe('CreateGame og «Ny bane» (#2757)', () => {
  it('døra står under lista, også når søket gir treff, og tar med det du søkte på', async () => {
    const { navigation } = await renderWizard();
    await goToCourseStep();
    expect(await screen.findByTestId('create-course-course-1')).toBeTruthy();
    expect(screen.getByTestId('create-course-new')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('create-course-search'), ' Testbane 2757 ');
    expect(screen.getByTestId('create-course-none')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('create-course-new'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateCourse', { name: 'Testbane 2757' });
  });

  it('banen fra skjemaet står valgt, tee tom, lista hentes på nytt én gang og parameteren nulles', async () => {
    const { navigation, rerender } = await renderWizard();
    await goToCourseStep();
    await fireEvent.press(await screen.findByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
    // Arrangøren sto i lista («Velg en annen bane») da hen åpnet skjemaet.
    await fireEvent.press(screen.getByTestId('create-course-change'));
    (fetchCourses as jest.Mock).mockClear();
    // Lista med den nye banen, for begge hentingene under.
    const withNewCourse = [
      {
        id: 'course-1',
        name: 'Losby Golfklubb',
        tees: [{ id: 'tee-1', name: 'Gul', hasMens: true, hasLadies: true, hasJuniors: true }],
      },
      {
        id: 'course-new',
        name: 'Testbane 2757',
        tees: [{ id: 'tee-new', name: 'Gul', hasMens: true, hasLadies: true, hasJuniors: false }],
      },
    ];
    (fetchCourses as jest.Mock)
      .mockResolvedValueOnce(withNewCourse)
      .mockResolvedValueOnce(withNewCourse);

    await rerender(
      <SessionProvider value={{ userId: 'me', email: 'admin@example.test' }}>
        <CreateGame
          navigation={navigation}
          route={{ key: 'CreateGame-1', name: 'CreateGame', params: { createdCourseId: 'course-new' } }}
        />
      </SessionProvider>,
    );

    expect(await screen.findByTestId('create-tee-tee-new')).toBeTruthy();
    expect(screen.getByTestId('create-course-course-new').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('create-tee-tee-new').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByTestId('create-next-hint')).toBeTruthy();
    expect(fetchCourses).toHaveBeenCalledTimes(1);
    expect(navigation.setParams).toHaveBeenCalledWith({ createdCourseId: undefined });

    // Samme bane én gang til fra lista («Bruk denne»): lista lukkes også da.
    const wizard = (params?: { createdCourseId?: string }) => (
      <SessionProvider value={{ userId: 'me', email: 'admin@example.test' }}>
        <CreateGame navigation={navigation} route={{ key: 'CreateGame-1', name: 'CreateGame', params }} />
      </SessionProvider>
    );
    await rerender(wizard());
    await fireEvent.press(screen.getByTestId('create-course-change'));
    expect(screen.queryByTestId('create-tee-tee-new')).toBeNull();
    await rerender(wizard({ createdCourseId: 'course-new' }));
    expect(await screen.findByTestId('create-tee-tee-new')).toBeTruthy();
    expect(screen.getByTestId('create-course-change')).toBeTruthy();
  });
});

describe('CreateGame', () => {
  // #1954 D3: med tre knapper på Android ligger navigasjonslinja over bunnen av
  // skjermen. Innholdet skal ende over den, med samme luft som før.
  it('legger systemlinja til bunnluften', async () => {
    setBottomInset(48);
    try {
      await renderWizard();
      await screen.findByTestId('create-screen');
      expect(bottomPadding('create-screen')).toBe(20 + 48);
    } finally {
      setBottomInset(0);
    }
  });

  it('bærer valgene gjennom alle fem stegene, står imot en feilet publisering, og bytter ut seg selv ved suksess', async () => {
    let releasePublish!: (result: Awaited<ReturnType<typeof publishGame>>) => void;
    // Går gjennom alle fem veiviser-stegene i én flyt (bevisst — det er nettopp
    // det testen skal bevise). Tidsgrensen står i jest.config.js (#1872).
    publishGameMock
      // Første forsøk feiler: knappen skal ikke låse seg, og meldingen skal
      // være den norske setningen for koden — ikke en rå PostgREST-streng.
      .mockResolvedValueOnce({ ok: false, error: 'db_game' })
      // Andre forsøk holdes igjen, så testen kan trykke tilbake underveis (#2746).
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releasePublish = resolve;
        }),
      );
    // #2441: Ola har ikke fullført profilen. Det stopper ikke publiseringen.
    // Per venter også, men er ikke valgt, og skal ikke telles med.
    fetchRosterCandidatesMock.mockResolvedValueOnce([
      mockCandidates[0]!,
      { ...mockCandidates[1]!, pending: true },
      {
        id: 'p4',
        name: 'Per Putter',
        nickname: null,
        hcpIndex: 30.2,
        gender: 'mens',
        level: 'normal',
        pending: true,
      },
    ]);
    // Arrangøren er dame. Teen din følger din egen profil, ikke kandidatlista
    // (der står du aldri).
    fetchOwnProfileMock.mockResolvedValueOnce({ ...mockProfile, gender: 'ladies' });

    const { navigation } = await renderWizard();

    // ── Steg 1: format ────────────────────────────────────────────────────
    await screen.findByTestId('create-format-stableford');
    // Wolf er hentet og vises selv om rosteret (bare meg) ikke passer ennå —
    // antalls-gaten hører hjemme i steg 4, ikke i formatlista.
    expect(screen.getByTestId('create-format-wolf')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // ── Steg 2: oppsett ───────────────────────────────────────────────────
    expect(screen.getByTestId('create-step-setup')).toBeTruthy();
    // Navnet er forhåndsfylt fra formatet, så `name_required` aldri møter
    // arrangøren.
    expect(screen.getByTestId('create-name').props.value).toBe('Stableford');
    // #1980: HCP-andelen fra webbens AllowanceField.
    await fireEvent.changeText(screen.getByTestId('create-allowance'), '85');
    // #2709: Tørnys egen bryter (DesignSwitch), et trykk slår den på.
    await fireEvent.press(screen.getByTestId('create-side-toggle'));
    await fireEvent.press(screen.getByTestId('create-side-ld-1'));
    await fireEvent.press(screen.getByTestId('create-side-ctp-1'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // ── Steg 3: bane og tid ───────────────────────────────────────────────
    await screen.findByTestId('create-course-course-1');
    await fireEvent.press(screen.getByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // ── Steg 4: spillere ──────────────────────────────────────────────────
    expect(screen.getByTestId('create-step-players')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('create-player-p2'));
    await fireEvent.press(screen.getByTestId('create-player-p3'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // ── Steg 5: oppsummering ──────────────────────────────────────────────
    expect(screen.getByTestId('create-summary-players').props.children).toBe(
      'Deg, Ada Aas, Ola Olsen',
    );
    // En merknad, ikke en sperre: Ola venter, og publiseringen går likevel.
    // Bare de valgte teller: Ola, ikke Per.
    expect(screen.getByTestId('create-warning-pending-others').props.children).toBe(
      describePendingOthers(1),
    );
    expect(screen.queryByTestId('create-warning-pending-self')).toBeNull();
    expect(screen.getByTestId('create-summary-side').props.children).toBe(
      '1 lengste drive · 1 nærmest pinnen',
    );

    await fireEvent.press(screen.getByTestId('create-publish'));

    // Utkastet skal bære HELE veiviseren, ikke bare siste steg.
    expect(publishGameMock).toHaveBeenCalledTimes(1);
    const draft = publishGameMock.mock.calls[0]![0];
    expect(draft).toEqual(
      expect.objectContaining({
        gameMode: 'stableford',
        name: 'Stableford',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        sideTournamentEnabled: true,
        sideLdCount: 1,
        sideCtpCount: 1,
        hcpAllowancePct: 85,
      }),
    );
    // Andelen går til `hcp_allowance_pct`, ikke til greensome-kolonnen.
    expect(draft.setup?.greensomeAllowancePct).toBeUndefined();
    expect(draft.teeOffAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Tee-kjønnet leses fra profilen: Ada og du står som `ladies` og skal
    // spille fra dametee uten at veiviseren spør.
    expect(draft.players).toEqual([
      { userId: 'me', teeGender: 'D', teamNumber: null },
      { userId: 'p2', teeGender: 'D', teamNumber: null },
      { userId: 'p3', teeGender: 'M', teamNumber: null },
    ]);

    // Feilet skriving: norsk melding, ingen navigasjon, knappen fortsatt åpen.
    expect(screen.getByTestId('create-error').props.children).toBe(
      'Klarte ikke å lagre spillet. Prøv igjen om litt.',
    );
    expect(navigation.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('create-publish'));

    // #2746: tilbake mens publiseringen pågår gjør ingenting, så svaret lander
    // på steget det ble sendt fra.
    await act(async () => {
      mockPreventRemove.callback!({ data: { action: { type: 'GO_BACK' } } });
    });
    expect(screen.getByTestId('create-publish')).toBeTruthy();
    await act(async () => {
      releasePublish({ ok: true, gameId: 'new-game-1' });
    });

    expect(publishGameMock).toHaveBeenCalledTimes(2);
    // #1954 D2: samme runde-id begge gangene, så et forsøk som faktisk lagret
    // runden ikke gir runde nummer to.
    const [firstId, secondId] = publishGameMock.mock.calls.map((call) => call[1]);
    expect(firstId).toMatch(/^wizard-game-id-\d+$/);
    expect(secondId).toBe(firstId);
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', {
      gameId: 'new-game-1',
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
    // #2746: `replace` fjerner veiviseren, og sperra slipper den gjennom i
    // stedet for å gå ett steg tilbake.
    expect(mockPreventRemove.enabled).toBe(true);
    const replaceAction = { type: 'REPLACE' };
    await act(async () => {
      mockPreventRemove.callback!({ data: { action: replaceAction } });
    });
    expect(navigation.dispatch).toHaveBeenCalledWith(replaceAction);
  });

  // #2746 (`docs/user-flows.md` §Tilbake): pila, sveipet og Android-tilbake
  // går ett steg, som «Tilbake»-knappen. På første steg står ingen sperre, så
  // skjermen lukkes.
  it('tilbake går ett steg med valgene beholdt, og første steg slipper skjermen', async () => {
    const { navigation } = await renderWizard();
    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    // Formatet er steg 2 etter #2753, så sperra står alt her.
    expect(mockPreventRemove.enabled).toBe(true);
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.changeText(screen.getByTestId('create-name'), 'Torsdagsrunden');
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.queryByTestId('create-step-setup')).toBeNull();

    // Steg 3 → tilbake → steg 2, med navnet som ble skrevet.
    expect(mockPreventRemove.enabled).toBe(true);
    await act(async () => {
      mockPreventRemove.callback!({ data: { action: { type: 'GO_BACK' } } });
    });
    expect(screen.getByTestId('create-step-setup')).toBeTruthy();
    expect(screen.getByTestId('create-name').props.value).toBe('Torsdagsrunden');

    // Steg 3 → tilbake → formatsteget, med formatet fortsatt valgt.
    await act(async () => {
      mockPreventRemove.callback!({ data: { action: { type: 'GO_BACK' } } });
    });
    expect(screen.queryByTestId('create-step-setup')).toBeNull();
    expect(screen.getByTestId('create-format-stableford').props.accessibilityState).toMatchObject({
      selected: true,
    });

    // Formatsteget → tilbake → typevalget, med Kompis-runde valgt (#2753).
    expect(mockPreventRemove.enabled).toBe(true);
    await act(async () => {
      mockPreventRemove.callback!({ data: { action: { type: 'GO_BACK' } } });
    });
    expect(screen.getByTestId('create-type-kompis').props.accessibilityState).toMatchObject({
      selected: true,
    });
    // Første steg: ingen sperre, så navigatoren fjerner skjermen selv.
    expect(mockPreventRemove.enabled).toBe(false);
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  // N6a-evaluatorens funn N2: at `selectMode` nullstiller oppsettet var
  // ubeskyttet -- begge linjene kunne slettes med 511/511 groenne tester. Selve
  // lekkasjen fanges av `isParStableford` i payload-laget, men nullstillingen er
  // det som gjoer at SKJERMEN ikke viser et «Par»-valg som ikke lenger gjelder.
  it('setter brutto som 0 % og viser webbens brutto-tekst (#1980)', async () => {
    await renderWizard();
    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));

    await fireEvent.press(screen.getByTestId('create-allowance-brutto'));

    expect(screen.queryByTestId('create-allowance')).toBeNull();
    expect(screen.getByTestId('create-allowance-brutto-helper').props.children).toBe(
      'Stableford-poeng beregnes på bruttoscore mot par. Scratch-format.',
    );

    // Tilbake til netto: feltet er der igjen, tomt = 100.
    await fireEvent.press(screen.getByTestId('create-allowance-netto'));
    expect(screen.getByTestId('create-allowance').props.value).toBe('');
  });

  // #2561: wolf spiller om poeng med enhet, og appen spør om kroner per poeng
  // bare når oppgjørsbryteren (rot-`lib/launchRules.ts`) er på. Ved lansering er
  // den av.
  it.each([
    { on: false, field: false },
    { on: true, field: true },
  ])('#2561: «Kroner per …» i oppsettet følger oppgjørsbryteren ($on)', async ({ on, field }) => {
    mockSettlement.on = on;
    await renderWizard();
    await fireEvent.press(await screen.findByTestId('create-format-wolf'));
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByTestId('create-step-setup')).toBeTruthy();
    expect(screen.queryByTestId('create-kr-per-unit') !== null).toBe(field);
    mockSettlement.on = false;
  });

  it('kaster modus-spesifikke valg naar formatet byttes, og lar dobbelttrykk staa', async () => {
    await renderWizard();

    // Stableford -> «Par», altsaa 4BBB.
    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-team-size-2'));

    // Dobbelttrykk paa formatet som ALLEREDE er valgt skal ikke kaste noe.
    await fireEvent.press(screen.getByTestId('create-back'));
    await fireEvent.press(screen.getByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByTestId('create-team-size-2').props.accessibilityState)
      .toMatchObject({ selected: true });

    // Bytte til wolf skal kaste det. Wolf rendrer ikke kontrollen i det hele
    // tatt, saa fravaeret av den beviser ingenting -- vi maa gaa TILBAKE til
    // stableford og se at valget faktisk er borte. Uten nullstillingen staar
    // «Par» der fortsatt, og arrangoeren faar 4BBB hen ikke har bedt om.
    await fireEvent.press(screen.getByTestId('create-back'));
    await fireEvent.press(screen.getByTestId('create-format-wolf'));
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.queryByTestId('create-team-size-2')).toBeNull();

    await fireEvent.press(screen.getByTestId('create-back'));
    await fireEvent.press(screen.getByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByTestId('create-team-size-1').props.accessibilityState)
      .toMatchObject({ selected: true });
  });

  // #1859. Selve utledningen (profil-default + overstyring + klem) er dekket i
  // `lib/teeChoice.test.ts`; det som bare kan ses gjennom hele veiviseren er
  // KOBLINGEN: at chipen faktisk skriver til utkastet, og at et sett teen ikke
  // rater er avslått i stedet for å bli et stille feil banehandicap.
  it('lar arrangøren velge tee-sett per spiller, og slår av settene teen ikke rater', async () => {
    fetchOwnProfileMock.mockResolvedValueOnce({ ...mockProfile, profileCompletedAt: null });
    const { focusListener } = await renderWizard();

    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // Hvit rater herre og junior, men ikke dame.
    await fireEvent.press(await screen.findByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-2'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // #2441: din egen rad sier at profilen din ikke er fullført. Leses fra din
    // egen profil, for kandidatlista har deg aldri.
    expect(
      within(screen.getByTestId('create-player-me')).queryByText(
        /ikke fullført profilen din/,
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('create-player-p2'));
    // Ada står som `ladies`, men Hvit har ingen dame-rating: klemmen setter
    // herre, og dame-chipen er avslått.
    expect(screen.getByTestId('create-tee-gender-p2-M').props.accessibilityState)
      .toMatchObject({ selected: true });
    expect(screen.getByTestId('create-tee-gender-p2-D').props.accessibilityState)
      .toMatchObject({ disabled: true });

    // Et avslått valg endrer ingenting.
    await fireEvent.press(screen.getByTestId('create-tee-gender-p2-D'));
    expect(screen.getByTestId('create-tee-gender-p2-M').props.accessibilityState)
      .toMatchObject({ selected: true });

    // Junior rates av Hvit, så det er et ekte valg.
    await fireEvent.press(screen.getByTestId('create-tee-gender-p2-J'));
    expect(screen.getByTestId('create-tee-gender-p2-J').props.accessibilityState)
      .toMatchObject({ selected: true, disabled: false });
    await fireEvent.press(screen.getByTestId('create-next'));

    // Bare avvikene står i oppsummeringen — arrangøren selv spiller fra herre
    // og skal ikke nevnes.
    expect(screen.getByTestId('create-summary-tees').props.children).toBe(
      'Ada Aas: junior',
    );

    // #2441: din egen profil er ikke fullført. Merknaden og «Rediger profil»
    // står, og publiseringen er åpen.
    expect(screen.getByTestId('create-warning-pending-self')).toBeTruthy();
    expect(screen.getByTestId('create-warning-profile')).toBeTruthy();
    expect(screen.getByTestId('create-publish').props.accessibilityState?.disabled).toBeFalsy();

    // Tilbake fra profilskjemaet: skjermen får fokus, henter profilen på nytt
    // (nå fullført), og merknaden er borte.
    await act(async () => {
      focusListener()();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('create-warning-pending-self')).toBeNull();
    });
    expect(screen.queryByTestId('create-warning-profile')).toBeNull();
  });
});

// #2749 PR B: oppsummeringen sier kontingenten og antallet premier som lagres.
describe('summaryLines — kontingent og premiebord', () => {
  const prizes = () => {
    const p = require('../../../../lib/games/prizes').emptyPrizeDraft();
    p.placement_1 = { description: 'Middag for to', sponsor: '', sponsorLogoPath: '' };
    p.ld_1 = { description: 'Ny hanske', sponsor: 'Byneset Sport', sponsorLogoPath: '' };
    p.ld_2 = { description: 'Baller', sponsor: '', sponsorLogoPath: '' };
    return p;
  };
  const base = {
    name: 'Torsdagsrunden',
    gameMode: 'stableford' as const,
    courseId: null,
    teeBoxId: null,
    teeOffAt: '2026-11-20T08:00:00.000Z',
    players: [{ userId: 'me', teeGender: 'M' as const, teamNumber: null }],
    sideTournamentEnabled: true,
    sideLdCount: 1 as const,
    sideCtpCount: 0 as const,
  };
  const lines = (over: object) =>
    summaryLines({ ...base, ...over }, 'stableford', [], [], new Date('2026-11-20T08:00:00.000Z'));

  it('har «Startkontingent 200 kr» og «Premiebord 2 premier» (ld_2 lagres ikke med ett LD-hull)', () => {
    const found = lines({ entryFeeKr: 200, paymentLink: '12345', prizes: prizes() });
    expect(found.find((l) => l.key === 'fee')).toMatchObject({ label: 'Startkontingent', value: '200 kr' });
    expect(found.find((l) => l.key === 'prizes')).toMatchObject({ label: 'Premiebord', value: '2 premier' });
  });

  it('uten kontingent og premier står ingen av linjene', () => {
    const found = lines({ entryFeeKr: 0 });
    expect(found.map((l) => l.key)).not.toContain('fee');
    expect(found.map((l) => l.key)).not.toContain('prizes');
  });

  // #2755: Nassau-oppsettet, `Nyttspill-2-nassau`: ett kort med scoring, netto valgt fra start.
  it('Nassau viser oppsettet med netto valgt, tar brutto, og har ikke noe kronefelt', async () => {
    (fetchFormatCatalog as jest.Mock).mockResolvedValueOnce([
      { slug: 'nassau', label: 'Nassau', iconKey: 'nassau', isPrimary: false, sortOrder: 60 },
    ]);
    publishGameMock.mockResolvedValueOnce({ ok: true, gameId: 'nassau-game' });
    await renderWizard();
    await fireEvent.press(await screen.findByTestId('create-format-nassau'));
    await fireEvent.press(screen.getByTestId('create-next'));

    expect(screen.getByText('Nassau-oppsett')).toBeTruthy();
    expect(screen.getByText('Scoring')).toBeTruthy();
    expect(screen.getByLabelText('Nassau-scoring')).toBeTruthy();
    expect(screen.getByTestId('create-nassau-net').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('create-nassau-gross').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.queryByTestId('create-kr-per-unit')).toBeNull();
    await fireEvent.press(screen.getByTestId('create-nassau-gross'));
    expect(screen.getByTestId('create-nassau-gross').props.accessibilityState).toMatchObject({ selected: true });

    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(await screen.findByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(await screen.findByTestId('create-player-p2'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-publish'));

    const [draft] = publishGameMock.mock.calls.at(-1)!;
    expect(draft.gameMode).toBe('nassau');
    expect(draft.setup).toMatchObject({ nassauScoring: 'gross' });
    publishGameMock.mockClear();
  });
});

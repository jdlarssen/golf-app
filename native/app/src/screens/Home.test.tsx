// #2254: startboden som skjerm (Type C).
//
// Hva hvert kort sier er dekket av komponent- og modelltestene. Her låses det
// bare skjermen kan svare på: rekkefølgen fra toppen, at den nyeste runden blir
// helt og resten havner under «Flere runder i gang», at «Opprett spill» flytter
// seg ned når en runde pågår, og at heltekortet tegnes fra enheten når nettet
// er borte.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { StyleSheet } from 'react-native';
import type { CardBundle } from '../data/homeHero';
import { fetchKavalkadeStatus } from '../data/kavalkade';
import type { HomeList } from '../data/homeList';
import type { OwnProfile } from '../data/profile';
import type { ScreenProps } from '../navigation';
import { holeScores, homeBundle, homeCard, homePlayer } from '../test/homeFixtures';
import { fireForeground } from '../test/syncTriggersMock';
import { Home } from './Home';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/homeList', () => ({
  ...jest.requireActual('../data/homeList'),
  loadHomeCards: jest.fn(async () => mockState.cached),
  refreshHomeCards: jest.fn(async () => {
    if (mockState.online) return mockState.list;
    throw new Error('offline');
  }),
}));
jest.mock('../data/homeHero', () => ({
  loadCardBundle: jest.fn(async (gameId: string) => mockState.bundles[gameId] ?? null),
  refreshCardBundle: jest.fn(async () => undefined),
  loadFinishedRound: jest.fn(async (gameId: string) => mockState.bundles[gameId] ?? null),
  refreshFinishedRound: jest.fn(async () => undefined),
  fetchCardExtras: jest.fn(async () => ({})),
}));
jest.mock('../data/profile', () => ({
  fetchOwnProfile: jest.fn(async () => {
    if (!mockState.online) throw new Error('offline');
    return mockState.profile;
  }),
}));
jest.mock('../data/syncTriggers', () => require('../test/syncTriggersMock'));
// #2758: reglene for kortet har egne tester. Her gjelder det hva Hjem sier om runden.
jest.mock('../components/PushPromptCard', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return {
    PushPromptCard: ({ roundInProgress }: { roundInProgress: boolean }) =>
      createElement(Text, { testID: 'push-prompt-stub' }, String(roundInProgress)),
  };
});
// #2265 PR 2: Kavalkade-banneret spør serveren; uten svar står det ikke.
jest.mock('../data/kavalkade', () => ({ fetchKavalkadeStatus: jest.fn(async () => null) }));
jest.mock('../data/inbox', () => ({ fetchInboxUnreadCount: jest.fn(async () => mockState.unread) }));
// #2638: «Ligaene dine» spør `GET /api/liga`; uten ligaer står ingen seksjon.
jest.mock('../data/league', () => ({
  fetchMyLeagues: jest.fn(async () => mockState.leagues),
}));
jest.mock('../data/cup', () => ({
  fetchMyCups: jest.fn(async () => mockState.cups),
}));
// #2753 D4: klubbturneringene kommer fra terminlista.
jest.mock('../data/terminliste', () => ({
  fetchTerminliste: jest.fn(async () => mockState.termin),
}));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'me', email: 'meg@example.test' }),
}));
// Hjem har ingen navigasjonslinje (#2385) og leser innfellingen selv. Uten
// navigatorens SafeAreaProvider gir pakkens egen mock innfelling 0.
jest.mock('react-native-safe-area-context', () => ({
  ...require('react-native-safe-area-context/jest/mock').default,
  useSafeAreaInsets: () => mockInsets,
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

// Navnet må starte med `mock`: jest.mock-factoryene heises over importene.
let mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const mockState: {
  unread: number | null;
  online: boolean;
  list: HomeList;
  cached: HomeList | undefined;
  bundles: Record<string, CardBundle>;
  profile: OwnProfile;
  leagues: Awaited<ReturnType<typeof import('../data/league').fetchMyLeagues>>;
  cups: Awaited<ReturnType<typeof import('../data/cup').fetchMyCups>>;
  termin: Awaited<ReturnType<typeof import('../data/terminliste').fetchTerminliste>>;
} = {
  unread: 0,
  online: true,
  list: { version: 4, cards: [], lastRound: null, fetchedAt: '' },
  cached: undefined,
  bundles: {},
  leagues: { ok: true, joinable: [], leagues: [] },
  cups: { ok: true, cups: [] },
  termin: { ok: true, view: { entries: [], pendingRequests: [] } },
  profile: {
    name: 'Sigrid Berg',
    nickname: null,
    hcpIndex: 12.4,
    handicapUpdatedAt: new Date().toISOString(),
    gender: 'ladies',
    level: null,
    isAdmin: false,
    profileCompletedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const CARDS = [
  homeCard({ gameId: 'old', name: 'Gammel runde', createdAt: '2026-09-01T08:00:00.000Z' }),
  homeCard({ gameId: 'new', name: 'Torsdagsrunden', scheduledTeeOffAt: inDays(0) }),
  homeCard({
    gameId: 'next',
    name: 'Klubbmesterskap',
    status: 'scheduled',
    scheduledTeeOffAt: inDays(3),
    flightNumber: 2,
  }),
  homeCard({ gameId: 'later', name: 'Sesongavslutning', status: 'scheduled', scheduledTeeOffAt: inDays(20) }),
  homeCard({
    gameId: 'last',
    name: 'Høstpokalen',
    status: 'finished',
    endedAt: '2026-09-27T15:00:00.000Z',
    resultSummary: { kind: 'placement', rank: 2, fieldSize: 8, isTeam: false },
  }),
  homeCard({
    gameId: 'older',
    name: 'Vårcupen',
    status: 'finished',
    endedAt: '2026-05-01T15:00:00.000Z',
    resultSummary: { kind: 'placement', rank: 5, fieldSize: 8, isTeam: false },
  }),
];

const LIST: HomeList = {
  version: 4,
  cards: CARDS,
  lastRound: { gameId: 'last', brutto: 88, netto: 76, teamBall: false },
  fetchedAt: '2026-09-29T09:00:00.000Z',
};

const HERO_BUNDLE: CardBundle = {
  bundle: homeBundle({
    game: { id: 'new' },
    players: [homePlayer({ userId: 'me' }), homePlayer({ userId: 'leader' })],
  }),
  scores: [...holeScores('new', 'me', 7, 4), ...holeScores('new', 'leader', 7, 3)],
};

/** Det lille av `screen.toJSON()` rekkefølge-sjekken leser. */
type JsonNode = { props: { testID?: unknown }; children: (JsonNode | string)[] | null };

/** TestID-ene i dokumentrekkefølge — rekkefølgen fra toppen av skjermen. */
function testIdsInOrder(): string[] {
  const ids: string[] = [];
  const walk = (node: JsonNode | JsonNode[] | string | null) => {
    if (node === null || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node.props.testID === 'string') ids.push(node.props.testID);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON() as unknown as JsonNode | JsonNode[] | null);
  return ids;
}

function renderHome(params?: { deletedCup?: string }) {
  const navigate = jest.fn();
  const listeners: Record<string, () => void> = {};
  const setParams = jest.fn();
  const addListener = (event: string, listener: () => void) => {
    listeners[event] = listener;
    return () => {};
  };
  // `getState` for `openOrReturn` (#2753): tom stakk, så den åpner som `navigate`.
  const navigation = { navigate, addListener, setParams, getState: () => undefined };
  const props = (next?: { deletedCup?: string }) =>
    ({ navigation, route: { key: 'home', name: 'Home', params: next } }) as unknown as ScreenProps<'Home'>;
  return { navigate, listeners, setParams, props, view: render(<Home {...props(params)} />) };
}

beforeEach(() => {
  mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  (fetchKavalkadeStatus as jest.Mock).mockResolvedValue(null);
  mockState.online = true;
  mockState.list = LIST;
  mockState.cached = undefined;
  mockState.bundles = { new: HERO_BUNDLE };
  mockState.leagues = { ok: true, joinable: [], leagues: [] };
  mockState.cups = { ok: true, cups: [] };
  mockState.termin = { ok: true, view: { entries: [], pendingRequests: [] } };
  mockState.unread = 0;
});

it('stiller opp dato, pille, helt, flere runder, billett, mine spill og forrige runde i den rekkefølgen', async () => {
  const { navigate, view } = renderHome();
  await view;

  // Heltekortet er den nyeste runden, og ringen står på hull 8.
  expect(await screen.findByTestId('home-hero-card-new')).toBeTruthy();
  expect(await screen.findByText('Fortsett på hull 8')).toBeTruthy();
  // Tittelen er datoen, og fornavnet står i pillen.
  expect(await screen.findByTestId('home-date')).toHaveTextContent(
    /^(Mandag|Tirsdag|Onsdag|Torsdag|Fredag|Lørdag|Søndag) \d{1,2}\. [a-zæøå]+$/,
  );

  const order = testIdsInOrder();
  const at = (id: string) => {
    const index = order.indexOf(id);
    expect({ id, found: index >= 0 }).toEqual({ id, found: true });
    return index;
  };
  const sequence = [
    'home-date',
    'open-profile',
    'home-hero',
    'home-active',
    'home-next-start',
    'home-scheduled',
    'home-last-round',
    'home-create-game',
  ].map(at);
  expect(sequence).toEqual([...sequence].sort((a, b) => a - b));

  // Den eldre runden i gang ligger under «Flere runder i gang»; bare billetten
  // er «Neste start», og resten står under «Mine spill».
  expect(screen.getByText('Flere runder i gang')).toBeTruthy();
  expect(screen.getByTestId('game-card-old')).toBeTruthy();
  expect(screen.getByTestId('home-ticket-next')).toBeTruthy();
  expect(screen.getByTestId('game-card-later')).toBeTruthy();
  expect(screen.queryByTestId('game-card-next')).toBeNull();

  // Forrige runde er den som ble avsluttet sist; alle rundene står i
  // Rundedagboka (#2265), ikke foldet ut her.
  expect(screen.getByTestId('home-last-round-line-last')).toHaveTextContent(
    '2. plass av 8 · 88 brutto',
  );
  expect(screen.queryByTestId('home-last-round-older')).toBeNull();
  await fireEvent.press(screen.getByText('Alle runder'));
  expect(navigate).toHaveBeenCalledWith('RoundDiary', { from: 'home' });
  expect(screen.queryByTestId('home-last-round-older')).toBeNull();

  await fireEvent.press(screen.getByText('Fortsett på hull 8'));
  // #2228: toppen sendes med, så den står også om hullsiden kaster.
  expect(navigate).toHaveBeenCalledWith('Hole', {
    gameId: 'new',
    holeNumber: 8,
    gameName: 'Torsdagsrunden',
    topLine: 'Stableford · Losby',
  });

  // Veien til profil-rommet er HCP-pillen (Hjem v2, #2385), og ordet «Profil»
  // står ikke på skjermen.
  const pill = screen.getByTestId('open-profile');
  expect(pill.props.accessibilityRole).toBe('link');
  expect(pill.props.accessibilityLabel).toBe('Profil, handicap 12,4');
  expect(pill).toHaveTextContent('Sigrid·HCP12,4');
  expect(screen.queryByText('Profil')).toBeNull();
  await fireEvent.press(pill);
  expect(navigate).toHaveBeenCalledWith('Profile');

  // #2228: appen kom i forgrunnen. Lista hentes på nytt, ikke bare ved fokus.
  const { refreshHomeCards } = require('../data/homeList') as { refreshHomeCards: jest.Mock };
  const fetches = refreshHomeCards.mock.calls.length;
  await act(async () => {
    fireForeground();
  });
  expect(refreshHomeCards).toHaveBeenCalledTimes(fetches + 1);
});

it('tegner heltekortet fra enheten når nettet er borte', async () => {
  mockState.online = false;
  mockState.cached = LIST;

  const { view } = renderHome();
  await view;

  expect(await screen.findByText('Fortsett på hull 8')).toBeTruthy();
  expect(screen.getByLabelText('Hull 8 av 18, 7 spilt')).toBeTruthy();
  expect(await screen.findByTestId('home-stale')).toBeTruthy();
  // Uten profil står datoen alene, og uten pille er «Profil» veien videre.
  expect(screen.getByTestId('home-date')).toBeTruthy();
  expect(screen.getByTestId('open-profile')).toHaveTextContent('Profil');
});

it('uten handicap viser pillen bare fornavnet, og den åpner fortsatt profilen', async () => {
  const withHcp = mockState.profile;
  mockState.profile = { ...withHcp, hcpIndex: null };
  try {
    const { navigate, view } = renderHome();
    await view;

    const pill = await screen.findByTestId('open-profile');
    await waitFor(() => expect(pill).toHaveTextContent('Sigrid'));
    expect(pill).not.toHaveTextContent('HCP');
    expect(pill.props.accessibilityLabel).toBe('Profil for Sigrid');
    await fireEvent.press(pill);
    expect(navigate).toHaveBeenCalledWith('Profile');
  } finally {
    mockState.profile = withHcp;
  }
});

it('uten runde i gang står «Opprett spill» øverst, som før, også på et tomt Hjem', async () => {
  mockState.list = { ...LIST, cards: CARDS.filter((card) => card.status !== 'active') };
  const { view } = renderHome();
  await view;

  expect(await screen.findByTestId('home-ticket-next')).toBeTruthy();
  expect(screen.queryByTestId('home-hero')).toBeNull();
  const order = testIdsInOrder();
  expect(order.indexOf('home-create-game')).toBeLessThan(order.indexOf('home-next-start'));

  mockState.list = { ...LIST, cards: [], lastRound: null };
  await screen.unmount();
  const empty = renderHome();
  await empty.view;
  expect(await screen.findByTestId('home-empty')).toBeTruthy();
  expect(screen.getByTestId('home-create-game')).toBeTruthy();
  // #2753: cupen lages fra typevalget i «Opprett spill». Hjem har én dør.
  expect(screen.queryByTestId('home-create-cup')).toBeNull();
});

it('#2838: «Finn turneringer» står rett under «Opprett spill», alltid, og åpner terminlista', async () => {
  // Uten runde i gang: «Opprett spill» øverst og raden rett under.
  mockState.list = { ...LIST, cards: CARDS.filter((card) => card.status !== 'active') };
  const top = renderHome();
  await top.view;
  expect(await screen.findByTestId('home-ticket-next')).toBeTruthy();
  let order = testIdsInOrder();
  expect(order.indexOf('home-find-tournaments')).toBe(order.indexOf('home-create-game') + 1);
  expect(order.indexOf('home-find-tournaments')).toBeLessThan(order.indexOf('home-next-start'));
  const row = screen.getByTestId('home-find-tournaments');
  expect(row.props.accessibilityLabel).toBe('Finn turneringer. Åpne runder du kan bli med på');
  await fireEvent.press(row);
  expect(top.navigate).toHaveBeenCalledWith('Terminliste');

  // Med runde i gang står «Opprett spill» nederst, og raden følger den.
  await screen.unmount();
  mockState.list = LIST;
  const hero = renderHome();
  await hero.view;
  expect(await screen.findByTestId('home-hero')).toBeTruthy();
  order = testIdsInOrder();
  expect(order.indexOf('home-find-tournaments')).toBe(order.indexOf('home-create-game') + 1);

  // Et tomt Hjem har den også: veien til å finne en runde er størst der.
  await screen.unmount();
  mockState.list = { ...LIST, cards: [], lastRound: null };
  const empty = renderHome();
  await empty.view;
  expect(await screen.findByTestId('home-empty')).toBeTruthy();
  expect(screen.getByTestId('home-find-tournaments')).toBeTruthy();
});

it('bruker aldri en bundel som hører til et annet spill enn helten', async () => {
  // Cachen ga bundelen for en annen runde (id-en stemmer ikke med helten).
  mockState.bundles = { new: { ...HERO_BUNDLE, bundle: { ...HERO_BUNDLE.bundle, game: { ...HERO_BUNDLE.bundle.game, id: 'old' } } } };
  const { view } = renderHome();
  await view;

  expect(await screen.findByTestId('home-hero-card-new')).toBeTruthy();
  expect(await screen.findByText('Åpne runden')).toBeTruthy();
  expect(screen.queryByTestId('home-hero-ring')).toBeNull();
});

it('forrige runde viser poengene dine i stableford, regnet på enheten (Hjem v2)', async () => {
  const { refreshFinishedRound } = require('../data/homeHero') as {
    refreshFinishedRound: jest.Mock;
  };
  mockState.bundles = {
    new: HERO_BUNDLE,
    last: {
      bundle: homeBundle({
        game: { id: 'last', status: 'finished' },
        players: [homePlayer({ userId: 'me' }), homePlayer({ userId: 'marte' })],
      }),
      scores: [...holeScores('last', 'me', 18, 4), ...holeScores('last', 'marte', 18, 3)],
    },
  };
  const { view } = renderHome();
  await view;

  expect(await screen.findByText('2. plass av 8 · 36 poeng')).toBeTruthy();
  expect(refreshFinishedRound).toHaveBeenCalledWith('last');
});

it('forrige runde i wolf regner med valgene fra serveren, som tavla', async () => {
  const { fetchCardExtras } = require('../data/homeHero') as { fetchCardExtras: jest.Mock };
  fetchCardExtras.mockResolvedValue({ wolfChoices: [] });
  const trio = ['me', 'ola', 'kari'].map((userId, i) => homePlayer({ userId, teamNumber: i + 1 }));
  mockState.list = {
    ...LIST,
    cards: LIST.cards.map((card) => (card.gameId === 'last' ? { ...card, gameMode: 'wolf' } : card)),
  };
  mockState.bundles = {
    new: HERO_BUNDLE,
    last: {
      bundle: homeBundle({
        game: {
          id: 'last',
          status: 'finished',
          gameMode: 'wolf',
          modeConfig: { kind: 'wolf', team_size: 1, teams_count: 3, wolf_scoring: 'gross' },
        },
        players: trio,
      }),
      scores: [
        ...holeScores('last', 'me', 18, 3),
        ...holeScores('last', 'ola', 18, 4),
        ...holeScores('last', 'kari', 18, 5),
      ],
    },
  };
  const { view } = renderHome();
  await view;

  expect(await screen.findByText(/^2\. plass av 8 · \d+ poeng$/)).toBeTruthy();
  expect(fetchCardExtras).toHaveBeenCalledWith('last', 'wolf');
});

it('forrige runde i slagspill henter ingenting ekstra og viser brutto', async () => {
  const homeHero = require('../data/homeHero') as {
    refreshFinishedRound: jest.Mock;
    fetchCardExtras: jest.Mock;
  };
  homeHero.refreshFinishedRound.mockClear();
  homeHero.fetchCardExtras.mockClear();
  mockState.list = {
    ...LIST,
    cards: LIST.cards.map((card) =>
      card.gameId === 'last' ? { ...card, gameMode: 'solo_strokeplay' } : card,
    ),
  };
  const { view } = renderHome();
  await view;

  expect(await screen.findByText('2. plass av 8 · 88 brutto')).toBeTruthy();
  expect(homeHero.refreshFinishedRound).not.toHaveBeenCalled();
  expect(homeHero.fetchCardExtras).not.toHaveBeenCalled();
});

describe('kortet om varsler (#2758)', () => {
  it('sier fra til kortet når en runde pågår', async () => {
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('push-prompt-stub')).toHaveTextContent('true');
  });

  it('sier fra til kortet når ingen runde pågår', async () => {
    mockState.list = { ...LIST, cards: CARDS.filter((card) => card.status !== 'active') };
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('push-prompt-stub')).toHaveTextContent('false');
  });
});

describe('Kavalkaden på Hjem (#2265 PR 2)', () => {
  it('viser teaseren under datolinja, uten lenke, i teaser-vinduet', async () => {
    (fetchKavalkadeStatus as jest.Mock).mockResolvedValue({ year: 2026, slot: 'teaser', canOpen: false, hasRound: true });
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('kavalkade-home-banner')).toHaveTextContent(
      'Kavalkaden kommer 24. desemberGolfåret ditt, kort for kort. Alt du spiller fram til julaften er med.',
    );
    expect(screen.queryByTestId('kavalkade-home-banner-cta')).toBeNull();
    const order = testIdsInOrder();
    expect(order.indexOf('kavalkade-home-banner')).toBeGreaterThan(order.indexOf('open-profile'));
    expect(order.indexOf('kavalkade-home-banner')).toBeLessThan(order.indexOf('home-hero'));
  });

  it('har en knapp inn i Kavalkaden i lenke-vinduet', async () => {
    (fetchKavalkadeStatus as jest.Mock).mockResolvedValue({ year: 2026, slot: 'link', canOpen: true, hasRound: true });
    const { navigate, view } = renderHome();
    await view;

    expect(await screen.findByText('Kavalkaden 2026 er åpen')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Åpne Kavalkaden' }));
    expect(navigate).toHaveBeenCalledWith('Kavalkade');
  });

  it('står ikke uten en ferdig runde i året, utenfor vinduet eller uten svar', async () => {
    for (const status of [
      { year: 2026, slot: 'link', canOpen: true, hasRound: false },
      { year: 2026, slot: null, canOpen: false, hasRound: true },
      null,
    ]) {
      (fetchKavalkadeStatus as jest.Mock).mockResolvedValue(status);
      const rendered = await renderHome().view;
      expect(await screen.findByTestId('home-hero-card-new')).toBeTruthy();
      expect(screen.queryByTestId('kavalkade-home-banner')).toBeNull();
      await rendered.unmount();
    }
  });
});

// #2560: innholdet skal ende over hjemindikatoren (iOS) og navigasjonslinja
// (Android), ikke inni dem. Bunnluften er de 20 pt skjermen alltid har, pluss
// systemlinjas høyde.
describe('bunnmargen', () => {
  // `ui.scroll` setter `padding: 20` og ikke `paddingBottom`, så bunnen er det som gjelder til slutt.
  const bottomPadding = (testID: string) => {
    const style = StyleSheet.flatten(screen.getByTestId(testID).props.contentContainerStyle);
    return style.paddingBottom ?? style.padding;
  };

  it('legger systemlinja til bunnluften på Hjem', async () => {
    mockInsets = { top: 0, right: 0, bottom: 34, left: 0 };
    await renderHome().view;
    await screen.findByTestId('home-create-game');
    expect(bottomPadding('home-screen')).toBe(54);
  });

  it('gjør det samme når spillene ikke lot seg hente', async () => {
    mockInsets = { top: 0, right: 0, bottom: 24, left: 0 };
    mockState.online = false;
    mockState.cached = undefined;
    await renderHome().view;
    await screen.findByTestId('home-error');
    expect(bottomPadding('home-screen')).toBe(44);
  });
});

// #1954 D3 (søsken-funn fra iOS-runden): Hjem har ingen header. Når lista
// ruller, gled «God dag» og HCP-merket under klokka og batteriet uten bakteppe.
// En fast stripe i bakgrunnsfargen, like høy som statuslinja, ligger over.
describe('toppen', () => {
  it('en fast stripe dekker statuslinja når Hjem ruller', async () => {
    mockInsets = { top: 47, right: 0, bottom: 34, left: 0 };
    await renderHome().view;
    await screen.findByTestId('home-create-game');
    const band = StyleSheet.flatten(screen.getByTestId('status-bar-band').props.style);
    expect(band).toMatchObject({ position: 'absolute', top: 0, height: 47 });
  });
});

describe('«Ligaene dine» (#2638, tegning 1)', () => {
  const closesAt = new Date(2026, 11, 10, 23, 59).toISOString();
  const VINTER = {
    id: 'liga-vinter',
    name: 'Vinterliga på Trackman',
    status: 'active' as const,
    seasonStart: '2026-11-02',
    openRound: { id: 'r3', label: 'Runde 3', closesAt },
    delivered: false,
    inProgress: false,
    markerCards: [],
  };
  const ONSDAG = {
    id: 'liga-onsdag',
    name: 'Onsdagsligaen',
    status: 'active' as const,
    seasonStart: '2026-11-02',
    openRound: { id: 'r5', label: 'Runde 5', closesAt },
    delivered: true,
    inProgress: false,
    markerCards: [],
  };

  it('står rett etter «Neste start», med runden, fristen og om du har spilt (1b)', async () => {
    mockState.leagues = { ok: true, joinable: [], leagues: [VINTER, ONSDAG] };
    const { navigate, view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-leagues')).toBeTruthy();
    expect(screen.getByText('Ligaene dine')).toBeTruthy();
    expect(screen.getByTestId('home-league-line-liga-vinter')).toHaveTextContent('Runde 3 · stenger tor. 23.59');
    expect(screen.getByTestId('home-league-played-liga-vinter')).toHaveTextContent('Ikke spilt');
    expect(screen.getByTestId('home-league-played-liga-onsdag')).toHaveTextContent('Har spilt');
    // Skjermleseren får pillen med i radens etikett.
    expect(screen.getByTestId('home-league-liga-vinter').props.accessibilityLabel).toBe(
      'Vinterliga på Trackman. Runde 3 · stenger tor. 23.59. Ikke spilt',
    );

    const order = testIdsInOrder();
    const sequence = ['home-next-start', 'home-leagues', 'home-scheduled', 'home-last-round'].map((id) =>
      order.indexOf(id),
    );
    expect(sequence.every((index) => index >= 0)).toBe(true);
    expect(sequence).toEqual([...sequence].sort((a, b) => a - b));

    await fireEvent.press(screen.getByTestId('home-league-liga-vinter'));
    expect(navigate).toHaveBeenCalledWith('League', { leagueId: 'liga-vinter' });
  });

  it('cupene står under ligaene, med fremdriften og uten poeng (#2752)', async () => {
    mockState.leagues = { ok: true, joinable: [], leagues: [VINTER] };
    mockState.cups = {
      ok: true,
      cups: [
        { id: 'c1', name: 'Klubbmesterskapet', status: 'active', progress: { played: 3, total: 8 } },
        { id: 'c2', name: 'Vårcupen', status: 'draft', progress: null },
        { id: 'c3', name: 'Høstcupen', status: 'active', progress: null },
      ],
    };
    const { navigate, view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-cups')).toBeTruthy();
    expect(screen.getByText('Cupene dine')).toBeTruthy();
    expect(screen.getByTestId('home-cup-line-c1')).toHaveTextContent('3 av 8 matcher spilt');
    expect(screen.getByTestId('home-cup-line-c2')).toHaveTextContent('Ikke startet ennå');
    expect(screen.getByTestId('home-cup-line-c3')).toHaveTextContent('Fikk ikke lest kampene');
    expect(screen.getByTestId('home-cup-c1').props.accessibilityLabel).toBe(
      'Klubbmesterskapet. 3 av 8 matcher spilt',
    );
    const order = testIdsInOrder();
    expect(order.indexOf('home-leagues')).toBeLessThan(order.indexOf('home-cups'));

    await fireEvent.press(screen.getByTestId('home-cup-c1'));
    expect(navigate).toHaveBeenCalledWith('Cup', { cupId: 'c1' });
  });

  it('klubbturneringene står under cupene, med klubben, og åpner påmeldingen (#2753)', async () => {
    const termin = (id: string, over: Record<string, unknown>) => ({
      id,
      name: `Runde ${id}`,
      short_id: `short-${id}`,
      scheduled_tee_off_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      course_name: 'Byneset North',
      game_mode: 'stableford',
      mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
      hole_segment: 'full',
      start_type: 'first_tee',
      source: 'club',
      cta: 'direct',
      capacity: null,
      full: false,
      modeLabel: 'Stableford',
      teamSize: 1,
      socialProof: null,
      clubName: 'Byneset GK',
      ...over,
    });
    mockState.cups = { ok: true, cups: [{ id: 'c1', name: 'Vårcupen', status: 'draft', progress: null }] };
    mockState.termin = {
      ok: true,
      view: {
        entries: [termin('k1', {}), termin('f1', { source: 'friend', clubName: null })],
        pendingRequests: [],
      },
    } as typeof mockState.termin;
    const { navigate, view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-club-rounds')).toBeTruthy();
    expect(screen.getByText('Klubbturneringer')).toBeTruthy();
    expect(screen.getByTestId('terminliste-row-k1')).toBeTruthy();
    expect(screen.queryByTestId('terminliste-row-f1')).toBeNull();
    expect(screen.getByText('Byneset GK · Byneset North · Stableford')).toBeTruthy();
    // Datoen står i dagoverskriften, som i terminlista (evaluatorens funn på D4).
    expect(within(screen.getByTestId('home-club-rounds')).getByText('om 3 dager')).toBeTruthy();
    const order = testIdsInOrder();
    expect(order.indexOf('home-cups')).toBeLessThan(order.indexOf('home-club-rounds'));

    await fireEvent.press(screen.getByTestId('terminliste-row-k1'));
    expect(navigate).toHaveBeenCalledWith('RoundInvite', { shortId: 'short-k1', src: null });
  });

  // #2839: klubbligaer du kan melde deg på står i klubbseksjonen, ikke i «Ligaene dine».
  describe('klubbligaer du kan melde deg på (#2839)', () => {
    const KLUBBLIGA = {
      id: 'kl1',
      name: 'Klubbens vinterliga',
      status: 'draft' as const,
      seasonStart: '2026-11-02',
      openRound: null,
      delivered: false,
      inProgress: false,
      markerCards: [],
    };

    it('står som en rad i klubbseksjonen med linja, og et trykk åpner ligasiden', async () => {
      mockState.leagues = { ok: true, leagues: [], joinable: [KLUBBLIGA] };
      const { navigate, view } = renderHome();
      await view;

      const section = await screen.findByTestId('home-club-rounds');
      expect(screen.getByText('Klubbturneringer')).toBeTruthy();
      expect(within(section).getByTestId('home-joinable-league-line-kl1')).toHaveTextContent(
        'Ikke påmeldt · meld deg på før start',
      );
      expect(within(section).getByText('Klubbens vinterliga')).toBeTruthy();
      // Startdagen er gått, så den står i en egen blokk med overskrift som dagene.
      expect(within(screen.getByTestId('home-club-day-leagues')).getByText('Klubbligaer')).toBeTruthy();
      // Ikke i «Ligaene dine».
      expect(screen.queryByTestId('home-leagues')).toBeNull();
      await fireEvent.press(screen.getByTestId('home-joinable-league-kl1'));
      expect(navigate).toHaveBeenCalledWith('League', { leagueId: 'kl1' });
    });

    it('starter sesongen samme dag som en runde, står den i samme kort, etter runden', async () => {
      const day = new Date(Date.now() + 3 * 86_400_000);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      mockState.leagues = { ok: true, leagues: [], joinable: [{ ...KLUBBLIGA, seasonStart: key }] };
      mockState.termin = {
        ok: true,
        view: {
          entries: [
            {
              id: 'k1',
              name: 'Runde k1',
              short_id: 'short-k1',
              scheduled_tee_off_at: inDays(3),
              course_name: 'Byneset North',
              game_mode: 'stableford',
              mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
              hole_segment: 'full',
              start_type: 'first_tee',
              source: 'club',
              cta: 'direct',
              capacity: null,
              full: false,
              modeLabel: 'Stableford',
              teamSize: 1,
              socialProof: null,
              clubName: 'Byneset GK',
            },
          ],
          pendingRequests: [],
        },
      } as unknown as typeof mockState.termin;
      const { view } = renderHome();
      await view;
      await screen.findByTestId('home-club-rounds');
      const dayBlock = screen.getByTestId(`home-club-day-${key}`);
      expect(within(dayBlock).getByTestId('terminliste-row-k1')).toBeTruthy();
      expect(within(dayBlock).getByTestId('home-joinable-league-kl1')).toBeTruthy();
      // Blokken til venstre i klokkens sted, så navnet står på linje med rundenavnet.
      expect(within(screen.getByTestId('home-joinable-league-time-kl1')).getByText('Liga')).toBeTruthy();
      expect(within(screen.getByTestId('home-joinable-league-time-kl1')).getByText('sesongstart')).toBeTruthy();
      const order = testIdsInOrder();
      expect(order.indexOf('terminliste-row-k1')).toBeLessThan(order.indexOf('home-joinable-league-kl1'));
      // Ingen blokk for ligaer: den har en dag.
      expect(screen.queryByTestId('home-club-day-leagues')).toBeNull();
    });

    it('påmeldt: ligaen står i «Ligaene dine» og ikke lenger i klubbseksjonen, og leaguesFirst teller bare den', async () => {
      mockState.leagues = { ok: true, leagues: [KLUBBLIGA], joinable: [] };
      const { view } = renderHome();
      await view;
      expect(await screen.findByTestId('home-league-kl1')).toBeTruthy();
      expect(screen.queryByTestId('home-joinable-league-kl1')).toBeNull();
      expect(screen.queryByTestId('home-club-rounds')).toBeNull();
    });

    it('en ikke-påmeldt klubbliga skyver ikke tomtilstanden ned for den som ikke har noe annet', async () => {
      mockState.leagues = { ok: true, leagues: [], joinable: [KLUBBLIGA] };
      mockState.list = { ...LIST, cards: [], lastRound: null };
      const { view } = renderHome();
      await view;
      await screen.findByTestId('home-club-rounds');
      const order = testIdsInOrder();
      expect(order.indexOf('home-empty')).toBeGreaterThanOrEqual(0);
      expect(order.indexOf('home-empty')).toBeLessThan(order.indexOf('home-club-rounds'));
    });
  });

  it.each([
    ['ingen klubbrunder', { ok: true as const, view: { entries: [], pendingRequests: [] } }],
    ['kallet feiler', { ok: false as const, reason: 'load_failed' as const }],
  ])('ingen klubbseksjon når %s', async (_label, result) => {
    mockState.termin = result;
    const { view } = renderHome();
    await view;
    expect(await screen.findByTestId('home-hero-card-new')).toBeTruthy();
    expect(screen.queryByTestId('home-club-rounds')).toBeNull();
    expect(screen.queryByText('Klubbturneringer')).toBeNull();
  });

  it.each([
    ['du ikke er med i noen cup', { ok: true as const, cups: [] }],
    ['kallet feiler', { ok: false as const, reason: 'load_failed' as const }],
    ['nettet er borte', { ok: false as const, reason: 'offline' as const }],
  ])('ingen cup-seksjon og ingen feilboks når %s', async (_label, result) => {
    mockState.cups = result;
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-hero-card-new')).toBeTruthy();
    expect(screen.queryByTestId('home-cups')).toBeNull();
    expect(screen.queryByText('Cupene dine')).toBeNull();
    expect(screen.queryByTestId('home-error')).toBeNull();
  });

  it('en liga uten åpen runde har ingen pille (orkestratorens avgjørelse)', async () => {
    mockState.leagues = { ok: true, joinable: [], leagues: [{ ...VINTER, openRound: null }] };
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-league-line-liga-vinter')).toHaveTextContent('Ingen åpen runde nå');
    expect(screen.queryByTestId('home-league-played-liga-vinter')).toBeNull();
  });

  it.each([
    ['du ikke er med i noen liga (1c)', { ok: true as const, leagues: [], joinable: [] }],
    ['kallet feiler', { ok: false as const, reason: 'load_failed' as const }],
    ['nettet er borte', { ok: false as const, reason: 'offline' as const }],
  ])('ingen seksjon og ingen feilboks når %s', async (_label, result) => {
    mockState.leagues = result;
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-hero-card-new')).toBeTruthy();
    expect(screen.queryByTestId('home-leagues')).toBeNull();
    expect(screen.queryByText('Ligaene dine')).toBeNull();
    expect(screen.queryByTestId('home-error')).toBeNull();
  });

  // #2688: ligaspilleren uten runde i gang får ligaen først og ingen tomtilstand.
  it('uten runde i gang står ligaen øverst, over «Opprett spill», og tomtilstanden er borte', async () => {
    mockState.list = { ...LIST, cards: [], lastRound: null };
    mockState.leagues = { ok: true, joinable: [], leagues: [VINTER] };
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-leagues')).toBeTruthy();
    expect(screen.queryByTestId('home-empty')).toBeNull();
    const order = testIdsInOrder();
    expect(order.indexOf('home-leagues')).toBeLessThan(order.indexOf('home-create-game'));
  });

  it('uten liga står tomtilstanden som før', async () => {
    mockState.list = { ...LIST, cards: [], lastRound: null };
    mockState.leagues = { ok: true, joinable: [], leagues: [] };
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-empty')).toBeTruthy();
  });

  it('med en runde i gang står den først, som før, og ligaen kommer etter', async () => {
    mockState.leagues = { ok: true, joinable: [], leagues: [VINTER] };
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-hero-card-new')).toBeTruthy();
    const order = testIdsInOrder();
    expect(order.indexOf('home-hero-card-new')).toBeLessThan(order.indexOf('home-leagues'));
  });

  it('kort som venter på deg som markør står på Hjem, med vei rett til godkjenningen', async () => {
    const card = { gameId: 'g-mia', userId: 'mia', playerName: 'Mia', roundLabel: 'Runde 1' };
    mockState.list = { ...LIST, cards: [], lastRound: null };
    mockState.leagues = { ok: true, joinable: [], leagues: [{ ...VINTER, markerCards: [card] }] };
    const { navigate, view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-marker-queue')).toBeTruthy();
    expect(screen.getByText('Venter på deg som markør')).toBeTruthy();
    expect(screen.getByText('Runde 1 i Vinterliga på Trackman')).toBeTruthy();
    // «Ingen spill på deg ennå» sier ikke lenger noe galt.
    expect(screen.queryByTestId('home-empty')).toBeNull();

    await fireEvent.press(screen.getByTestId('marker-queue-g-mia-mia'));
    expect(navigate).toHaveBeenCalledWith('MarkerApprove', {
      leagueId: 'liga-vinter',
      gameId: 'g-mia',
      userId: 'mia',
    });
  });

  it('ingen markørseksjon uten ventende kort', async () => {
    mockState.leagues = { ok: true, joinable: [], leagues: [VINTER] };
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('home-leagues')).toBeTruthy();
    expect(screen.queryByTestId('home-marker-queue')).toBeNull();
  });
});

describe('kvitteringen etter en slettet cup (#2752)', () => {
  it('står med navnet når du kommer hit fra slettingen', async () => {
    await renderHome({ deletedCup: 'Klubbmesterskapet' }).view;
    expect(await screen.findByTestId('home-notice')).toHaveTextContent('Cupen «Klubbmesterskapet» er slettet.');
  });

  it('er borte når du går videre', async () => {
    const { listeners, setParams, view } = renderHome({ deletedCup: 'Klubbmesterskapet' });
    await view;
    await screen.findByTestId('home-notice');
    listeners.blur();
    expect(setParams).toHaveBeenCalledWith({ deletedCup: undefined });
  });

  it('ruller opp til kvitteringen, for Hjem står der du forlot den', async () => {
    const { props, view } = renderHome();
    const { rerender } = await view;
    await screen.findAllByTestId('home-screen');
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: () => void }, 'scrollTo');
    scrollTo.mockClear();
    await rerender(<Home {...props({ deletedCup: 'Klubbmesterskapet' })} />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });

    // Når du går videre, tømmes parameteren. Da skal ikke Hjem rulle en gang til.
    await rerender(<Home {...props()} />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('står ikke ellers', async () => {
    await renderHome().view;
    await screen.findAllByTestId('home-screen');
    expect(screen.queryByTestId('home-notice')).toBeNull();
  });
});

// #2759 AK14: konvolutten. Tallet kommer ferdig fra serveren, der nyheter ikke teller.
describe('konvolutten', () => {
  it('viser tallet, og skjermleseren får det i klartekst', async () => {
    mockState.unread = 3;
    const { view, navigate } = renderHome();
    await view;
    expect(await screen.findByTestId('inbox-unread-count')).toHaveTextContent('3');
    const button = screen.getByTestId('open-inbox');
    expect(button.props.accessibilityLabel).toBe('Innboks, 3 uleste');
    await fireEvent.press(button);
    expect(navigate).toHaveBeenCalledWith('Inbox');
  });

  it('ved 0 står konvolutten uten tall', async () => {
    const { view } = renderHome();
    await view;
    expect(screen.getByTestId('open-inbox').props.accessibilityLabel).toBe('Innboks');
    expect(screen.queryByTestId('inbox-unread-count')).toBeNull();
  });

  it('faller når appen kommer tilbake, og et kall som feiler, lar det forrige stå', async () => {
    mockState.unread = 2;
    const { view } = renderHome();
    await view;
    expect(await screen.findByTestId('inbox-unread-count')).toHaveTextContent('2');

    mockState.unread = null;
    await act(async () => {
      fireForeground();
    });
    expect(screen.getByTestId('inbox-unread-count')).toHaveTextContent('2');

    mockState.unread = 1;
    await act(async () => {
      fireForeground();
    });
    await waitFor(() => expect(screen.getByTestId('inbox-unread-count')).toHaveTextContent('1'));
  });
});

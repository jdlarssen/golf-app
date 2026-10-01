// #2254: startboden som skjerm (Type C).
//
// Hva hvert kort sier er dekket av komponent- og modelltestene. Her låses det
// bare skjermen kan svare på: rekkefølgen fra toppen, at den nyeste runden blir
// helt og resten havner under «Flere runder i gang», at «Opprett spill» flytter
// seg ned når en runde pågår, og at heltekortet tegnes fra enheten når nettet
// er borte.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CardBundle } from '../data/homeHero';
import { fetchKavalkadeStatus } from '../data/kavalkade';
import type { HomeList } from '../data/homeList';
import type { OwnProfile } from '../data/profile';
import type { ScreenProps } from '../navigation';
import { holeScores, homeBundle, homeCard, homePlayer } from '../test/homeFixtures';
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
jest.mock('../data/syncTriggers', () => ({ startSyncTriggers: jest.fn(() => () => undefined) }));
// #2265 PR 2: Kavalkade-banneret spør serveren; uten svar står det ikke.
jest.mock('../data/kavalkade', () => ({ fetchKavalkadeStatus: jest.fn(async () => null) }));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'me', email: 'meg@example.test' }),
}));
// Hjem har ingen navigasjonslinje (#2385) og leser innfellingen selv. Uten
// navigatorens SafeAreaProvider gir pakkens egen mock innfelling 0.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

// Navnet må starte med `mock`: jest.mock-factoryene heises over importene.
const mockState: {
  online: boolean;
  list: HomeList;
  cached: HomeList | undefined;
  bundles: Record<string, CardBundle>;
  profile: OwnProfile;
} = {
  online: true,
  list: { version: 2, cards: [], lastRound: null, fetchedAt: '' },
  cached: undefined,
  bundles: {},
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
  version: 2,
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

function renderHome() {
  const navigate = jest.fn();
  const props = { navigation: { navigate }, route: { key: 'home', name: 'Home' } };
  return { navigate, view: render(<Home {...(props as unknown as ScreenProps<'Home'>)} />) };
}

beforeEach(() => {
  (fetchKavalkadeStatus as jest.Mock).mockResolvedValue(null);
  mockState.online = true;
  mockState.list = LIST;
  mockState.cached = undefined;
  mockState.bundles = { new: HERO_BUNDLE };
});

it('stiller opp dato, hilsen, helt, flere runder, billett, mine spill og forrige runde i den rekkefølgen', async () => {
  const { navigate, view } = renderHome();
  await view;

  // Heltekortet er den nyeste runden, og ringen står på hull 8.
  expect(await screen.findByTestId('home-hero-card-new')).toBeTruthy();
  expect(await screen.findByText('Fortsett på hull 8 →')).toBeTruthy();
  expect(await screen.findByTestId('home-greeting')).toHaveTextContent(
    /^God (morgen|dag|kveld), Sigrid$/,
  );

  const order = testIdsInOrder();
  const at = (id: string) => {
    const index = order.indexOf(id);
    expect({ id, found: index >= 0 }).toEqual({ id, found: true });
    return index;
  };
  const sequence = [
    'home-date',
    'home-greeting',
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
  await fireEvent.press(screen.getByText('Alle runder →'));
  expect(navigate).toHaveBeenCalledWith('RoundDiary', { from: 'home' });
  expect(screen.queryByTestId('home-last-round-older')).toBeNull();

  await fireEvent.press(screen.getByText('Fortsett på hull 8 →'));
  expect(navigate).toHaveBeenCalledWith('Hole', { gameId: 'new', holeNumber: 8 });

  // Veien til profil-rommet er HCP-pillen (Hjem v2, #2385), og ordet «Profil»
  // står ikke på skjermen.
  const pill = screen.getByTestId('open-profile');
  expect(pill.props.accessibilityRole).toBe('link');
  expect(pill.props.accessibilityLabel).toBe('Profil, handicap 12,4');
  expect(pill).toHaveTextContent('HCP12,4');
  expect(screen.queryByText('Profil')).toBeNull();
  await fireEvent.press(pill);
  expect(navigate).toHaveBeenCalledWith('Profile');
});

it('tegner heltekortet fra enheten når nettet er borte', async () => {
  mockState.online = false;
  mockState.cached = LIST;

  const { view } = renderHome();
  await view;

  expect(await screen.findByText('Fortsett på hull 8 →')).toBeTruthy();
  expect(screen.getByLabelText('Hull 8 av 18, 7 spilt')).toBeTruthy();
  expect(await screen.findByTestId('home-stale')).toBeTruthy();
  // Uten profil står datoen alene, og uten pille er «Profil» veien videre.
  expect(screen.getByTestId('home-date')).toBeTruthy();
  expect(screen.queryByTestId('home-greeting')).toBeNull();
  expect(screen.getByTestId('open-profile')).toHaveTextContent('Profil');
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
});

it('bruker aldri en bundel som hører til et annet spill enn helten', async () => {
  // Cachen ga bundelen for en annen runde (id-en stemmer ikke med helten).
  mockState.bundles = { new: { ...HERO_BUNDLE, bundle: { ...HERO_BUNDLE.bundle, game: { ...HERO_BUNDLE.bundle.game, id: 'old' } } } };
  const { view } = renderHome();
  await view;

  expect(await screen.findByTestId('home-hero-card-new')).toBeTruthy();
  expect(await screen.findByText('Åpne runden →')).toBeTruthy();
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

describe('Kavalkaden på Hjem (#2265 PR 2)', () => {
  it('viser teaseren under datolinja, uten lenke, i teaser-vinduet', async () => {
    (fetchKavalkadeStatus as jest.Mock).mockResolvedValue({ year: 2026, slot: 'teaser', canOpen: false, hasRound: true });
    const { view } = renderHome();
    await view;

    expect(await screen.findByTestId('kavalkade-home-banner')).toHaveTextContent(
      '🎄Kavalkaden kommer 24. desemberGolfåret ditt, kort for kort. Alt du spiller fram til julaften er med.',
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

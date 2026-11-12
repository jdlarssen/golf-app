// #2838: terminlista som skjerm (Type C).
//
// Utvalget, knappen og setene har sine egne Type A-tester (`appTerminView`,
// ruta). Her låses det skjermen gjør med svaret: dagene i rekkefølge med
// etikettene, brikkene, radene med linjene sine, trykket som åpner påmeldingen,
// feilen med «Prøv igjen» og tomtilstandene. Klokka står fast torsdag
// 12. november 2026 kl. 12:00 (telefonens tid); lørdag 14. og søndag 15. er helga.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { AppTerminEntry, AppTerminView } from '../../../../lib/games/appTerminView';
import type { TerminlisteResult } from '../data/terminliste';
import { TERMIN_TEXT } from '../lib/terminlisteCopy';
import type { ScreenProps } from '../navigation';
import { Terminliste } from './Terminliste';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/terminliste', () => ({
  fetchTerminliste: jest.fn(async () => mockLoads.shift() ?? mockLoad),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

let mockFocus: () => void = () => {};
let mockLoads: TerminlisteResult[] = [];
let mockLoad: TerminlisteResult = { ok: false, reason: 'load_failed' };
const { fetchTerminliste } = jest.requireMock('../data/terminliste') as { fetchTerminliste: jest.Mock };

// Bare Date er falsk: løftene og skjermens egne tidtakere går som vanlig.
const REAL_TIMERS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'nextTick',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'performance',
] as const;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 12, 12, 0), doNotFake: [...REAL_TIMERS] });
  mockLoads = [];
  mockLoad = { ok: false, reason: 'load_failed' };
  fetchTerminliste.mockClear();
});
afterEach(() => jest.useRealTimers());

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();

function entry(over: Partial<AppTerminEntry> & Pick<AppTerminEntry, 'id'>): AppTerminEntry {
  return {
    name: `Runde ${over.id}`,
    short_id: `short-${over.id}`,
    scheduled_tee_off_at: at(14, 9, 20),
    course_name: 'Byneset North',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    hole_segment: 'full',
    start_type: 'first_tee',
    source: 'open',
    cta: 'direct',
    capacity: null,
    full: false,
    modeLabel: 'Stableford',
    teamSize: 1,
    socialProof: null,
    ...over,
  };
}

const ENTRIES: AppTerminEntry[] = [
  entry({ id: 'today', name: 'Etter jobb', scheduled_tee_off_at: at(12, 18) }),
  entry({ id: 'tomorrow', name: 'Fredagsrunden', scheduled_tee_off_at: at(13, 15), cta: 'request', source: 'friend' }),
  entry({ id: 'nine', name: 'Ni hull', scheduled_tee_off_at: at(14, 9, 20), hole_segment: 'front9' }),
  entry({
    id: 'shot',
    name: 'Shotgun-lørdag',
    scheduled_tee_off_at: at(14, 12, 40),
    start_type: 'shotgun',
    cta: 'request',
    capacity: { cap: 8, held: 6 },
  }),
  entry({
    id: 'club',
    name: 'Klubbmesterskapet',
    scheduled_tee_off_at: at(15, 10),
    source: 'club',
    modeLabel: 'Best ball',
    teamSize: 2,
    capacity: { cap: 8, held: 2 },
  }),
  entry({ id: 'full', name: 'Fullt hus', scheduled_tee_off_at: at(15, 13), capacity: { cap: 8, held: 8 }, full: true }),
  entry({ id: 'later', name: 'Neste lørdag', scheduled_tee_off_at: at(21, 9) }),
  entry({ id: 'undated', name: 'Uten tid', scheduled_tee_off_at: null, source: 'club' }),
];

const VIEW: AppTerminView = { entries: ENTRIES, pendingRequests: [] };

async function renderScreen(params?: { filter?: 'alle' | 'helg' | 'klubb' }) {
  const navigate = jest.fn();
  const navigation = { navigate } as unknown as ScreenProps<'Terminliste'>['navigation'];
  const route = { key: 'terminliste', name: 'Terminliste', params } as unknown as ScreenProps<'Terminliste'>['route'];
  await render(<Terminliste navigation={navigation} route={route} />);
  return { navigate };
}

async function loaded(view: AppTerminView = VIEW, params?: { filter?: 'alle' | 'helg' | 'klubb' }) {
  mockLoad = { ok: true, view };
  const rendered = await renderScreen(params);
  await screen.findByTestId('terminliste-screen');
  return rendered;
}

const rowIds = () =>
  screen
    .queryAllByTestId(/^terminliste-row-/)
    .map((node) => String(node.props.testID).replace('terminliste-row-', ''));
const dayIds = () =>
  screen.queryAllByTestId(/^terminliste-day-/).map((node) => String(node.props.testID).replace('terminliste-day-', ''));

it('viser tittelen og undertittelen fra nettsiden', async () => {
  await loaded();
  expect(screen.getByText(TERMIN_TEXT.pageTitle)).toBeTruthy();
  expect(screen.getByTestId('terminliste-subtitle').props.children).toBe('Åpne runder du kan bli med på');
});

it('deler rundene i dager i rekkefølge, «Dato ikke satt» sist, med i dag, i morgen og om N dager', async () => {
  await loaded();
  expect(dayIds()).toEqual(['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-21', 'undated']);
  expect(rowIds()).toEqual(['today', 'tomorrow', 'nine', 'shot', 'club', 'full', 'later', 'undated']);
  const heading = (key: string) => within(screen.getByTestId(`terminliste-day-${key}`)).getAllByRole('header')[0];
  expect(within(heading('2026-11-12')).getByText('Torsdag 12. november')).toBeTruthy();
  expect(within(heading('2026-11-12')).getByText('i dag')).toBeTruthy();
  expect(within(heading('2026-11-13')).getByText('i morgen')).toBeTruthy();
  expect(within(heading('2026-11-14')).getByText('Lørdag 14. november')).toBeTruthy();
  expect(within(heading('2026-11-14')).getByText('om 2 dager')).toBeTruthy();
  expect(within(heading('2026-11-21')).getByText('om 9 dager')).toBeTruthy();
  expect(within(heading('undated')).getByText('Dato ikke satt')).toBeTruthy();
});

it('en rad viser klokka, den lille linja, navnet, «Bane · Format · lag på N» og knappen', async () => {
  await loaded();
  const nine = screen.getByTestId('terminliste-row-nine');
  expect(within(nine).getByText('09:20')).toBeTruthy();
  expect(within(nine).getByText('9 hull')).toBeTruthy();
  expect(within(nine).getByText('Ni hull')).toBeTruthy();
  expect(within(nine).getByText('Byneset North · Stableford')).toBeTruthy();
  expect(within(nine).getByText('Meld på')).toBeTruthy();

  const shot = screen.getByTestId('terminliste-row-shot');
  expect(within(shot).getByText('shotgun')).toBeTruthy();
  expect(within(shot).getByText('Be om plass')).toBeTruthy();
  expect(within(shot).getByText('2 plasser igjen')).toBeTruthy();

  const club = screen.getByTestId('terminliste-row-club');
  expect(within(club).getByText('første start')).toBeTruthy();
  expect(within(club).getByText('Byneset North · Best ball · lag på 2')).toBeTruthy();
  expect(within(club).getByText('6 av 8 plasser ledige')).toBeTruthy();

  const undated = screen.getByTestId('terminliste-row-undated');
  expect(within(undated).getByText('–')).toBeTruthy();
  expect(within(undated).queryByText('første start')).toBeNull();
});

it('en full runde sier «Fullt» og har ingen knapp, men raden åpner fortsatt runden', async () => {
  const { navigate } = await loaded();
  const full = screen.getByTestId('terminliste-row-full');
  expect(within(full).getByText('Fullt')).toBeTruthy();
  expect(screen.queryByTestId('terminliste-cta-full')).toBeNull();
  await fireEvent.press(full);
  expect(navigate).toHaveBeenCalledWith('RoundInvite', { shortId: 'short-full', src: null });
});

it('et trykk på raden åpner påmeldingen med rundens short_id, uten src', async () => {
  const { navigate } = await loaded();
  await fireEvent.press(screen.getByTestId('terminliste-row-nine'));
  expect(navigate).toHaveBeenCalledWith('RoundInvite', { shortId: 'short-nine', src: null });
});

it('skjermleseren leser «Meld meg på …» og «Be om å bli med i …»', async () => {
  await loaded();
  expect(screen.getByTestId('terminliste-row-nine').props.accessibilityLabel).toBe('Meld meg på Ni hull');
  expect(screen.getByTestId('terminliste-row-shot').props.accessibilityLabel).toBe('Be om å bli med i Shotgun-lørdag');
  expect(screen.getByTestId('terminliste-row-full').props.accessibilityLabel).toBe('Fullt hus. Fullt');
});

it('«Denne helga» viser bare lørdag og søndag; «Alle» henter ikke på nytt', async () => {
  await loaded();
  await fireEvent.press(screen.getByTestId('terminliste-chip-helg'));
  expect(rowIds()).toEqual(['nine', 'shot', 'club', 'full']);
  expect(screen.getByTestId('terminliste-chip-helg').props.accessibilityState).toEqual({ selected: true });
  await fireEvent.press(screen.getByTestId('terminliste-chip-alle'));
  expect(rowIds()).toHaveLength(ENTRIES.length);
  expect(fetchTerminliste).toHaveBeenCalledTimes(1);
});

it('«Klubben min» viser klubbrundene, også uten dato', async () => {
  await loaded();
  await fireEvent.press(screen.getByTestId('terminliste-chip-klubb'));
  expect(rowIds()).toEqual(['club', 'undated']);
});

it('startet med filter «klubb» står «Klubben min» valgt og lista er filtrert', async () => {
  await loaded(VIEW, { filter: 'klubb' });
  expect(screen.getByTestId('terminliste-chip-klubb').props.accessibilityState).toEqual({ selected: true });
  expect(screen.getByTestId('terminliste-chip-alle').props.accessibilityState).toEqual({ selected: false });
  expect(rowIds()).toEqual(['club', 'undated']);
});

it('et tomt filter sier det, og «Vis alle» tar deg tilbake', async () => {
  await loaded({ entries: [ENTRIES[0]], pendingRequests: [] });
  await fireEvent.press(screen.getByTestId('terminliste-chip-klubb'));
  expect(screen.getByText('Ingen kommende runder i klubben din.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('terminliste-chip-helg'));
  expect(screen.getByText('Ingen runder denne helga.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('terminliste-show-all'));
  expect(rowIds()).toEqual(['today']);
  expect(screen.queryByTestId('terminliste-filter-empty')).toBeNull();
});

it('«Mine forespørsler» står først og åpner påmeldingen som viser at den venter', async () => {
  const { navigate } = await loaded({
    entries: ENTRIES,
    pendingRequests: [
      { id: 'r1', game_id: 'g1', short_id: 'pend-1', game_name: 'Torsdagsrunden', team_name: null, is_team_captain: false, created_at: '' },
      { id: 'r2', game_id: 'g2', short_id: 'pend-2', game_name: 'Lagrunden', team_name: 'Bogey Boys', is_team_captain: true, created_at: '' },
    ],
  });
  const requests = screen.getByTestId('terminliste-requests');
  expect(within(requests).getByText('Mine forespørsler')).toBeTruthy();
  expect(within(requests).getByText('Venter på godkjenning')).toBeTruthy();
  expect(within(requests).getByText('Lag «Bogey Boys» (kaptein) — venter på godkjenning')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('terminliste-request-r1'));
  expect(navigate).toHaveBeenCalledWith('RoundInvite', { shortId: 'pend-1', src: null });
});

it('vennelinja står på raden: navn med forbokstaver, ellers antallet', async () => {
  await loaded({
    entries: [
      entry({
        id: 'friends',
        socialProof: { joinedCount: 3, knownFriendNames: ['Kari N.', 'Per Å.'], knownFriendOverflow: 0 },
      }),
      entry({ id: 'count', scheduled_tee_off_at: at(14, 11), socialProof: { joinedCount: 4, knownFriendNames: [], knownFriendOverflow: 0 } }),
      entry({ id: 'nobody', scheduled_tee_off_at: at(14, 12) }),
    ],
    pendingRequests: [],
  });
  const friends = screen.getByTestId('terminliste-proof-friends');
  expect(within(friends).getByText('Kari og Per er med')).toBeTruthy();
  // Forbokstavene er dekor for skjermleseren (navnene står i teksten ved siden av).
  expect(within(friends).getByText('KN', { includeHiddenElements: true })).toBeTruthy();
  expect(within(friends).queryByText('KN')).toBeNull();
  expect(within(screen.getByTestId('terminliste-proof-count')).getByText('4 har blitt med')).toBeTruthy();
  expect(screen.queryByTestId('terminliste-proof-nobody')).toBeNull();
});

it('«Lag din egen runde» åpner opprettelsen', async () => {
  const { navigate } = await loaded();
  await fireEvent.press(screen.getByTestId('terminliste-create-own'));
  expect(navigate).toHaveBeenCalledWith('CreateGame');
});

it('uten runder og forespørsler står tomtilstanden med veien til å lage en egen', async () => {
  const { navigate } = await loaded({ entries: [], pendingRequests: [] });
  expect(screen.getByText(TERMIN_TEXT.emptyBody)).toBeTruthy();
  expect(screen.queryByTestId('terminliste-chips')).toBeNull();
  await fireEvent.press(screen.getByTestId('terminliste-empty-create'));
  expect(navigate).toHaveBeenCalledWith('CreateGame');
});

it('uten nett står feilen, og «Prøv igjen» med nett viser lista', async () => {
  mockLoads = [{ ok: false, reason: 'offline' }, { ok: true, view: VIEW }];
  await renderScreen();
  expect((await screen.findByTestId('terminliste-load-error')).props.children).toBe(
    'Fikk ikke tak i rundene. Sjekk nettet og prøv igjen.',
  );
  expect(screen.queryByTestId('terminliste-screen')).toBeNull();
  await act(async () => {
    await fireEvent.press(screen.getByTestId('terminliste-retry'));
  });
  expect(await screen.findByTestId('terminliste-screen')).toBeTruthy();
  expect(rowIds()).toHaveLength(ENTRIES.length);
});

it('ved fokus hentes lista på nytt, og den gamle står til svaret er her', async () => {
  await loaded();
  const next: AppTerminView = { entries: [ENTRIES[2]], pendingRequests: [] };
  mockLoad = { ok: true, view: next };
  await act(async () => {
    mockFocus();
  });
  expect(rowIds()).toEqual(['nine']);
  expect(fetchTerminliste).toHaveBeenCalledTimes(2);
});

// #2752: «Fordel & generer» (Type C). Reglene er serverens og regnestykket er delt med
// nettet (`lib/cup/matchPlan.test.ts`). Her låses hva skjermen sender, at den holder til
// samme fasit som nettets veiviser, tilbake-veien, og at et svar aldri lager kampene to
// ganger.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AppCupGenerateView } from '../../../../lib/cup/appCupGenerateView';
import {
  PARITY_PLAYERS,
  PARITY_PRESET_IDS,
  PARITY_TEAM_1,
  PARITY_TEAM_2,
  PARITY_TEE,
} from '../../../../lib/cup/testing/matchPlanParity';
import expected from '../../../../lib/cup/testing/matchPlanParity.expected.json';
import { createCupMatches, fetchCupGenerate } from '../data/cupSetup';
import type { ScreenProps } from '../navigation';
import { CupGenerate } from './CupGenerate';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/cupSetup', () => ({
  fetchCupGenerate: jest.fn(),
  createCupMatches: jest.fn(async () => ({ ok: true })),
}));

const mockFocus: { run: (() => void) | null } = { run: null };
const mockPrevent: {
  enabled: boolean;
  callback: ((event: { data: { action: { type: string } } }) => void) | null;
} = { enabled: false, callback: null };
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus.run = callback;
    require('react').useEffect(callback, [callback]);
  },
  usePreventRemove: (enabled: boolean, callback: (event: { data: { action: { type: string } } }) => void) => {
    mockPrevent.enabled = enabled;
    mockPrevent.callback = callback;
  },
}));

const P = (id: string, displayName: string, hcpIndex: number) => ({ id, displayName, hcpIndex, gender: 'mens' as const });
const PLAYERS = [P('a', 'Ola', 12.4), P('b', 'Kari', 18), P('c', 'Per', 9.6), P('d', 'Tapp', 24.1)];

const view = (over: Partial<AppCupGenerateView> = {}): AppCupGenerateView => ({
  id: 'cup-1',
  name: 'Klubbmesterskapet',
  status: 'draft',
  team1Name: 'Team Nord',
  team2Name: 'Team Sør',
  matchCap: 36,
  existingMatchCount: 0,
  plan: {
    courseName: 'Stiklestad Golfbane',
    teeName: 'Gul',
    tee: { id: 'tee', name: 'Gul' },
    presetId: 'singler',
    customSessions: [],
    strategy: 'handicap',
  },
  players: PLAYERS,
  ...over,
});
const answer = (value: AppCupGenerateView = view()) =>
  (fetchCupGenerate as jest.Mock).mockResolvedValue({ ok: true, view: value });

async function renderScreen() {
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    dispatch: jest.fn(),
    setParams: jest.fn(),
    isFocused: jest.fn(() => true),
    getState: () => ({
      index: 2,
      routes: [{ name: 'Home' }, { name: 'Cup', params: { cupId: 'cup-1' } }, { name: 'CupGenerate', params: { cupId: 'cup-1' } }],
    }),
  };
  await render(
    <CupGenerate {...({ navigation, route: { key: 'g', name: 'CupGenerate', params: { cupId: 'cup-1' } } } as unknown as ScreenProps<'CupGenerate'>)} />,
  );
  return navigation;
}

const assign = (id: string, team: 'team1' | 'team2' | 'unassigned') =>
  fireEvent.press(screen.getByTestId(`cup-generate-assign-${id}-${team}`));
const next = () => fireEvent.press(screen.getByTestId('cup-generate-next'));
const submit = () => fireEvent.press(screen.getByTestId('cup-generate-submit'));
const backGesture = { type: 'GO_BACK' };
const back = () => act(async () => mockPrevent.callback?.({ data: { action: backGesture } }));

async function twoAgainstTwo() {
  await assign('a', 'team1');
  await assign('b', 'team1');
  await assign('c', 'team2');
  await assign('d', 'team2');
}

beforeEach(() => {
  jest.clearAllMocks();
  answer();
  mockPrevent.callback = null;
  mockPrevent.enabled = false;
});

describe('før skjemaet', () => {
  it('den som ikke styrer cupen: en setning, uten «Prøv igjen»', async () => {
    (fetchCupGenerate as jest.Mock).mockResolvedValue({ ok: false, reason: 'not_manager' });
    await renderScreen();
    expect(screen.getByTestId('cup-generate-failed')).toHaveTextContent('Det er arrangøren som setter opp cupen.');
    expect(screen.queryByTestId('cup-generate-retry')).toBeNull();
  });

  it('uten nett: «Prøv igjen» henter på nytt', async () => {
    (fetchCupGenerate as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'offline' });
    await renderScreen();
    expect(screen.getByTestId('cup-generate-failed')).toHaveTextContent(/Sjekk nettet/);
    await fireEvent.press(screen.getByTestId('cup-generate-retry'));
    expect(screen.getByTestId('cup-generate-roster')).toBeTruthy();
  });

  it('en cup som har startet: låst, uten skjema', async () => {
    answer(view({ status: 'active' }));
    await renderScreen();
    expect(screen.getByTestId('cup-generate-locked')).toHaveTextContent('Cupen er allerede startet.');
    expect(screen.queryByTestId('cup-generate-next')).toBeNull();
  });

  it('mangler plan og spillere: begge sier hva, og åpner rommet der det ordnes', async () => {
    answer(view({ plan: null, players: [] }));
    const navigation = await renderScreen();
    expect(screen.getByTestId('cup-generate-no-plan')).toHaveTextContent(/Bane, tee og format/);
    expect(screen.getByTestId('cup-generate-no-players')).toHaveTextContent(/Ingen spillere/);
    await fireEvent.press(screen.getByTestId('cup-generate-open-setup'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateCup', { cupId: 'cup-1' });
    await fireEvent.press(screen.getByTestId('cup-generate-open-players'));
    expect(navigation.navigate).toHaveBeenCalledWith('CupParticipants', { cupId: 'cup-1' });
  });

  it('har du lagt til spillere og kommer tilbake, er skjemaet der', async () => {
    answer(view({ players: [] }));
    await renderScreen();
    expect(screen.getByTestId('cup-generate-no-players')).toBeTruthy();
    answer();
    await act(async () => mockFocus.run?.());
    expect(screen.getByTestId('cup-generate-roster')).toBeTruthy();
  });
});

describe('steg 1', () => {
  it('teller lagene, og «Neste» slipper først når begge har nok', async () => {
    answer(view({ plan: { ...view().plan!, presetId: 'klassisk' } }));
    await renderScreen();
    expect(screen.getByTestId('cup-generate-progress')).toHaveTextContent('Steg 1 av 2 · Fordel spillere på lag');
    expect(screen.getByTestId('cup-generate-cap')).toHaveTextContent(/maks 36 matcher/);
    expect(screen.getByTestId('cup-generate-block')).toHaveTextContent('Team Nord trenger minst 2 spillere.');
    expect(screen.getByTestId('cup-generate-next')).toBeDisabled();

    await assign('a', 'team1');
    await assign('b', 'team1');
    expect(screen.getByTestId('cup-generate-count-team1')).toHaveTextContent('2');
    expect(screen.getByTestId('cup-generate-block')).toHaveTextContent('Team Sør trenger minst 2 spillere.');

    await assign('c', 'team2');
    await assign('d', 'team2');
    expect(screen.queryByTestId('cup-generate-block')).toBeNull();
    expect(screen.getByTestId('cup-generate-next')).toBeEnabled();
  });

  it('ujevne lag sier fra', async () => {
    await renderScreen();
    await assign('a', 'team1');
    await assign('b', 'team2');
    await assign('c', 'team2');
    await assign('d', 'team2');
    expect(screen.getByTestId('cup-generate-uneven')).toHaveTextContent(/^Lagene er ujevne \(1 vs 3\)\./);
  });

  it('over taket stopper og sier hva du kan gjøre', async () => {
    answer(view({ matchCap: 1 }));
    await renderScreen();
    await twoAgainstTwo();
    expect(screen.getByTestId('cup-generate-over-cap')).toHaveTextContent(
      /Oppsettet gir 2 matcher\. En personlig cup tar maks 1\. Skru ned antall/,
    );
    expect(screen.getByTestId('cup-generate-next')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('cup-generate-session-minus-0'));
    expect(screen.getByTestId('cup-generate-session-count-0')).toHaveTextContent('1 av 2');
    expect(screen.queryByTestId('cup-generate-over-cap')).toBeNull();
    expect(screen.getByTestId('cup-generate-next')).toBeEnabled();
  });

  it('uten tak står ikke taket', async () => {
    answer(view({ matchCap: null }));
    await renderScreen();
    expect(screen.queryByTestId('cup-generate-cap')).toBeNull();
  });

  it('stepperen stopper på 1 og på det laget gir', async () => {
    await renderScreen();
    await twoAgainstTwo();
    expect(screen.getByTestId('cup-generate-session-plus-0')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('cup-generate-session-minus-0'));
    expect(screen.getByTestId('cup-generate-session-minus-0')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('cup-generate-session-plus-0'));
    expect(screen.getByTestId('cup-generate-session-count-0')).toHaveTextContent('2 av 2');
  });

  it('en delt dag har ingen økter å skru på', async () => {
    answer(view({ plan: { ...view().plan!, presetId: 'splittet-cup-dag' } }));
    await renderScreen();
    await twoAgainstTwo();
    expect(screen.queryByTestId('cup-generate-sessions')).toBeNull();
  });

  it('en ny lesing som feiler, sier hva, og lagene dine står', async () => {
    await renderScreen();
    await assign('a', 'team1');
    (fetchCupGenerate as jest.Mock).mockResolvedValue({ ok: false, reason: 'load_failed' });
    await act(async () => mockFocus.run?.());
    expect(screen.getByTestId('cup-generate-stale')).toHaveTextContent('Fikk ikke tak i cupen. Prøv igjen.');
    expect(screen.getByTestId('cup-generate-count-team1')).toHaveTextContent('1');
  });
});

describe('steg 2', () => {
  async function toPreview() {
    const navigation = await renderScreen();
    await twoAgainstTwo();
    await next();
    return navigation;
  }

  it('steget åpner øverst, også når du trykket «Neste» nederst på det forrige', async () => {
    await renderScreen();
    await twoAgainstTwo();
    const before = screen.getByTestId('cup-generate-screen');
    await next();
    expect(screen.getByTestId('cup-generate-screen')).not.toBe(before);
  });

  it('viser forslaget og oppsummeringen', async () => {
    await toPreview();
    expect(screen.getByTestId('cup-generate-progress')).toHaveTextContent('Steg 2 av 2 · Forhåndsvis matcher');
    expect(screen.getByTestId('cup-generate-recap')).toHaveTextContent(/Stiklestad Golfbane · Gul/);
    expect(screen.getByTestId('cup-generate-total')).toHaveTextContent('2 matcher totalt');
    expect(screen.getByTestId('cup-generate-submit')).toHaveTextContent('Opprett 2 matcher');
  });

  it('et trykk på plassen viser laget, og valget bytter og lukker', async () => {
    answer(view({ plan: { ...view().plan!, presetId: 'fourball-singler' } }));
    await toPreview();
    const slot = 'cup-generate-slot-fourball_matchplay-1:side1:0';
    expect(screen.getByTestId(slot)).toHaveTextContent('Ola');
    await fireEvent.press(screen.getByTestId(slot));
    // Den andre på samme side kan ikke velges til plassen, og lista viser bare laget.
    expect(screen.getByTestId('cup-generate-picker-fourball_matchplay-1-b')).toBeDisabled();
    expect(screen.queryByTestId('cup-generate-picker-fourball_matchplay-1-c')).toBeNull();
    await fireEvent.press(screen.getByTestId('cup-generate-picker-fourball_matchplay-1-a'));
    expect(screen.queryByTestId('cup-generate-picker-fourball_matchplay-1')).toBeNull();
    expect(screen.getByTestId(slot)).toHaveTextContent('Ola');
  });

  it('en singel kan få en annen fra laget, og det er det som sendes', async () => {
    await toPreview();
    const slot = 'cup-generate-slot-singles_matchplay-1:side1:0';
    await fireEvent.press(screen.getByTestId(slot));
    await fireEvent.press(screen.getByTestId('cup-generate-picker-singles_matchplay-1-b'));
    expect(screen.getByTestId(slot)).toHaveTextContent('Kari');
    await submit();
    const body = (createCupMatches as jest.Mock).mock.calls[0][1];
    expect(body.matches[0].side1).toEqual(['b']);
  });

  it('«Generer på nytt» setter forslaget tilbake', async () => {
    await toPreview();
    const slot = 'cup-generate-slot-singles_matchplay-1:side1:0';
    await fireEvent.press(screen.getByTestId(slot));
    await fireEvent.press(screen.getByTestId('cup-generate-picker-singles_matchplay-1-b'));
    await fireEvent.press(screen.getByTestId('cup-generate-regenerate'));
    expect(screen.getByTestId(slot)).toHaveTextContent('Ola');
  });

  it('sender kampene og antallet skjermen så, og går til cupen med kvittering', async () => {
    answer(view({ existingMatchCount: 3 }));
    const navigation = await toPreview();
    await submit();
    expect(createCupMatches).toHaveBeenCalledTimes(1);
    const [cupId, body] = (createCupMatches as jest.Mock).mock.calls[0];
    expect(cupId).toBe('cup-1');
    expect(body.expectedExisting).toBe(3);
    expect(body.matches).toHaveLength(2);
    expect(navigation.popTo).toHaveBeenCalledWith('Cup', { cupId: 'cup-1', notice: 'matches_generated' });

    // Navigasjonen etterpå slipper forbi vakten.
    await back();
    expect(navigation.dispatch).toHaveBeenCalledWith(backGesture);
  });

  it('kampene finnes alt, fra et svar som gikk tapt: det er det samme som at de ble laget', async () => {
    (createCupMatches as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'matches_changed' });
    const navigation = await toPreview();
    await submit();
    expect(navigation.popTo).toHaveBeenCalledWith('Cup', { cupId: 'cup-1', notice: 'matches_generated' });
    expect(screen.queryByTestId('cup-generate-error')).toBeNull();
  });

  it('serverens nei står, og du kan prøve igjen', async () => {
    (createCupMatches as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'too_many_matches' });
    const navigation = await toPreview();
    await submit();
    expect(screen.getByTestId('cup-generate-error')).toHaveTextContent(/^En personlig cup tar maks 36 matcher\./);
    expect(navigation.popTo).not.toHaveBeenCalled();
    await submit();
    expect(createCupMatches).toHaveBeenCalledTimes(2);
  });

  it('to trykk før skjermen er tegnet på nytt: ett kall', async () => {
    let finish: (value: { ok: true }) => void = () => {};
    (createCupMatches as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await toPreview();
    const button = screen.getByTestId('cup-generate-submit');
    await act(async () => {
      button.props.onClick?.({ preventDefault() {} });
      button.props.onClick?.({ preventDefault() {} });
    });
    expect(createCupMatches).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('cup-generate-submit')).toHaveTextContent('Genererer …');
    await act(async () => finish({ ok: true }));
  });

  it('et svar mens en annen skjerm ligger oppå: du hentes ikke bort, og går videre når du er tilbake', async () => {
    const navigation = await toPreview();
    navigation.isFocused.mockReturnValue(false);
    await submit();
    expect(navigation.popTo).not.toHaveBeenCalled();

    navigation.isFocused.mockReturnValue(true);
    await act(async () => mockFocus.run?.());
    expect(navigation.popTo).toHaveBeenCalledWith('Cup', { cupId: 'cup-1', notice: 'matches_generated' });
    expect(createCupMatches).toHaveBeenCalledTimes(1);
  });

  it('tilbake går til lagene, som står, og «Neste» lager et nytt forslag', async () => {
    const navigation = await toPreview();
    expect(mockPrevent.enabled).toBe(true);
    await back();
    expect(screen.getByTestId('cup-generate-progress')).toHaveTextContent(/^Steg 1 av 2/);
    expect(screen.getByTestId('cup-generate-count-team1')).toHaveTextContent('2');
    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(mockPrevent.enabled).toBe(false);
    await next();
    expect(screen.getByTestId('cup-generate-progress')).toHaveTextContent(/^Steg 2 av 2/);
  });

  it('tilbake mens kampene lages: du blir stående, og kommer ikke ut på siden av svaret', async () => {
    let finish: (value: { ok: true }) => void = () => {};
    (createCupMatches as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const navigation = await toPreview();
    await submit();
    await back();
    expect(screen.getByTestId('cup-generate-progress')).toHaveTextContent(/^Steg 2 av 2/);
    expect(navigation.dispatch).not.toHaveBeenCalled();
    await act(async () => finish({ ok: true }));
    expect(navigation.popTo).toHaveBeenCalledTimes(1);
  });
});

describe('delt dag', () => {
  async function toBundle() {
    answer(view({ players: PARITY_PLAYERS, plan: { ...view().plan!, presetId: 'splittet-cup-dag', tee: PARITY_TEE } }));
    await renderScreen();
    for (const p of PARITY_TEAM_1) await assign(p.id, 'team1');
    for (const p of PARITY_TEAM_2) await assign(p.id, 'team2');
    await next();
  }
  const firstGreensome = expected['splittet-cup-dag'][0];

  it('slagene er ferdig utfylt med regnehjelpen under', async () => {
    await toBundle();
    expect(screen.getByTestId('cup-generate-irish')).toBeTruthy();
    expect(screen.getByTestId(`cup-generate-strokes-${firstGreensome.id}-team1`).props.value).toBe('15');
    expect(screen.getByTestId(`cup-generate-strokes-${firstGreensome.id}-team2`).props.value).toBe('17');
    expect(screen.getByTestId(`cup-generate-helper-${firstGreensome.id}-team1`)).toHaveTextContent(/Anna: SH \d+ · Dag: SH \d+/);
  });

  it('et tall du skriver over med, er det som sendes', async () => {
    await toBundle();
    await fireEvent.changeText(screen.getByTestId(`cup-generate-strokes-${firstGreensome.id}-team1`), '9');
    await submit();
    const sent = (createCupMatches as jest.Mock).mock.calls[0][1].matches[0];
    expect(sent.teamStrokesOverride).toEqual({ team1: 9, team2: 17 });
  });

  it('«Generer på nytt» tar bort tall skrevet for forrige oppstilling', async () => {
    await toBundle();
    const field = `cup-generate-strokes-${firstGreensome.id}-team1`;
    await fireEvent.changeText(screen.getByTestId(field), '9');
    await fireEvent.press(screen.getByTestId('cup-generate-regenerate'));
    expect(screen.getByTestId(field).props.value).toBe('15');
  });

  it('et bytte i oppstillingen følger hele bunten, og forslaget følger spillerne', async () => {
    await toBundle();
    await fireEvent.press(screen.getByTestId('cup-generate-lineup-1:side1:0'));
    await fireEvent.press(screen.getByTestId('cup-generate-picker-1-nord-2'));
    expect(screen.getByTestId('cup-generate-lineup-1:side1:0')).toHaveTextContent('Bjørn');
    await submit();
    const sent = (createCupMatches as jest.Mock).mock.calls[0][1].matches as { flightIndex: number; side1: string[] }[];
    for (const match of sent.filter((m) => m.flightIndex === 1)) expect(match.side1).not.toContain('nord-1');
  });
});

// Kriterium 18: nettets `GenerateMatchesWizard.test.tsx` trykker seg til den samme fila.
describe('samme kamper som nettet', () => {
  it.each(PARITY_PRESET_IDS)('%s', async (presetId) => {
    answer(view({ players: PARITY_PLAYERS, plan: { ...view().plan!, presetId, tee: PARITY_TEE } }));
    await renderScreen();
    for (const p of PARITY_TEAM_1) await assign(p.id, 'team1');
    for (const p of PARITY_TEAM_2) await assign(p.id, 'team2');
    await next();
    await submit();
    expect((createCupMatches as jest.Mock).mock.calls[0][1].matches).toEqual(expected[presetId]);
  });
});

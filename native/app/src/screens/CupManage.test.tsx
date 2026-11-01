// #2752: «Styr cupen» som skjerm (Type C). Ruta regner alt; her låses det skjermen
// svarer for: lenkene og hvem de gjelder, valgene, og at ingenting kan gjøres uten nett.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { AppCupManageView } from '../../../../lib/cup/appCupManageView';
import type { ScreenProps } from '../navigation';
import { CupManage } from './CupManage';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/cupManage', () => ({
  fetchCupManage: jest.fn(async () => mockResults.shift() ?? mockLast),
  setCupPlayOn: jest.fn(async () => mockSave),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

type Load = { ok: true; view: AppCupManageView } | { ok: false; reason: string };
let mockFocus: () => void = () => {};
let mockResults: Load[] = [];
let mockLast: Load = { ok: false, reason: 'offline' };
let mockSave: { ok: boolean; reason?: string } = { ok: true };

function answer(...results: Load[]) {
  mockResults = [...results];
  mockLast = results[results.length - 1];
}

const room = (over: Partial<AppCupManageView> = {}): AppCupManageView => ({
  id: 'cup-1',
  name: 'Klubbmesterskapet',
  status: 'active',
  team1Name: 'Team Nord',
  team2Name: 'Team Sør',
  players: [
    { userId: 'ola', name: 'Ola Kompis', team: 1, withdrawn: false, canAct: true },
    { userId: 'tapp', name: 'Testspiller Tapp', team: 1, withdrawn: true, canAct: true },
    { userId: 'ferdig', name: 'Berit', team: 1, withdrawn: false, canAct: false },
    { userId: 'kari', name: 'Kari Arrangør', team: 2, withdrawn: false, canAct: true },
  ],
  matches: [
    {
      gameId: 'fri',
      label: 'Singel 5',
      side1: 'Ola Kompis',
      side2: 'Kari Arrangør',
      status: 'notStarted',
      withdrawnName: '',
      walkoverTeam: '',
      canSwap: true,
      choice: null,
    },
  ],
  ...over,
});

const choiceMatch = (pending: boolean, playOn = false) => ({
  gameId: 'fb',
  label: 'Fourball 2',
  side1: 'Ola/Tapp',
  side2: 'Kari/Per',
  status: (pending ? 'playOnPending' : 'decidedHalved') as 'playOnPending' | 'decidedHalved',
  withdrawnName: 'Ola',
  walkoverTeam: '',
  canSwap: false,
  choice: { partnerName: 'Tapp', pending, playOn },
});

function navigationStub() {
  return {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    setParams: jest.fn(),
    addListener: jest.fn(() => () => {}),
    getState: () => ({
      index: 2,
      routes: [{ name: 'Home' }, { name: 'Cup', params: { cupId: 'cup-1' } }, { name: 'CupManage', params: { cupId: 'cup-1' } }],
    }),
  };
}

async function renderManage(params: Record<string, unknown> = {}) {
  const navigation = navigationStub();
  await render(
    <CupManage
      {...({
        navigation,
        route: { key: 'm', name: 'CupManage', params: { cupId: 'cup-1', ...params } },
      } as unknown as ScreenProps<'CupManage'>)}
    />,
  );
  return navigation;
}

const refocus = async () => {
  await act(async () => {
    mockFocus();
  });
};

beforeEach(() => {
  mockSave = { ok: true };
  jest.clearAllMocks();
});

describe('spillerne', () => {
  it('står per lag, med trekk, angring og merket', async () => {
    answer({ ok: true, view: room() });
    await renderManage();

    const nord = await screen.findByTestId('cup-manage-team-1');
    expect(within(nord).getByText('Spillere · Team Nord')).toBeTruthy();
    expect(screen.getByTestId('cup-manage-withdraw-ola')).toHaveTextContent('Trekk fra cupen');
    expect(screen.getByTestId('cup-manage-withdraw-tapp')).toHaveTextContent('Angre trekk');
    expect(screen.getByTestId('cup-manage-player-tapp')).toHaveTextContent(/Trukket/);
    expect(screen.getByTestId('cup-manage-player-ola')).not.toHaveTextContent(/Trukket/);
    // Ingen kamp igjen: ingen lenke som lover noe serveren nekter.
    expect(screen.queryByTestId('cup-manage-withdraw-ferdig')).toBeNull();
    expect(within(screen.getByTestId('cup-manage-team-2')).getByText('Kari Arrangør')).toBeTruthy();
  });

  it('lenken går til bekreftelsen for den spilleren', async () => {
    answer({ ok: true, view: room() });
    const navigation = await renderManage();
    await fireEvent.press(await screen.findByTestId('cup-manage-withdraw-ola'));
    expect(navigation.navigate).toHaveBeenCalledWith('CupWithdraw', { cupId: 'cup-1', userId: 'ola' });
  });
});

describe('kampene', () => {
  it('«Bytt spiller» bare der byttet er lov', async () => {
    answer({ ok: true, view: room({ matches: [...room().matches, choiceMatch(false)] }) });
    const navigation = await renderManage();
    await fireEvent.press(await screen.findByTestId('cup-manage-swap-fri'));
    expect(navigation.navigate).toHaveBeenCalledWith('CupSwapPlayer', { cupId: 'cup-1', gameId: 'fri' });
    expect(screen.queryByTestId('cup-manage-swap-fb')).toBeNull();
    expect(screen.getByTestId('cup-manage-status-fb')).toHaveTextContent('Halvert — Ola trakk seg');
  });

  it('uten kamper igjen står det', async () => {
    answer({ ok: true, view: room({ matches: [] }) });
    await renderManage();
    expect(await screen.findByTestId('cup-manage-no-matches')).toBeTruthy();
  });
});

describe('makkervalget', () => {
  const { setCupPlayOn } = jest.requireMock('../data/cupManage') as { setCupPlayOn: jest.Mock };

  it('venter: begge svarene er ett trykk unna, og siden henter på nytt etterpå', async () => {
    answer({ ok: true, view: room({ matches: [choiceMatch(true)] }) }, { ok: true, view: room({ matches: [choiceMatch(false, true)] }) });
    await renderManage();

    const card = await screen.findByTestId('cup-manage-choice-fb');
    expect(card).toHaveTextContent(/Skal Tapp spille alene, eller avgjøres kampen uten spill\?/);
    await fireEvent.press(screen.getByTestId('cup-manage-choice-yes-fb'));

    expect(setCupPlayOn).toHaveBeenCalledWith('cup-1', 'fb', true);
    expect(screen.queryByTestId('cup-manage-pending')).toBeNull();
    expect(screen.getByTestId('cup-manage-notice')).toHaveTextContent('Valget er lagret.');
  });

  it('«avgjøres uten spill» er også et svar', async () => {
    answer({ ok: true, view: room({ matches: [choiceMatch(true)] }) });
    await renderManage();
    await fireEvent.press(await screen.findByTestId('cup-manage-choice-no-fb'));
    expect(setCupPlayOn).toHaveBeenCalledWith('cup-1', 'fb', false);
  });

  it('valget er tatt: én knapp som slår det andre veien', async () => {
    answer({ ok: true, view: room({ matches: [choiceMatch(false, true)] }) });
    await renderManage();
    const toggle = await screen.findByTestId('cup-manage-choice-toggle-fb');
    expect(toggle).toHaveTextContent('La kampen avgjøres uten spill');
    await fireEvent.press(toggle);
    expect(setCupPlayOn).toHaveBeenCalledWith('cup-1', 'fb', false);
  });

  it('serveren sier nei: nettets setning, og valget står', async () => {
    mockSave = { ok: false, reason: 'match_not_eligible' };
    answer({ ok: true, view: room({ matches: [choiceMatch(true)] }) });
    await renderManage();
    await fireEvent.press(await screen.findByTestId('cup-manage-choice-yes-fb'));
    expect(screen.getByTestId('cup-manage-error')).toHaveTextContent('Valget passer ikke på denne kampen.');
    expect(screen.getByTestId('cup-manage-choice-fb')).toBeTruthy();
  });
});

describe('kvitteringen', () => {
  it('et valg etter et trekk: det siste du gjorde, står', async () => {
    answer({ ok: true, view: room({ matches: [choiceMatch(true)] }) });
    await renderManage({ notice: 'player_withdrawn' });
    await fireEvent.press(await screen.findByTestId('cup-manage-choice-yes-fb'));
    expect(screen.getByTestId('cup-manage-notice')).toHaveTextContent('Valget er lagret.');
  });

  it('en feil forsvinner når siden mister fokus', async () => {
    mockSave = { ok: false, reason: 'match_not_eligible' };
    answer({ ok: true, view: room({ matches: [choiceMatch(true)] }) });
    const navigation = await renderManage();
    await fireEvent.press(await screen.findByTestId('cup-manage-choice-yes-fb'));
    expect(screen.getByTestId('cup-manage-error')).toBeTruthy();
    const [, listener] = navigation.addListener.mock.calls[0] as unknown as [string, () => void];
    await act(async () => listener());
    expect(screen.queryByTestId('cup-manage-error')).toBeNull();
  });

  it('etter et trekk står den, og nullstilles når siden mister fokus', async () => {
    answer({ ok: true, view: room() });
    const navigation = await renderManage({ notice: 'player_withdrawn' });
    expect(await screen.findByTestId('cup-manage-notice')).toHaveTextContent(
      'Trekket er registrert. Hvert kampkort viser hva som skjedde med kampen.',
    );
    const [event, listener] = navigation.addListener.mock.calls[0] as unknown as [string, () => void];
    expect(event).toBe('blur');
    await act(async () => listener());
    expect(navigation.setParams).toHaveBeenCalledWith({ notice: undefined });
  });
});

describe('lasting og feil', () => {
  it('uten nett: det skjermen har, uten en eneste handling', async () => {
    answer(
      { ok: true, view: room({ matches: [...room().matches, choiceMatch(true)] }) },
      { ok: false, reason: 'offline' },
    );
    await renderManage();
    await screen.findByTestId('cup-manage-withdraw-ola');
    await refocus();

    expect(screen.getByTestId('cup-manage-stale')).toHaveTextContent(/Du trenger nett/);
    expect(screen.getByTestId('cup-manage-player-ola')).toBeTruthy();
    expect(screen.queryByTestId('cup-manage-withdraw-ola')).toBeNull();
    expect(screen.queryByTestId('cup-manage-swap-fri')).toBeNull();
    expect(screen.getByTestId('cup-manage-choice-yes-fb').props.accessibilityState?.disabled).toBe(true);
  });

  it('uten noe hentet: feilen, og «Prøv igjen» henter på nytt', async () => {
    answer({ ok: false, reason: 'offline' }, { ok: true, view: room() });
    await renderManage();
    expect(await screen.findByTestId('cup-manage-failed')).toHaveTextContent(/Du trenger nett/);
    await fireEvent.press(screen.getByTestId('cup-manage-retry'));
    expect(await screen.findByTestId('cup-manage-name')).toBeTruthy();
  });

  it.each([
    ['not_manager', 'Det er arrangøren som styrer cupen.'],
    ['not_found', 'Fant ikke cupen. Den finnes ikke, eller du har ikke tilgang.'],
  ])('%s: setningen uten «Prøv igjen», og det gamle forsvinner', async (reason, text) => {
    answer({ ok: true, view: room() }, { ok: false, reason });
    await renderManage();
    await screen.findByTestId('cup-manage-name');
    await refocus();
    expect(screen.getByTestId('cup-manage-failed')).toHaveTextContent(text);
    expect(screen.queryByTestId('cup-manage-retry')).toBeNull();
    expect(screen.queryByTestId('cup-manage-name')).toBeNull();
  });
});

// #2752: bekreftelsen for trekk som skjerm (Type C). Tre varianter fra samme data.
// Konsekvensene regnes på serveren; her låses hva hver variant sender og sier.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AppCupWithdrawalView } from '../../../../lib/cup/appCupManageView';
import type { ScreenProps } from '../navigation';
import { CupWithdraw } from './CupWithdraw';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/cupManage', () => ({
  fetchCupWithdrawal: jest.fn(async () => mockView),
  withdrawSelfFromCup: jest.fn(async () => mockAction),
  withdrawCupPlayer: jest.fn(async () => mockAction),
  undoCupWithdrawal: jest.fn(async () => mockAction),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

let mockView: { ok: true; view: AppCupWithdrawalView } | { ok: false; reason: string };
let mockAction: { ok: boolean; partial?: boolean; reason?: string } = { ok: true };

const data = () =>
  jest.requireMock('../data/cupManage') as {
    withdrawSelfFromCup: jest.Mock;
    withdrawCupPlayer: jest.Mock;
    undoCupWithdrawal: jest.Mock;
  };

const view = (over: Partial<AppCupWithdrawalView> = {}): AppCupWithdrawalView => ({
  cup: { id: 'cup-1', name: 'Klubbmesterskapet', status: 'active', team1Name: 'Team Nord', team2Name: 'Team Sør' },
  player: { userId: 'ola', name: 'Ola Kompis', isSelf: true },
  alreadyWithdrawn: false,
  matches: [
    { gameId: 's1', label: 'Singel 1', when: 'man. 2. nov', outcome: { kind: 'halved' }, canPlayOn: false, playOn: false, partnerName: null },
  ],
  untouched: [{ gameId: 'g1', label: 'Greensome 1' }],
  ...over,
});
const asAdmin = (over: Partial<AppCupWithdrawalView> = {}) =>
  view({ player: { userId: 'ola', name: 'Ola Kompis', isSelf: false }, ...over });
const fourball = (playOn = false) => ({
  gameId: 'fb',
  label: 'Fourball 2',
  when: 'man. 2. nov',
  outcome: { kind: 'halved' as const },
  canPlayOn: true,
  playOn,
  partnerName: 'Tapp',
});

function navigationStub(routes: { name: string; params?: object }[]) {
  return {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    getState: () => ({ index: routes.length - 1, routes }),
  };
}

async function renderWithdraw(userId?: string) {
  const navigation = navigationStub([
    { name: 'Home' },
    { name: 'Cup', params: { cupId: 'cup-1' } },
    ...(userId ? [{ name: 'CupManage', params: { cupId: 'cup-1' } }] : []),
    { name: 'CupWithdraw', params: { cupId: 'cup-1', userId } },
  ]);
  await render(
    <CupWithdraw
      {...({
        navigation,
        route: { key: 'w', name: 'CupWithdraw', params: { cupId: 'cup-1', userId } },
      } as unknown as ScreenProps<'CupWithdraw'>)}
    />,
  );
  return navigation;
}

beforeEach(() => {
  mockAction = { ok: true };
  jest.clearAllMocks();
});

describe('spilleren trekker seg selv', () => {
  it('konsekvensene, det som ikke røres, og knappen', async () => {
    mockView = { ok: true, view: view() };
    await renderWithdraw();

    expect(await screen.findByTestId('cup-withdraw-heading')).toHaveTextContent('Trekk deg fra Klubbmesterskapet?');
    expect(screen.getByTestId('cup-withdraw-warning')).toBeTruthy();
    expect(screen.getByTestId('cup-withdraw-consequences')).toHaveTextContent(/Singel 1 · man\. 2\. nov → halveres/);
    expect(screen.getByTestId('cup-withdraw-consequences')).toHaveTextContent(/Arrangøren ser trekket/);
    expect(screen.getByTestId('cup-withdraw-untouched')).toHaveTextContent(/Greensome 1/);
    expect(screen.getByTestId('cup-withdraw-submit')).toHaveTextContent('Trekk meg');
  });

  it('trekket går til spillerens egen rute, og tilbake til rommet', async () => {
    mockView = { ok: true, view: view() };
    const navigation = await renderWithdraw();
    await fireEvent.press(await screen.findByTestId('cup-withdraw-submit'));
    expect(data().withdrawSelfFromCup).toHaveBeenCalledWith('cup-1');
    expect(data().withdrawCupPlayer).not.toHaveBeenCalled();
    expect(navigation.popTo).toHaveBeenCalledWith('Cup', { cupId: 'cup-1' });
  });

  it('allerede trukket: sier det, uten knapp, og spilleren kan ikke angre selv', async () => {
    mockView = { ok: true, view: view({ alreadyWithdrawn: true, matches: [] }) };
    await renderWithdraw();
    expect(await screen.findByTestId('cup-withdraw-info')).toHaveTextContent(/må arrangøren angre trekket/);
    expect(screen.queryByTestId('cup-withdraw-submit')).toBeNull();
    expect(screen.queryByTestId('cup-withdraw-undo')).toBeNull();
  });

  it('ingenting igjen å trekke seg fra', async () => {
    mockView = { ok: true, view: view({ matches: [] }) };
    await renderWithdraw();
    expect(await screen.findByTestId('cup-withdraw-info')).toHaveTextContent(/ingenting å trekke seg fra/);
    expect(screen.queryByTestId('cup-withdraw-submit')).toBeNull();
  });

  it('en cup som ikke går: sier det før du trykker', async () => {
    mockView = { ok: true, view: view({ cup: { ...view().cup, status: 'finished' } }) };
    await renderWithdraw();
    expect(await screen.findByTestId('cup-withdraw-info')).toHaveTextContent('Cupen er ikke i gang.');
    expect(screen.queryByTestId('cup-withdraw-submit')).toBeNull();
  });
});

describe('arrangøren trekker en spiller', () => {
  it('forhåndsvalget er «etter regelen», og svaret sendes bare for kampene skjermen spurte om', async () => {
    mockView = { ok: true, view: asAdmin({ matches: [...view().matches, fourball()] }) };
    const navigation = await renderWithdraw('ola');

    expect(await screen.findByTestId('cup-withdraw-heading')).toHaveTextContent('Trekk Ola Kompis fra Klubbmesterskapet?');
    expect(screen.getByTestId('cup-withdraw-choice-no-fb').props.accessibilityState.selected).toBe(true);
    expect(screen.queryByTestId('cup-withdraw-choice-yes-s1')).toBeNull();

    await fireEvent.press(screen.getByTestId('cup-withdraw-submit'));
    expect(data().withdrawCupPlayer).toHaveBeenCalledWith('cup-1', 'ola', {
      offeredGameIds: ['fb'],
      playOnGameIds: [],
    });
    expect(navigation.popTo).toHaveBeenCalledWith('CupManage', { cupId: 'cup-1', notice: 'player_withdrawn' });
  });

  it('makkeren spiller alene: valget sendes med. Delvis trekk får sin egen kvittering', async () => {
    mockView = { ok: true, view: asAdmin({ matches: [fourball()] }) };
    mockAction = { ok: true, partial: true };
    const navigation = await renderWithdraw('ola');
    await fireEvent.press(await screen.findByTestId('cup-withdraw-choice-yes-fb'));
    await fireEvent.press(screen.getByTestId('cup-withdraw-submit'));
    expect(data().withdrawCupPlayer).toHaveBeenCalledWith('cup-1', 'ola', {
      offeredGameIds: ['fb'],
      playOnGameIds: ['fb'],
    });
    expect(navigation.popTo).toHaveBeenCalledWith('CupManage', { cupId: 'cup-1', notice: 'player_withdrawn_partial' });
  });

  it('et valg som alt er registrert står forhåndsvalgt', async () => {
    mockView = { ok: true, view: asAdmin({ matches: [fourball(true)] }) };
    await renderWithdraw('ola');
    expect((await screen.findByTestId('cup-withdraw-choice-yes-fb')).props.accessibilityState.selected).toBe(true);
  });

  it('serveren sier nei: nettets setning, og du blir på skjermen', async () => {
    mockView = { ok: true, view: asAdmin() };
    mockAction = { ok: false, reason: 'no_pending_matches' };
    const navigation = await renderWithdraw('ola');
    await fireEvent.press(await screen.findByTestId('cup-withdraw-submit'));
    expect(screen.getByTestId('cup-withdraw-error')).toHaveTextContent('Du har ingen kamper igjen å trekke deg fra.');
    expect(navigation.popTo).not.toHaveBeenCalled();
  });
});

describe('angringen', () => {
  it('skjermen snur når spilleren alt er trukket, og sender angringen', async () => {
    mockView = { ok: true, view: asAdmin({ alreadyWithdrawn: true, matches: [] }) };
    const navigation = await renderWithdraw('ola');

    expect(await screen.findByTestId('cup-withdraw-heading')).toHaveTextContent('Angre trekket for Ola Kompis?');
    expect(screen.queryByTestId('cup-withdraw-warning')).toBeNull();
    expect(screen.queryByTestId('cup-withdraw-submit')).toBeNull();
    await fireEvent.press(screen.getByTestId('cup-withdraw-undo'));
    expect(data().undoCupWithdrawal).toHaveBeenCalledWith('cup-1', 'ola');
    expect(navigation.popTo).toHaveBeenCalledWith('CupManage', { cupId: 'cup-1', notice: 'withdrawal_undone' });
  });
});

describe('avbryt og feil', () => {
  it('«Avbryt» skriver ingenting, og går dit du kom fra', async () => {
    mockView = { ok: true, view: asAdmin() };
    const navigation = await renderWithdraw('ola');
    await fireEvent.press(await screen.findByTestId('cup-withdraw-cancel'));
    expect(data().withdrawCupPlayer).not.toHaveBeenCalled();
    expect(navigation.popTo).toHaveBeenCalledWith('CupManage', { cupId: 'cup-1' });
  });

  it('uten nett: feilen, med «Prøv igjen»', async () => {
    mockView = { ok: false, reason: 'offline' };
    await renderWithdraw();
    expect(await screen.findByTestId('cup-withdraw-failed')).toHaveTextContent(/Du trenger nett/);
    expect(screen.getByTestId('cup-withdraw-retry')).toBeTruthy();
  });
});

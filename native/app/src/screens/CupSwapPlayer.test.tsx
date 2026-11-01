// #2752: «Bytt spiller» som skjerm (Type C). Vakta er på serveren; her låses valgene,
// linja som sier hva som skjer, og at en feil er serverens ord.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AppCupSwapCandidates } from '../../../../lib/cup/appCupManageView';
import type { ScreenProps } from '../navigation';
import { CupSwapPlayer } from './CupSwapPlayer';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/cupManage', () => ({
  fetchCupSwapCandidates: jest.fn(async () => mockView),
  swapCupPlayer: jest.fn(async () => mockAction),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

let mockView: { ok: true; view: AppCupSwapCandidates } | { ok: false; reason: string };
let mockAction: { ok: boolean; reason?: string } = { ok: true };

const swap = () => (jest.requireMock('../data/cupManage') as { swapCupPlayer: jest.Mock }).swapCupPlayer;

const view = (over: Partial<AppCupSwapCandidates> = {}): AppCupSwapCandidates => ({
  gameId: 'g',
  label: 'Singel 5',
  side1: 'Ola Kompis',
  side2: 'Kari Arrangør',
  blocked: null,
  bundled: false,
  out: [
    { userId: 'ola', name: 'Ola Kompis', teamName: 'Team Nord' },
    { userId: 'kari', name: 'Kari Arrangør', teamName: 'Team Sør' },
  ],
  in: [
    { userId: 'berit', name: 'Berit Bagtag' },
    { userId: 'sigrid', name: 'Sigrid Startboden' },
  ],
  ...over,
});

async function renderSwap() {
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    getState: () => ({
      index: 3,
      routes: [
        { name: 'Home' },
        { name: 'Cup', params: { cupId: 'cup-1' } },
        { name: 'CupManage', params: { cupId: 'cup-1' } },
        { name: 'CupSwapPlayer', params: { cupId: 'cup-1', gameId: 'g' } },
      ],
    }),
  };
  await render(
    <CupSwapPlayer
      {...({
        navigation,
        route: { key: 's', name: 'CupSwapPlayer', params: { cupId: 'cup-1', gameId: 'g' } },
      } as unknown as ScreenProps<'CupSwapPlayer'>)}
    />,
  );
  return navigation;
}

beforeEach(() => {
  mockAction = { ok: true };
  jest.clearAllMocks();
});

describe('valgene', () => {
  it('den første står valgt, og linja sier hvem som går inn for hvem', async () => {
    mockView = { ok: true, view: view() };
    await renderSwap();

    expect(await screen.findByTestId('cup-swap-label')).toHaveTextContent('Singel 5');
    expect(screen.getByTestId('cup-swap-out-ola').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('cup-swap-out-ola')).toHaveTextContent(/Team Nord/);
    expect(screen.getByTestId('cup-swap-in-berit').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('cup-swap-summary')).toHaveTextContent('Berit Bagtag går inn for Ola Kompis.');
  });

  it('et annet valg endrer linja, og er det som sendes', async () => {
    mockView = { ok: true, view: view() };
    const navigation = await renderSwap();
    await fireEvent.press(await screen.findByTestId('cup-swap-out-kari'));
    await fireEvent.press(screen.getByTestId('cup-swap-in-sigrid'));
    expect(screen.getByTestId('cup-swap-summary')).toHaveTextContent('Sigrid Startboden går inn for Kari Arrangør.');

    await fireEvent.press(screen.getByTestId('cup-swap-submit'));
    expect(swap()).toHaveBeenCalledWith('cup-1', 'g', 'kari', 'sigrid');
    expect(navigation.popTo).toHaveBeenCalledWith('CupManage', { cupId: 'cup-1', notice: 'player_swapped' });
  });

  it('en delt dag: linja sier at byttet gjelder hele dagen', async () => {
    mockView = { ok: true, view: view({ bundled: true }) };
    await renderSwap();
    expect(await screen.findByTestId('cup-swap-summary')).toHaveTextContent(
      'Berit Bagtag går inn for Ola Kompis. Byttet gjelder alle kampene på denne dagen.',
    );
  });
});

describe('en lang liste', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ userId: `u${i}`, name: `Spiller ${i}` }));

  it('en kort liste har verken søk eller «Vis alle»', async () => {
    mockView = { ok: true, view: view() };
    await renderSwap();
    await screen.findByTestId('cup-swap-label');
    expect(screen.queryByTestId('cup-swap-search')).toBeNull();
    expect(screen.queryByTestId('cup-swap-show-all')).toBeNull();
  });

  it('seks rader og «Vis alle», og den valgte står selv om den ligger lenger ned', async () => {
    mockView = { ok: true, view: view({ in: many }) };
    await renderSwap();
    expect(await screen.findByTestId('cup-swap-in-u5')).toBeTruthy();
    expect(screen.queryByTestId('cup-swap-in-u6')).toBeNull();
    await fireEvent.press(screen.getByTestId('cup-swap-show-all'));
    await fireEvent.press(screen.getByTestId('cup-swap-in-u8'));
    await fireEvent.press(screen.getByTestId('cup-swap-show-all'));
    expect(screen.queryByTestId('cup-swap-in-u7')).toBeNull();
    expect(screen.getByTestId('cup-swap-in-u8').props.accessibilityState.selected).toBe(true);
  });

  it('et søk uten treff sier det', async () => {
    mockView = { ok: true, view: view({ in: many }) };
    await renderSwap();
    await fireEvent.changeText(await screen.findByTestId('cup-swap-search'), 'finnes ikke');
    expect(screen.getByTestId('cup-swap-no-match')).toHaveTextContent('Ingen spillere med det navnet.');
  });

  it('søket treffer alle, og valget er det som sendes', async () => {
    mockView = { ok: true, view: view({ in: many }) };
    await renderSwap();
    await fireEvent.changeText(await screen.findByTestId('cup-swap-search'), 'spiller 8');
    expect(screen.queryByTestId('cup-swap-in-u0')).toBeNull();
    await fireEvent.press(screen.getByTestId('cup-swap-in-u8'));
    expect(screen.getByTestId('cup-swap-summary')).toHaveTextContent('Spiller 8 går inn for Ola Kompis.');
    await fireEvent.press(screen.getByTestId('cup-swap-submit'));
    expect(swap()).toHaveBeenCalledWith('cup-1', 'g', 'ola', 'u8');
  });
});

describe('når byttet ikke går', () => {
  it('ingen å bytte inn: sier det, uten knapp', async () => {
    mockView = { ok: true, view: view({ in: [] }) };
    await renderSwap();
    expect(await screen.findByTestId('cup-swap-no-reserves')).toHaveTextContent(
      'Alle du kan bytte inn står allerede i kampen.',
    );
    expect(screen.queryByTestId('cup-swap-submit')).toBeNull();
  });

  it.each([
    ['already_started', /for sent å bytte/],
    ['match_has_withdrawal', /registrert trekk/],
  ] as const)('%s: den ekte grunnen, uten valg og knapp', async (blocked, text) => {
    mockView = { ok: true, view: view({ blocked }) };
    await renderSwap();
    expect(await screen.findByTestId('cup-swap-closed')).toHaveTextContent(text);
    expect(screen.queryByTestId('cup-swap-out-ola')).toBeNull();
    expect(screen.queryByTestId('cup-swap-submit')).toBeNull();
  });

  it('serveren sier nei: nettets setning, og du blir på skjermen', async () => {
    mockView = { ok: true, view: view() };
    mockAction = { ok: false, reason: 'not_candidate' };
    const navigation = await renderSwap();
    await fireEvent.press(await screen.findByTestId('cup-swap-submit'));
    expect(screen.getByTestId('cup-swap-error')).toHaveTextContent('Den spilleren kan du ikke bytte inn i denne cupen.');
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('«Avbryt» skriver ingenting', async () => {
    mockView = { ok: true, view: view() };
    const navigation = await renderSwap();
    await fireEvent.press(await screen.findByTestId('cup-swap-cancel'));
    expect(swap()).not.toHaveBeenCalled();
    expect(navigation.popTo).toHaveBeenCalledWith('CupManage', { cupId: 'cup-1' });
  });

  it('uten nett: feilen, med «Prøv igjen»', async () => {
    mockView = { ok: false, reason: 'offline' };
    await renderSwap();
    expect(await screen.findByTestId('cup-swap-failed')).toHaveTextContent(/Du trenger nett/);
    expect(screen.getByTestId('cup-swap-retry')).toBeTruthy();
  });
});

// #2752: bekreftelsen før et utkast slettes (Type C).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { deleteCup, fetchCupDeletePreview } from '../data/cupSetup';
import type { ScreenProps } from '../navigation';
import { CupDelete } from './CupDelete';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/cupSetup', () => ({
  fetchCupDeletePreview: jest.fn(),
  deleteCup: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));

const preview = (over = {}) => ({
  name: 'Klubbmesterskapet',
  team1Name: 'Team Nord',
  team2Name: 'Team Sør',
  draft: true,
  matchCount: 4,
  keptCount: 0,
  ...over,
});
const answer = (value: object) => (fetchCupDeletePreview as jest.Mock).mockResolvedValue(value);

async function renderScreen(focused = true) {
  const params = { cupId: 'cup-1' };
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    isFocused: jest.fn(() => focused),
    getState: () => ({
      index: 2,
      routes: [{ name: 'Home' }, { name: 'Cup', params }, { name: 'CupDelete', params }],
    }),
  };
  await render(<CupDelete {...({ navigation, route: { key: 'd', name: 'CupDelete', params } } as unknown as ScreenProps<'CupDelete'>)} />);
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
  answer({ ok: true, view: preview() });
});

describe('CupDelete', () => {
  it('spør med nettets ord, og sletter først på knappen', async () => {
    await renderScreen();
    expect(screen.getByTestId('cup-delete-title')).toHaveTextContent('Slett «Klubbmesterskapet»?');
    expect(screen.getByText('Team Nord mot Team Sør')).toBeTruthy();
    expect(screen.getByTestId('cup-delete-warning')).toBeTruthy();
    expect(screen.getByTestId('cup-delete-matches')).toHaveTextContent('4 genererte matcher som ikke er spilt slettes for alltid.');
    expect(screen.queryByTestId('cup-delete-kept')).toBeNull();
    expect(deleteCup).not.toHaveBeenCalled();
  });

  it('uten matcher nevnes de ikke', async () => {
    answer({ ok: true, view: preview({ matchCount: 0 }) });
    await renderScreen();
    expect(screen.queryByTestId('cup-delete-matches')).toBeNull();
  });

  it('spilte kamper som blir stående, står for seg, som på nettet', async () => {
    answer({ ok: true, view: preview({ keptCount: 1 }) });
    await renderScreen();
    expect(screen.getByTestId('cup-delete-kept')).toHaveTextContent('1 spilte match forblir som frittstående spill (cup-koblingen fjernes).');
  });

  it('sletter, og ender på Hjem med kvitteringen', async () => {
    const navigation = await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-delete-submit'));
    expect(deleteCup).toHaveBeenCalledWith('cup-1');
    expect(navigation.popTo).toHaveBeenCalledWith('Home', { deletedCup: 'Klubbmesterskapet' });
  });

  it('svaret gikk tapt, og cupen er borte ved nytt trykk: det er det du ville', async () => {
    (deleteCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'not_found' });
    const navigation = await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-delete-submit'));
    expect(navigation.popTo).toHaveBeenCalledWith('Home', { deletedCup: 'Klubbmesterskapet' });
  });

  it('to trykk før skjermen er tegnet på nytt: ett kall', async () => {
    let finish: (value: { ok: true }) => void = () => {};
    (deleteCup as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderScreen();
    const button = screen.getByTestId('cup-delete-submit');
    await act(async () => {
      button.props.onClick?.({ preventDefault() {} });
      button.props.onClick?.({ preventDefault() {} });
    });
    expect(deleteCup).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('cup-delete-submit')).toHaveTextContent('Sletter …');
    expect(screen.getByTestId('cup-delete-submit')).toBeDisabled();
    expect(screen.getByTestId('cup-delete-cancel')).toBeDisabled();
    await act(async () => finish({ ok: true }));
  });

  it('har du gått tilbake mens svaret var på vei, står skjermen du er på i ro', async () => {
    const navigation = await renderScreen(false);
    await fireEvent.press(screen.getByTestId('cup-delete-submit'));
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('startet imens: sier det, og knappen er borte', async () => {
    (deleteCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'not_draft' });
    const navigation = await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-delete-submit'));
    expect(screen.getByTestId('cup-delete-locked')).toHaveTextContent(/Cupen er startet/);
    expect(screen.queryByTestId('cup-delete-submit')).toBeNull();
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('allerede startet når skjermen åpner: ingen knapp', async () => {
    answer({ ok: true, view: preview({ draft: false }) });
    await renderScreen();
    expect(screen.getByTestId('cup-delete-locked')).toBeTruthy();
    expect(screen.queryByTestId('cup-delete-submit')).toBeNull();
  });

  it.each([
    ['delete_failed', 'Slettingen feilet. Prøv igjen om litt.'],
    ['network', /Sjekk nettet/],
  ])('et nei (%s) står over knappen, og knappen kan trykkes igjen', async (reason, text) => {
    (deleteCup as jest.Mock).mockResolvedValueOnce({ ok: false, reason });
    const navigation = await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-delete-submit'));
    expect(screen.getByTestId('cup-delete-error')).toHaveTextContent(text);
    expect(screen.getByTestId('cup-delete-submit')).toBeEnabled();
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('«Avbryt» går tilbake til cupen, uten kall', async () => {
    const navigation = await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-delete-cancel'));
    expect(navigation.popTo).toHaveBeenCalledWith('Cup', { cupId: 'cup-1' });
    expect(deleteCup).not.toHaveBeenCalled();
  });

  it('lesingen feiler: «Prøv igjen»', async () => {
    answer({ ok: false, reason: 'offline' });
    await renderScreen();
    expect(screen.getByTestId('cup-delete-failed')).toHaveTextContent(/Sjekk nettet/);
    answer({ ok: true, view: preview() });
    await fireEvent.press(screen.getByTestId('cup-delete-retry'));
    expect(screen.getByTestId('cup-delete-title')).toBeTruthy();
  });

  it.each(['not_found', 'not_manager'])('%s: ingen «Prøv igjen»', async (reason) => {
    answer({ ok: false, reason });
    await renderScreen();
    expect(screen.getByTestId('cup-delete-failed')).toBeTruthy();
    expect(screen.queryByTestId('cup-delete-retry')).toBeNull();
  });
});

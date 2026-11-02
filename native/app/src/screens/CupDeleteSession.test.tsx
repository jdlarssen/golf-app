// #2752: bekreftelsen før en økt i uttaket slettes (Type C).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { deleteCupLineupSession } from '../data/cupSetup';
import type { ScreenProps } from '../navigation';
import { CupDeleteSession } from './CupDeleteSession';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/cupSetup', () => ({ deleteCupLineupSession: jest.fn(async () => ({ ok: true })) }));

async function renderScreen(over: Record<string, unknown> = {}, focused = true) {
  const params = { cupId: 'cup-1', sessionId: 'okt', format: 'foursomes_matchplay', slotCount: 2, delivered: 2, ...over };
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    isFocused: jest.fn(() => focused),
    getState: () => ({
      index: 2,
      routes: [{ name: 'Cup', params: { cupId: 'cup-1' } }, { name: 'CupLineup', params: { cupId: 'cup-1' } }, { name: 'CupDeleteSession', params }],
    }),
  };
  await render(
    <CupDeleteSession {...({ navigation, route: { key: 's', name: 'CupDeleteSession', params } } as unknown as ScreenProps<'CupDeleteSession'>)} />,
  );
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CupDeleteSession', () => {
  it('sier hvilken økt det gjelder, og sletter først på knappen', async () => {
    await renderScreen();
    expect(screen.getByTestId('cup-delete-session-what')).toHaveTextContent('Foursomes: 2 kamper');
    expect(deleteCupLineupSession).not.toHaveBeenCalled();
  });

  it.each([
    [0, 'Ingen lag har levert ennå.'],
    [1, 'Ett lag har levert. Uttaket blir borte.'],
    [2, 'Begge lag har levert. Uttakene blir borte.'],
  ])('%s lag har levert: det står', async (delivered, text) => {
    await renderScreen({ delivered });
    expect(screen.getByTestId('cup-delete-session-delivered')).toHaveTextContent(text);
  });

  it('sletter, og går tilbake til tavla', async () => {
    const navigation = await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-delete-session-submit'));
    expect(deleteCupLineupSession).toHaveBeenCalledWith('cup-1', 'okt');
    expect(navigation.popTo).toHaveBeenCalledWith('CupLineup', { cupId: 'cup-1' });
  });

  it('to trykk før skjermen er tegnet på nytt: ett kall', async () => {
    let finish: (value: { ok: true }) => void = () => {};
    (deleteCupLineupSession as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderScreen();
    const button = screen.getByTestId('cup-delete-session-submit');
    await act(async () => {
      button.props.onClick?.({ preventDefault() {} });
      button.props.onClick?.({ preventDefault() {} });
    });
    expect(deleteCupLineupSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('cup-delete-session-submit')).toHaveTextContent('Sletter …');
    await act(async () => finish({ ok: true }));
  });

  it('avdekket imens: nettets setning, og du blir stående', async () => {
    (deleteCupLineupSession as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'lineup_revealed' });
    const navigation = await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-delete-session-submit'));
    expect(screen.getByTestId('cup-delete-session-error')).toHaveTextContent('Økten er allerede avdekket.');
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('«Sjekk nettet» bare når det er nettet', async () => {
    (deleteCupLineupSession as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'network' });
    await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-delete-session-submit'));
    expect(screen.getByTestId('cup-delete-session-error')).toHaveTextContent(/Sjekk nettet/);
  });

  it('har du gått tilbake mens svaret var på vei, står skjermen du er på i ro', async () => {
    const navigation = await renderScreen({}, false);
    await fireEvent.press(screen.getByTestId('cup-delete-session-submit'));
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('«Avbryt» går tilbake uten kall', async () => {
    const navigation = await renderScreen();
    await fireEvent.press(screen.getByTestId('cup-delete-session-cancel'));
    expect(navigation.popTo).toHaveBeenCalledWith('CupLineup', { cupId: 'cup-1' });
    expect(deleteCupLineupSession).not.toHaveBeenCalled();
  });
});

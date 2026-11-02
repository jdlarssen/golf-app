// #2752: bekreftelsen før en spiller fjernes (Type C).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { removeCupParticipant } from '../data/cupSetup';
import type { ScreenProps } from '../navigation';
import { CupRemovePlayer } from './CupRemovePlayer';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/cupSetup', () => ({ removeCupParticipant: jest.fn(async () => ({ ok: true })) }));

async function renderRemove(over: Record<string, unknown> = {}) {
  const params = {
    cupId: 'cup-1',
    userId: 'per',
    name: 'Per Putter',
    cupName: 'Klubbmesterskapet',
    captain: false,
    returnTo: 'CupParticipants',
    ...over,
  };
  const navigation = {
    navigate: jest.fn(),
    popTo: jest.fn(),
    replace: jest.fn(),
    isFocused: jest.fn(() => true),
    getState: () => ({
      index: 3,
      routes: [
        { name: 'Home' },
        { name: 'Cup', params: { cupId: 'cup-1' } },
        { name: params.returnTo, params: { cupId: 'cup-1' } },
        { name: 'CupRemovePlayer', params },
      ],
    }),
  };
  await render(
    <CupRemovePlayer {...({ navigation, route: { key: 'r', name: 'CupRemovePlayer', params } } as unknown as ScreenProps<'CupRemovePlayer'>)} />,
  );
  return navigation;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CupRemovePlayer', () => {
  it('spør med nettets ord, og fjerner først på knappen', async () => {
    await renderRemove();
    expect(screen.getByTestId('cup-remove-title')).toHaveTextContent('Fjerne Per Putter fra Klubbmesterskapet?');
    expect(screen.getByText('Per forsvinner fra deltakerlista i cupen.')).toBeTruthy();
    expect(screen.getByTestId('cup-remove-submit')).toHaveTextContent('Ja, fjern Per');
    expect(removeCupParticipant).not.toHaveBeenCalled();
    expect(screen.queryByTestId('cup-remove-captain')).toBeNull();
  });

  it('en kaptein: sier at laget står uten', async () => {
    await renderRemove({ captain: true });
    expect(screen.getByTestId('cup-remove-captain')).toHaveTextContent('Laget står da uten kaptein.');
  });

  it('fjerner, og går tilbake dit du kom fra med kvitteringen', async () => {
    const navigation = await renderRemove();
    await fireEvent.press(screen.getByTestId('cup-remove-submit'));
    expect(removeCupParticipant).toHaveBeenCalledWith('cup-1', 'per');
    expect(navigation.popTo).toHaveBeenCalledWith('CupParticipants', { cupId: 'cup-1', notice: 'participant_removed' });
  });

  it('et svar etter at du gikk tilbake: skjermen du står på, får stå i ro', async () => {
    const navigation = await renderRemove({ returnTo: 'CreateCup' });
    navigation.isFocused.mockReturnValue(false);
    await fireEvent.press(screen.getByTestId('cup-remove-submit'));
    expect(removeCupParticipant).toHaveBeenCalledWith('cup-1', 'per');
    expect(navigation.popTo).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('fra veiviseren går den tilbake til veiviseren', async () => {
    const navigation = await renderRemove({ returnTo: 'CreateCup' });
    await fireEvent.press(screen.getByTestId('cup-remove-submit'));
    expect(navigation.popTo).toHaveBeenCalledWith('CreateCup', { cupId: 'cup-1', notice: 'participant_removed' });
  });

  it('«Avbryt» går tilbake uten å skrive', async () => {
    const navigation = await renderRemove();
    await fireEvent.press(screen.getByTestId('cup-remove-cancel'));
    expect(removeCupParticipant).not.toHaveBeenCalled();
    expect(navigation.popTo).toHaveBeenCalledWith('CupParticipants', { cupId: 'cup-1', notice: undefined });
  });

  it('cupen har startet imens: låst, uten knappen', async () => {
    (removeCupParticipant as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'not_draft' });
    await renderRemove();
    await fireEvent.press(screen.getByTestId('cup-remove-submit'));
    expect(screen.getByTestId('cup-remove-locked')).toHaveTextContent(/Påmeldingen er låst/);
    expect(screen.queryByTestId('cup-remove-submit')).toBeNull();
  });

  it('uten nett: setningen, og du står igjen på skjermen', async () => {
    (removeCupParticipant as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'offline' });
    const navigation = await renderRemove();
    await fireEvent.press(screen.getByTestId('cup-remove-submit'));
    expect(screen.getByTestId('cup-remove-error')).toHaveTextContent(/trenger nett/);
    expect(navigation.popTo).not.toHaveBeenCalled();
  });
});

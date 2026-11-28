// #3019: lista «Blokkerte» (tegning 12 og 13), Type C: radene, tom liste og
// «Opphev» med spørsmålet først.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BlockedUsers } from './BlockedUsers';
import { listBlocks, unblockUser } from '../data/blocks';
import type { ScreenProps } from '../navigation';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('../data/blocks', () => ({ listBlocks: jest.fn(), unblockUser: jest.fn() }));

const listMock = listBlocks as jest.Mock;
const unblockMock = unblockUser as jest.Mock;
const props = { navigation: {}, route: { params: undefined } } as unknown as ScreenProps<'BlockedUsers'>;
const KARI = { userId: 'kari', name: 'Kari Nordmann', blockedAt: '2026-11-28T10:00:00Z' };

beforeEach(() => jest.clearAllMocks());

describe('BlockedUsers', () => {
  it('viser hver blokkert med dato, og «Opphev» spør før den sletter', async () => {
    listMock.mockResolvedValueOnce({ ok: true, blocks: [KARI] }).mockResolvedValueOnce({ ok: true, blocks: [] });
    unblockMock.mockResolvedValue({ ok: true });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    await render(<BlockedUsers {...props} />);
    expect(await screen.findByText('Kari Nordmann')).toBeTruthy();
    expect(screen.getByText('Blokkert 28. november')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('blocked-user-unblock-kari'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(unblockMock).toHaveBeenCalledWith('kari');
    expect(await screen.findByTestId('blocked-users-empty')).toBeTruthy();
    alert.mockRestore();
  });

  it('en oppheving som ikke gikk, sier det og henter lista på nytt', async () => {
    listMock.mockResolvedValue({ ok: true, blocks: [KARI] });
    unblockMock.mockResolvedValue({ ok: false, reason: 'failed' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    await render(<BlockedUsers {...props} />);
    await fireEvent.press(await screen.findByTestId('blocked-user-unblock-kari'));
    expect(await screen.findByTestId('blocked-users-error')).toBeTruthy();
    expect(listMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Kari Nordmann')).toBeTruthy();
    alert.mockRestore();
  });

  it('uten nett står lista som før, med linja om nettet', async () => {
    listMock.mockResolvedValue({ ok: true, blocks: [KARI] });
    unblockMock.mockResolvedValue({ ok: false, reason: 'offline' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    await render(<BlockedUsers {...props} />);
    await fireEvent.press(await screen.findByTestId('blocked-user-unblock-kari'));
    expect(await screen.findByTestId('blocked-users-error')).toBeTruthy();
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Kari Nordmann')).toBeTruthy();
    alert.mockRestore();
  });

  it('en feilet lesing sier det, med «Prøv igjen», og viser ikke en tom liste', async () => {
    listMock.mockResolvedValue({ ok: false, reason: 'failed' });
    await render(<BlockedUsers {...props} />);
    expect(await screen.findByTestId('blocked-users-failed')).toBeTruthy();
    expect(screen.queryByTestId('blocked-users-empty')).toBeNull();
  });
});

// #3019: vilkårene står foran appen til spilleren har sagt ja én gang.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { Alert, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TermsGate } from './TermsGate';
import { saveTermsAccepted } from '../data/terms';
import { rememberTermsAccepted, termsStepFor } from '../data/termsGate';
import { logOut } from '../data/logout';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../data/terms', () => ({ saveTermsAccepted: jest.fn() }));
jest.mock('../data/termsGate', () => ({ termsStepFor: jest.fn(), rememberTermsAccepted: jest.fn() }));
jest.mock('../data/logout', () => ({ logOut: jest.fn() }));
jest.mock('../lib/webLink', () => ({ ...jest.requireActual('../lib/webLink'), openWeb: jest.fn(async () => ({ ok: true })) }));

const stepMock = termsStepFor as jest.Mock;
const saveMock = saveTermsAccepted as jest.Mock;

beforeEach(() => jest.clearAllMocks());

const app = <Text testID="the-app">app</Text>;

describe('TermsGate', () => {
  it('slipper rett inn når spilleren alt har svart', async () => {
    stepMock.mockResolvedValue(false);
    await render(<TermsGate userId="me">{app}</TermsGate>);
    expect(await screen.findByTestId('the-app')).toBeTruthy();
  });

  it('«Jeg godtar» lagrer, husker og slipper inn', async () => {
    stepMock.mockResolvedValue(true);
    saveMock.mockResolvedValue({ ok: true });
    await render(<TermsGate userId="me">{app}</TermsGate>);
    await fireEvent.press(await screen.findByTestId('terms-accept'));
    expect(saveMock).toHaveBeenCalledWith('me');
    expect(rememberTermsAccepted).toHaveBeenCalledWith('me');
    expect(await screen.findByTestId('the-app')).toBeTruthy();
  });

  it('en lagring som feiler, holder spørsmålet og sier fra', async () => {
    stepMock.mockResolvedValue(true);
    saveMock.mockResolvedValue({ ok: false });
    await render(<TermsGate userId="me">{app}</TermsGate>);
    await fireEvent.press(await screen.findByTestId('terms-accept'));
    expect(await screen.findByTestId('terms-error')).toBeTruthy();
    expect(screen.queryByTestId('the-app')).toBeNull();
  });

  it('«Nei, logg meg ut» logger ut og lagrer ingenting', async () => {
    stepMock.mockResolvedValue(true);
    (logOut as jest.Mock).mockResolvedValue({ ok: true });
    await render(<TermsGate userId="me">{app}</TermsGate>);
    await fireEvent.press(await screen.findByTestId('terms-decline'));
    expect(logOut).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('slag som ikke er sendt, gir samme spørsmål som «Logg ut», og «Logg ut likevel» beholder dem', async () => {
    stepMock.mockResolvedValue(true);
    (logOut as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'unsent', pending: 3 }).mockResolvedValueOnce({ ok: true });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await render(<TermsGate userId="me">{app}</TermsGate>);
    await fireEvent.press(await screen.findByTestId('terms-decline'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(logOut).toHaveBeenLastCalledWith({ keepUnsent: true });
    expect(screen.queryByTestId('terms-error')).toBeNull();
    alert.mockRestore();
  });

  it('en utlogging som ikke gikk, sier det, ikke at svaret ikke ble lagret', async () => {
    stepMock.mockResolvedValue(true);
    (logOut as jest.Mock).mockResolvedValue({ ok: false, reason: 'signout-failed' });
    await render(<TermsGate userId="me">{app}</TermsGate>);
    await fireEvent.press(await screen.findByTestId('terms-decline'));
    expect((await screen.findByTestId('terms-error')).props.children).not.toBe('Fikk ikke lagret svaret. Prøv igjen.');
    expect(screen.getByTestId('terms-screen')).toBeTruthy();
  });
});

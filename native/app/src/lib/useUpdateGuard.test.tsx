// native/app/src/lib/useUpdateGuard.test.tsx
// Native #2619: Type C. Det en render kan bevise om oppdateringsvakta: dialogen
// kommer med riktig tekst og én knapp som ikke kan avbrytes, knappen åpner
// riktig butikk (med https-reserve på Android), og dialogen kommer igjen ved
// neste forgrunn. Sammenligningen selv er Type A i `updateGuard.test.ts`.
import { renderHook, waitFor } from '@testing-library/react-native';
import { Alert, Linking, type AlertButton } from 'react-native';
import { APP_STORE_URL, GOOGLE_PLAY_MARKET_URL, GOOGLE_PLAY_URL } from '@/lib/app/storeLinks';
import { fetchMinVersionBody } from '../data/updateCheck';
import { addForegroundListener } from '../data/syncTriggers';
import { readAppBuild } from './appBuild';
import { UPDATE_GUARD_TEXT } from './updateGuardCopy';
import { useUpdateGuard } from './useUpdateGuard';

jest.mock('../data/updateCheck', () => ({ fetchMinVersionBody: jest.fn() }));
jest.mock('../data/syncTriggers', () => ({ addForegroundListener: jest.fn() }));
jest.mock('./appBuild', () => ({ readAppBuild: jest.fn() }));

const OLD = { ios: { minBuild: 9 }, android: { minVersionCode: 9 } };
const FINE = { ios: { minBuild: 1 }, android: { minVersionCode: 1 } };

let foreground: () => void;
const stopListening = jest.fn();
let alertSpy: jest.SpyInstance;
let openUrl: jest.SpyInstance;

function build(platform: 'ios' | 'android', n: number | null) {
  (readAppBuild as jest.Mock).mockReturnValue({ platform, version: '1.2.0', build: n });
}

function pressedButton(): AlertButton {
  const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
  return buttons[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  (addForegroundListener as jest.Mock).mockImplementation((cb: () => void) => {
    foreground = cb;
    return stopListening;
  });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => jest.restoreAllMocks());

describe('useUpdateGuard', () => {
  it('viser en dialog som ikke kan avbrytes, med én knapp «Oppdater»', async () => {
    build('ios', 5);
    (fetchMinVersionBody as jest.Mock).mockResolvedValue(OLD);

    await renderHook(() => useUpdateGuard(true));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    const [title, body, buttons, options] = alertSpy.mock.calls[0];
    expect(title).toBe(UPDATE_GUARD_TEXT.title);
    expect(body).toBe(UPDATE_GUARD_TEXT.body);
    expect(buttons).toHaveLength(1);
    expect((buttons as AlertButton[])[0].text).toBe('Oppdater');
    expect(options).toEqual({ cancelable: false });
  });

  it('åpner App Store på iOS', async () => {
    build('ios', 5);
    (fetchMinVersionBody as jest.Mock).mockResolvedValue(OLD);
    await renderHook(() => useUpdateGuard(true));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    pressedButton().onPress?.();

    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(APP_STORE_URL));
  });

  it('åpner Play-appen på Android, og nettsiden hvis market:// ikke finnes', async () => {
    build('android', 5);
    (fetchMinVersionBody as jest.Mock).mockResolvedValue(OLD);
    openUrl.mockRejectedValueOnce(new Error('ingen handler'));
    await renderHook(() => useUpdateGuard(true));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    pressedButton().onPress?.();

    await waitFor(() => expect(openUrl).toHaveBeenCalledTimes(2));
    expect(openUrl).toHaveBeenNthCalledWith(1, GOOGLE_PLAY_MARKET_URL);
    expect(openUrl).toHaveBeenNthCalledWith(2, GOOGLE_PLAY_URL);
  });

  it('viser ingenting når bygget er godt nok, når nettet feiler eller byggnummeret er ukjent', async () => {
    build('ios', 5);
    (fetchMinVersionBody as jest.Mock).mockResolvedValue(FINE);
    const fine = await renderHook(() => useUpdateGuard(true));
    await waitFor(() => expect(fetchMinVersionBody).toHaveBeenCalledTimes(1));
    await fine.unmount();

    (fetchMinVersionBody as jest.Mock).mockResolvedValue(null);
    const offline = await renderHook(() => useUpdateGuard(true));
    await waitFor(() => expect(fetchMinVersionBody).toHaveBeenCalledTimes(2));
    await offline.unmount();

    build('ios', null);
    await renderHook(() => useUpdateGuard(true));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(fetchMinVersionBody).toHaveBeenCalledTimes(2);
  });

  it('venter med å sjekke til appen er klar', async () => {
    build('ios', 5);
    await renderHook(() => useUpdateGuard(false));
    expect(fetchMinVersionBody).not.toHaveBeenCalled();
    expect(addForegroundListener).not.toHaveBeenCalled();
  });

  it('viser dialogen igjen ved neste forgrunn etter at den er trykket bort, men ikke oppå seg selv', async () => {
    build('ios', 5);
    (fetchMinVersionBody as jest.Mock).mockResolvedValue(OLD);
    await renderHook(() => useUpdateGuard(true));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));

    foreground();
    await Promise.resolve();
    expect(alertSpy).toHaveBeenCalledTimes(1);

    pressedButton().onPress?.();
    foreground();
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2));
    expect(fetchMinVersionBody).toHaveBeenCalledTimes(1);
  });

  it('slutter å lytte når komponenten går', async () => {
    build('ios', 5);
    (fetchMinVersionBody as jest.Mock).mockResolvedValue(FINE);
    const hook = await renderHook(() => useUpdateGuard(true));
    await hook.unmount();
    expect(stopListening).toHaveBeenCalledTimes(1);
  });
});

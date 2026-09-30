// #2256: «Varsler og tema» (Type C).
//
// Hva valget gjør med appen (Appearance, lagringen, utlogging) er
// `lib/themePreference.test.ts` sitt, og registreringen av telefonen er
// `data/pushDevice.test.ts` sin. Her låses koblingene: det lagrede temaet er
// merket, et trykk flytter merket og lagrer, og en lagring som feilet står
// under valgene. For varslene: ingen varsel-del uten støtte, bryteren slår på
// og av, et nei fra iOS gir «Åpne Innstillinger», og en feil står under kortet.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { readPushState, turnOffPush, turnOnPush } from '../data/pushDevice';
import { loadThemePreference, saveThemePreference } from '../lib/themePreference';
import { PROFILE_TEXT } from '../lib/profileCopy';
import type { ScreenProps } from '../navigation';
import { NotificationsAndTheme } from './NotificationsAndTheme';

jest.mock('../lib/themePreference', () => ({
  ...jest.requireActual('../lib/themePreference'),
  loadThemePreference: jest.fn(),
  saveThemePreference: jest.fn(),
}));

jest.mock('../data/pushDevice', () => ({
  readPushState: jest.fn(),
  turnOnPush: jest.fn(),
  turnOffPush: jest.fn(),
}));

const readPushMock = readPushState as jest.Mock;
const onMock = turnOnPush as jest.Mock;
const offMock = turnOffPush as jest.Mock;
const loadMock = loadThemePreference as jest.Mock;
const saveMock = saveThemePreference as jest.Mock;

describe('NotificationsAndTheme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadMock.mockResolvedValue('system');
    saveMock.mockResolvedValue(true);
    readPushMock.mockResolvedValue('unsupported');
  });

  async function renderScreen() {
    await render(
      <NotificationsAndTheme
        {...({ navigation: {}, route: { params: undefined } } as unknown as ScreenProps<'NotificationsAndTheme'>)}
      />,
    );
  }

  it('slår varsler på og av med bryteren, og sier fra når det ikke gikk', async () => {
    readPushMock.mockResolvedValue('off');
    onMock.mockResolvedValueOnce({ ok: true });
    offMock.mockResolvedValueOnce({ ok: false, reason: 'failed' });
    await renderScreen();

    expect(await screen.findByTestId('push-section')).toBeTruthy();
    expect(screen.getByTestId('push-status')).toHaveTextContent(PROFILE_TEXT.pushOff);

    await act(async () => {
      fireEvent(screen.getByTestId('push-switch'), 'valueChange', true);
    });
    expect(onMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('push-status')).toHaveTextContent(PROFILE_TEXT.pushOn);

    await act(async () => {
      fireEvent(screen.getByTestId('push-switch'), 'valueChange', false);
    });
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('push-status')).toHaveTextContent(PROFILE_TEXT.pushOn);
    expect(screen.getByTestId('push-error')).toHaveTextContent(PROFILE_TEXT.pushOffFailed);
  });

  it('viser «Åpne Innstillinger» når iOS har sagt nei', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    readPushMock.mockResolvedValue('off');
    onMock.mockResolvedValueOnce({ ok: false, reason: 'denied' });
    await renderScreen();

    await act(async () => {
      fireEvent(await screen.findByTestId('push-switch'), 'valueChange', true);
    });
    expect(screen.getByTestId('push-denied')).toHaveTextContent(PROFILE_TEXT.pushDenied, { exact: false });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushOpenSettings }));
    });
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });

  it('har ingen varsel-del uten støtte (Android, eller et bygg uten modulen)', async () => {
    await renderScreen();
    expect(await screen.findByTestId('theme-system-check')).toBeTruthy();
    expect(screen.queryByTestId('push-section')).toBeNull();
  });

  it('marks the stored choice, moves the mark on a tap, and says when it could not be kept', async () => {
    await render(
      <NotificationsAndTheme
        {...({ navigation: {}, route: { params: undefined } } as unknown as ScreenProps<'NotificationsAndTheme'>)}
      />,
    );

    expect(await screen.findByTestId('theme-system-check')).toBeTruthy();
    expect(screen.getByTestId('theme-system')).toBeSelected();
    expect(screen.getByTestId('theme-dark')).not.toBeSelected();

    await act(async () => {
      fireEvent.press(screen.getByTestId('theme-dark'));
    });
    expect(saveMock).toHaveBeenCalledWith('dark');
    expect(screen.getByTestId('theme-dark')).toBeSelected();
    expect(screen.queryByTestId('theme-system-check')).toBeNull();
    expect(screen.queryByTestId('theme-save-error')).toBeNull();

    saveMock.mockResolvedValueOnce(false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('theme-light'));
    });
    expect(screen.getByTestId('theme-save-error')).toHaveTextContent(PROFILE_TEXT.themeSaveFailedNote);
  });
});

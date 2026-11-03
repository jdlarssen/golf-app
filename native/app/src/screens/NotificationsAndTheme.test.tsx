// #2256: «Varsler og tema» (Type C).
//
// Hva valget gjør med appen (Appearance, lagringen, utlogging) er
// `lib/themePreference.test.ts` sitt, og registreringen av telefonen er
// `data/pushDevice.test.ts` sin. Her låses koblingene: det lagrede temaet er
// merket, et trykk flytter merket og lagrer, og en lagring som feilet står
// under valgene. For varslene: ingen varsel-del uten støtte, bryteren slår på
// og av, et nei fra iOS gir «Åpne Innstillinger», og en feil står under kortet.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';
import { readPushState, turnOffPush, turnOnPush } from '../data/pushDevice';
import { loadThemePreference, saveThemePreference } from '../lib/themePreference';
import { PROFILE_TEXT } from '../lib/profileCopy';
import type { ScreenProps } from '../navigation';
import { NotificationsAndTheme } from './NotificationsAndTheme';
import { markPushPromptAnswered } from '../data/pushPrompt';
import { setBottomInset, bottomPadding } from '../test/safeAreaMock';

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
jest.mock('../data/pushPrompt', () => ({ markPushPromptAnswered: jest.fn() }));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());

const readPushMock = readPushState as jest.Mock;
const onMock = turnOnPush as jest.Mock;
const offMock = turnOffPush as jest.Mock;
const loadMock = loadThemePreference as jest.Mock;
const saveMock = saveThemePreference as jest.Mock;

describe('NotificationsAndTheme', () => {
  // `Platform.OS` skal ikke lekke videre om en assert feiler midt i en test.
  let platform: { restore(): void } | null = null;
  afterEach(() => {
    platform?.restore();
    platform = null;
  });

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

  // #1954 D3: med tre knapper på Android ligger navigasjonslinja over bunnen av
  // skjermen. Innholdet skal ende over den, med samme luft som før.
  it('legger systemlinja til bunnluften', async () => {
    setBottomInset(48);
    try {
      await renderScreen();
      await screen.findByTestId('theme-system-check');
      expect(bottomPadding('notifications-theme-screen')).toBe(32 + 48);
    } finally {
      setBottomInset(0);
    }
  });

  it('slår varsler på og av med bryteren, og sier fra når det ikke gikk', async () => {
    readPushMock.mockResolvedValue('off');
    onMock.mockResolvedValueOnce({ ok: true });
    offMock.mockResolvedValueOnce({ ok: false, reason: 'failed' });
    await renderScreen();

    expect(await screen.findByTestId('push-section')).toBeTruthy();
    expect(screen.getByTestId('push-status')).toHaveTextContent(PROFILE_TEXT.pushOff);

    await act(async () => {
      fireEvent.press(screen.getByRole('switch', { name: PROFILE_TEXT.pushTitle }));
    });
    expect(onMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('push-status')).toHaveTextContent('På · iPhone');
    // Bryteren sier «på» til skjermleseren.
    expect(screen.getByRole('switch', { name: PROFILE_TEXT.pushTitle })).toBeChecked();

    await act(async () => {
      fireEvent.press(screen.getByRole('switch', { name: PROFILE_TEXT.pushTitle }));
    });
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('push-status')).toHaveTextContent('På · iPhone');
    expect(screen.getByTestId('push-error')).toHaveTextContent(PROFILE_TEXT.pushOffFailed);
  });

  it('viser «Åpne Innstillinger» når iOS har sagt nei', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    readPushMock.mockResolvedValue('off');
    onMock.mockResolvedValueOnce({ ok: false, reason: 'denied' });
    await renderScreen();

    await act(async () => {
      fireEvent.press(await screen.findByRole('switch', { name: PROFILE_TEXT.pushTitle }));
    });
    expect(screen.getByTestId('push-denied')).toHaveTextContent(PROFILE_TEXT.pushDenied, { exact: false });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushOpenSettings }));
    });
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });

  it('har ingen varsel-del i et bygg uten modulen', async () => {
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

  it.each(['ios', 'android'] as const)('heter «Varsler» på %s, med «Tema» som etikett over valgene', async (os) => {
    platform = jest.replaceProperty(Platform, 'OS', os);
    await renderScreen();
    expect(await screen.findByTestId('theme-system-check')).toBeTruthy();
    expect(screen.getByText(PROFILE_TEXT.notificationsHeading)).toBeTruthy();
    expect(screen.getAllByText('Tema')).toHaveLength(1);
  });

  // #2758: den som bruker bryteren, har svart, så kortet på Hjem kommer ikke.
  it('lagrer svaret når bryteren brukes, og bare da', async () => {
    readPushMock.mockResolvedValue('off');
    onMock.mockResolvedValue({ ok: true });
    await renderScreen();
    await screen.findByTestId('push-section');
    expect(markPushPromptAnswered).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByRole('switch', { name: PROFILE_TEXT.pushTitle }));
    });

    expect(markPushPromptAnswered).toHaveBeenCalledTimes(1);
  });

  // #2758: statuslinja sier hvilken telefon varslene står på.
  it.each([
    ['ios', 'På · iPhone'],
    ['android', 'På · Android'],
  ] as const)('viser på %s at varslene står på', async (os, label) => {
    platform = jest.replaceProperty(Platform, 'OS', os);
    readPushMock.mockResolvedValue('on');
    await renderScreen();

    expect(await screen.findByTestId('push-status')).toHaveTextContent(label);
  });

  // #2758: på Android kan et nei spørres om igjen. Det er ikke «nektet», så
  // bryteren står av og kan prøves på nytt, uten feilmelding.
  it('lar bryteren stå av etter et nei som kan spørres om igjen', async () => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    readPushMock.mockResolvedValue('off');
    onMock.mockResolvedValue({ ok: false, reason: 'declined' });
    await renderScreen();
    await screen.findByTestId('push-section');

    await act(async () => {
      fireEvent.press(screen.getByRole('switch', { name: PROFILE_TEXT.pushTitle }));
    });

    expect(screen.getByTestId('push-status')).toHaveTextContent(PROFILE_TEXT.pushOff);
    expect(screen.queryByTestId('push-denied')).toBeNull();
    expect(screen.queryByTestId('push-error')).toBeNull();
    expect(screen.getByRole('switch', { name: PROFILE_TEXT.pushTitle })).toBeEnabled();
  });
});

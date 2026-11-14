// #2256: «Varsler og tema» (Type C).
//
// Hva valget gjør med appen (Appearance, lagringen, utlogging) er
// `lib/themePreference.test.ts` sitt, og registreringen av telefonen er
// `data/pushDevice.test.ts` sin. Her låses koblingene: det lagrede temaet er
// merket, et trykk flytter merket og lagrer, og en lagring som feilet står
// under valgene. For varslene: ingen varsel-del uten støtte, bryteren slår på
// og av, et nei fra iOS gir «Åpne Innstillinger», og en feil står under kortet.
// For valgene (#2315, Varsler-D2): fire rader i tegningens rekkefølge,
// «Rundene dine» uten bryter, ingen brytere før valgene er lest, og en lagring
// som feilet, ruller tilbake og sier fra. Lesingen og skrivingen er
// `data/pushPreferences.test.ts` sin.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Linking, Platform } from 'react-native';
import { readPushState, turnOffPush, turnOnPush } from '../data/pushDevice';
import { fetchOwnPushPreferences, savePushPreferences } from '../data/pushPreferences';
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
jest.mock('../data/pushPreferences', () => ({
  fetchOwnPushPreferences: jest.fn(),
  savePushPreferences: jest.fn(),
}));
jest.mock('../session', () => ({ useSession: () => ({ userId: 'user-me' }) }));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());

const readPushMock = readPushState as jest.Mock;
const onMock = turnOnPush as jest.Mock;
const offMock = turnOffPush as jest.Mock;
const loadMock = loadThemePreference as jest.Mock;
const saveMock = saveThemePreference as jest.Mock;
const fetchPrefsMock = fetchOwnPushPreferences as jest.Mock;
const savePrefsMock = savePushPreferences as jest.Mock;

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
    fetchPrefsMock.mockResolvedValue({ mutedGroups: [], quietHours: false });
    savePrefsMock.mockResolvedValue({ ok: true });
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
      fireEvent.press(screen.getByRole('switch', { name: PROFILE_TEXT.pushSwitchLabel }));
    });
    expect(onMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('push-status')).toHaveTextContent('På · iPhone');
    // Bryteren sier «på» til skjermleseren.
    expect(screen.getByRole('switch', { name: PROFILE_TEXT.pushSwitchLabel })).toBeChecked();

    await act(async () => {
      fireEvent.press(screen.getByRole('switch', { name: PROFILE_TEXT.pushSwitchLabel }));
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
      fireEvent.press(await screen.findByRole('switch', { name: PROFILE_TEXT.pushSwitchLabel }));
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
      fireEvent.press(screen.getByRole('switch', { name: PROFILE_TEXT.pushSwitchLabel }));
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
      fireEvent.press(screen.getByRole('switch', { name: PROFILE_TEXT.pushSwitchLabel }));
    });

    expect(screen.getByTestId('push-status')).toHaveTextContent(PROFILE_TEXT.pushOff);
    expect(screen.queryByTestId('push-denied')).toBeNull();
    expect(screen.queryByTestId('push-error')).toBeNull();
    expect(screen.getByRole('switch', { name: PROFILE_TEXT.pushSwitchLabel })).toBeEnabled();
  });

  // ── #2315: hva som varsles og stille tid (Varsler-D2) ─────────────────────
  describe('valgene', () => {
    // Stripa og de grå flatene er skjult for skjermleseren, og RNTL hopper over
    // slike elementer uten dette valget.
    const HIDDEN = { includeHiddenElements: true };
    const groupSwitch = (name: string) => screen.findByRole('switch', { name });

    it('har fire rader i tegningens rekkefølge, og «Rundene dine» har «Alltid på» i stedet for bryter', async () => {
      await renderScreen();
      await groupSwitch('Scorekort');

      const rows = screen.getAllByTestId(/^push-group-(rounds|scorecards|friends|signups)$/);
      expect(rows.map((row) => row.props.testID)).toEqual([
        'push-group-rounds',
        'push-group-scorecards',
        'push-group-friends',
        'push-group-signups',
      ]);
      expect(screen.queryByText('Nytt fra Tørny')).toBeNull();
      expect(screen.queryByRole('switch', { name: 'Rundene dine' })).toBeNull();
      expect(screen.getByTestId('push-group-rounds-always')).toHaveTextContent(PROFILE_TEXT.pushAlwaysOn);
      for (const name of ['Scorekort', 'Venner', 'Påmeldinger', PROFILE_TEXT.quietTitle]) {
        expect(screen.getByRole('switch', { name })).toBeEnabled();
      }
      expect(screen.getByTestId('push-all-devices')).toHaveTextContent(PROFILE_TEXT.pushAllDevices);
    });

    it('viser ingen brytere før valgene er lest, bare grå flater der de kommer', async () => {
      fetchPrefsMock.mockReturnValue(new Promise(() => {}));
      await renderScreen();
      await screen.findByTestId('push-choices');

      expect(screen.queryAllByRole('switch', { name: /Scorekort|Venner|Påmeldinger|Ikke varsle om natta/ })).toEqual(
        [],
      );
      for (const id of ['scorecards', 'friends', 'signups']) {
        expect(screen.getByTestId(`push-group-${id}-switch-skeleton`, HIDDEN)).toBeTruthy();
      }
      expect(screen.getByTestId('quiet-hours-switch-skeleton', HIDDEN)).toBeTruthy();
      expect(screen.getAllByTestId('quiet-strip-night-off', HIDDEN)).toHaveLength(9);
    });

    it('viser valgene som er lagret', async () => {
      fetchPrefsMock.mockResolvedValue({ mutedGroups: ['signups'], quietHours: true });
      await renderScreen();

      expect(await groupSwitch('Påmeldinger')).not.toBeChecked();
      expect(screen.getByRole('switch', { name: 'Venner' })).toBeChecked();
      expect(screen.getByRole('switch', { name: PROFILE_TEXT.quietTitle })).toBeChecked();
      // Natta på stripa, kl. 22 til 07: ni timer.
      expect(screen.getAllByTestId('quiet-strip-night-on', HIDDEN)).toHaveLength(9);
      expect(screen.getAllByTestId('quiet-strip-day', HIDDEN)).toHaveLength(15);
    });

    it('lagrer hele tilstanden når en gruppe slås av', async () => {
      await renderScreen();

      await act(async () => {
        fireEvent.press(await groupSwitch('Venner'));
      });

      expect(savePrefsMock).toHaveBeenCalledWith('user-me', { mutedGroups: ['friends'], quietHours: false });
      expect(screen.getByRole('switch', { name: 'Venner' })).not.toBeChecked();
      expect(screen.queryByTestId('push-group-friends-error')).toBeNull();
    });

    it('lagrer stille tid', async () => {
      fetchPrefsMock.mockResolvedValue({ mutedGroups: ['friends'], quietHours: false });
      await renderScreen();

      await act(async () => {
        fireEvent.press(await groupSwitch(PROFILE_TEXT.quietTitle));
      });

      expect(savePrefsMock).toHaveBeenCalledWith('user-me', { mutedGroups: ['friends'], quietHours: true });
      expect(screen.getByRole('switch', { name: PROFILE_TEXT.quietTitle })).toBeChecked();
      expect(screen.getAllByTestId('quiet-strip-night-on', HIDDEN)).toHaveLength(9);
    });

    it('ruller tilbake og sier fra under raden når lagringen feilet', async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
      savePrefsMock.mockResolvedValueOnce({ ok: false });
      await renderScreen();

      await act(async () => {
        fireEvent.press(await groupSwitch('Venner'));
      });

      expect(screen.getByRole('switch', { name: 'Venner' })).toBeChecked();
      expect(screen.getByTestId('push-group-friends-error')).toHaveTextContent(PROFILE_TEXT.pushSaveFailed);
      expect(screen.queryByTestId('push-group-scorecards-error')).toBeNull();
      expect(announce).toHaveBeenCalledWith(PROFILE_TEXT.pushSaveFailed);

      // Neste trykk prøver igjen, og linja forsvinner når det går.
      await act(async () => {
        fireEvent.press(screen.getByRole('switch', { name: 'Venner' }));
      });
      expect(screen.getByRole('switch', { name: 'Venner' })).not.toBeChecked();
      expect(screen.queryByTestId('push-group-friends-error')).toBeNull();
      announce.mockRestore();
    });

    it('lar de andre bryterne vente mens en lagring går', async () => {
      let finish: (result: { ok: boolean }) => void = () => {};
      savePrefsMock.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      await renderScreen();

      await act(async () => {
        fireEvent.press(await groupSwitch('Venner'));
      });
      expect(screen.getByRole('switch', { name: 'Scorekort' })).toBeDisabled();

      await act(async () => {
        finish({ ok: true });
      });
      expect(screen.getByRole('switch', { name: 'Scorekort' })).toBeEnabled();
    });

    it('står uten brytere når valgene ikke kunne hentes, og «Prøv igjen» henter dem på nytt', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      fetchPrefsMock.mockRejectedValueOnce(new Error('uten nett'));
      await renderScreen();

      expect(await screen.findByTestId('push-choices-read-failed')).toHaveTextContent(PROFILE_TEXT.pushReadFailed, {
        exact: false,
      });
      expect(screen.queryByRole('switch', { name: 'Venner' })).toBeNull();
      expect(screen.queryByTestId('push-group-friends-switch-skeleton', HIDDEN)).toBeNull();
      expect(screen.getByTestId('push-group-rounds-always')).toBeTruthy();
      expect(screen.queryByTestId('push-all-devices')).toBeNull();

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: PROFILE_TEXT.pushRetry }));
      });

      expect(fetchPrefsMock).toHaveBeenCalledTimes(2);
      expect(await groupSwitch('Venner')).toBeChecked();
      expect(screen.queryByTestId('push-choices-read-failed')).toBeNull();
      (console.error as jest.Mock).mockRestore();
    });

    it.each(['unsupported', 'off', 'denied'] as const)('står også når telefonen er %s', async (state) => {
      readPushMock.mockResolvedValue(state);
      await renderScreen();

      expect(await groupSwitch('Venner')).toBeEnabled();
      expect(screen.getByTestId('push-all-devices')).toBeTruthy();
    });
  });
});

// #2256: «Personvern og konto» (Type C).
//
// Radene er flyttet uendret fra profilen, og testene følger med: e-posten står,
// personvernerklæringen åpner nettsiden (#2229) og sier hvorfor når det ikke
// går, og «Slett konto» bare navigerer til bekreftelsen.
//
// Profil v2 flyttet «Logg ut» og utviklerflaten hit fra profilen, med testene:
//
//  1. **Sync-lab finnes ikke i et butikk-bygg.** Den viktigste asserten i fila:
//     den er porten mot at en utviklerflate følger med appen ut i App Store.
//     Ikke skjult, ikke deaktivert — ikke i treet.
//  2. **«Logg ut» spør før den lar slag ligge igjen.** `logOut` svarer `unsent`,
//     skjermen viser dialogen, «Avbryt» setter raden tilbake slik den var, og
//     «Logg ut likevel» er det ENESTE som sender `keepUnsent`.
//  3. **Raden låser seg ikke når sesjonen overlevde.** `signout-failed` betyr at
//     spilleren fortsatt er innlogget; da må «Logger ut …» gå tilbake til «Logg
//     ut», for skjermen unmountes aldri — `SIGNED_OUT` kom jo ikke.
//
// Rekkefølgen drain → port → signOut → wipe er `data/logout.test.ts` sin.
//
// Flere renders og ikke én: staging-på og staging-av er to bygg, og en dialog
// som står åpen eller en feilet utlogging er tilstander skjermen ikke kan være
// i samtidig med utgangspunktet. Samme unntak som `Profile.test.tsx` hadde for
// de samme testene før flyttingen (Profil v2).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, type AlertButton } from 'react-native';
import {
  authenticateAsync,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
} from 'expo-local-authentication';
import { fetchOwnAiConsent, saveAiConsent } from '../data/aiConsent';
import { logOut } from '../data/logout';
import { AI_CONSENT_TEXT } from '../lib/aiConsentCopy';
import { APP_LOCK_STORAGE_KEY, getAppLock, loadAppLock, setAppLock } from '../lib/appLock';
import { PROFILE_TEXT, unsentStrokesWarning } from '../lib/profileCopy';
import { isStagingBuild } from '../lib/stagingGate';
import { describeWebLinkFailure, openWeb } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
import { setBottomInset, bottomPadding } from '../test/safeAreaMock';
import { AccountSettings } from './AccountSettings';

const mockEmail = 'spiller@example.com';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'user-me', email: mockEmail }),
}));
// Bare `openWeb` byttes ut: feilteksten skal komme fra den ekte
// `describeWebLinkFailure`, slik skjermen henter den.
jest.mock('../lib/webLink', () => ({
  ...jest.requireActual('../lib/webLink'),
  openWeb: jest.fn(),
}));
jest.mock('../data/logout', () => ({ logOut: jest.fn() }));
// #2561: the AI consent row reads and writes its own row.
jest.mock('../data/aiConsent', () => ({ fetchOwnAiConsent: jest.fn(), saveAiConsent: jest.fn() }));
jest.mock('../data/aiConsentGate', () => ({ rememberAiConsentAnswered: jest.fn() }));
jest.mock('../lib/stagingGate', () => ({ isStagingBuild: jest.fn() }));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
// #2841: låsen på appen. Telefonen har Face ID og svarer ja som standard.
jest.mock('expo-local-authentication', () => require('../test/localAuthMock').localAuthMock());
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

const openWebMock = openWeb as jest.Mock;
const logOutMock = logOut as jest.Mock;
const isStagingBuildMock = isStagingBuild as jest.Mock;
const navigate = jest.fn();

async function renderScreen() {
  await render(
    <AccountSettings
      {...({ navigation: { navigate }, route: { params: undefined } } as unknown as ScreenProps<'AccountSettings'>)}
    />,
  );
}

describe('AccountSettings', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    setAppLock(false);
    await loadAppLock();
    openWebMock.mockResolvedValue({ ok: true });
    logOutMock.mockResolvedValue({ ok: true });
    isStagingBuildMock.mockReturnValue(false);
    (fetchOwnAiConsent as jest.Mock).mockResolvedValue(true);
    (saveAiConsent as jest.Mock).mockResolvedValue({ ok: true });
    // Spionen settes for HVER test, ikke bare den som venter dialogen: uten den
    // er `Alert.alert` den ekte funksjonen, og «ble ikke spurt» kunne ikke
    // uttrykkes som en assert i det hele tatt.
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // #1954 D3: med tre knapper på Android ligger navigasjonslinja over bunnen av
  // skjermen. Innholdet skal ende over den, med samme luft som før.
  it('legger systemlinja til bunnluften', async () => {
    setBottomInset(48);
    try {
      await renderScreen();
      await screen.findByTestId('account-settings-screen');
      expect(bottomPadding('account-settings-screen')).toBe(20 + 48);
    } finally {
      setBottomInset(0);
    }
  });

  it('#2561: the AI switch shows the answer and saves when flipped, rolling back on failure', async () => {
    (saveAiConsent as jest.Mock).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await renderScreen();

    const aiSwitch = await screen.findByTestId('account-ai-consent-switch');
    expect(aiSwitch).toBeChecked();

    await act(async () => {
      fireEvent.press(aiSwitch);
    });
    expect(saveAiConsent).toHaveBeenLastCalledWith('user-me', false);
    expect(screen.getByTestId('account-ai-consent-switch')).not.toBeChecked();

    await act(async () => {
      fireEvent.press(screen.getByTestId('account-ai-consent-switch'));
    });
    expect(screen.getByTestId('account-ai-consent-switch')).not.toBeChecked();
    expect(screen.getByTestId('account-ai-consent-error')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(AI_CONSENT_TEXT.toggleFailed);
  });

  describe('#2841: lås med Face ID', () => {
    it('står øverst i «Du bestemmer», og navnet følger telefonen', async () => {
      await renderScreen();
      expect(await screen.findByText('Lås med Face ID')).toBeTruthy();
      expect(screen.getByText('Appen spør når den åpnes')).toBeTruthy();
      expect(screen.getByTestId('account-app-lock-switch')).not.toBeChecked();
      const list = screen.getByTestId('account-you-decide');
      expect(list.children[0]).toBe(screen.getByTestId('account-app-lock'));
    });

    it('finnes ikke uten maskinvare', async () => {
      (hasHardwareAsync as jest.Mock).mockResolvedValueOnce(false);
      await renderScreen();
      await screen.findByTestId('account-ai-consent-switch');
      expect(screen.queryByTestId('account-app-lock')).toBeNull();
    });

    it('slår seg på først når telefonen har sagt ja, og lagrer da nøkkelen', async () => {
      await renderScreen();
      await act(async () => {
        fireEvent.press(await screen.findByTestId('account-app-lock-switch'));
      });
      expect(authenticateAsync).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('account-app-lock-switch')).toBeChecked();
      expect(getAppLock()).toBe(true);
      expect(await AsyncStorage.getItem(APP_LOCK_STORAGE_KEY)).toBe('1');
    });

    it.each(['user_cancel', 'authentication_failed', 'lockout'] as const)(
      'står av og lagrer ingenting når spørsmålet feiler eller avbrytes (%s)',
      async (error) => {
        (authenticateAsync as jest.Mock).mockResolvedValueOnce({ success: false, error });
        await renderScreen();
        await act(async () => {
          fireEvent.press(await screen.findByTestId('account-app-lock-switch'));
        });
        expect(screen.getByTestId('account-app-lock-switch')).not.toBeChecked();
        expect(getAppLock()).toBe(false);
        expect(await AsyncStorage.getItem(APP_LOCK_STORAGE_KEY)).toBeNull();
      },
    );

    it('slås av uten nytt spørsmål', async () => {
      setAppLock(true);
      await renderScreen();
      await act(async () => {
        fireEvent.press(await screen.findByTestId('account-app-lock-switch'));
      });
      expect(authenticateAsync).not.toHaveBeenCalled();
      expect(screen.getByTestId('account-app-lock-switch')).not.toBeChecked();
      expect(await AsyncStorage.getItem(APP_LOCK_STORAGE_KEY)).toBeNull();
    });

    it('er dempet med en forklaring når ingenting er registrert', async () => {
      (isEnrolledAsync as jest.Mock).mockResolvedValueOnce(false);
      await renderScreen();
      expect(await screen.findByText('Slå på Face ID i innstillingene til telefonen først')).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByTestId('account-app-lock-switch'));
      });
      expect(authenticateAsync).not.toHaveBeenCalled();
      expect(screen.getByTestId('account-app-lock-switch')).not.toBeChecked();
    });

    it('kan slås av når den er på og ingenting er registrert lenger, og sier at den ikke virker', async () => {
      setAppLock(true);
      (isEnrolledAsync as jest.Mock).mockResolvedValueOnce(false);
      await renderScreen();
      expect(
        await screen.findByText('Virker ikke før du har registrert Face ID i innstillingene til telefonen'),
      ).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByTestId('account-app-lock-switch'));
      });
      expect(getAppLock()).toBe(false);
    });

    it('bruker «Lås med Touch ID» på en iPhone med finger', async () => {
      (supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValueOnce([1]);
      await renderScreen();
      expect(await screen.findByText('Lås med Touch ID')).toBeTruthy();
    });
  });

  it('shows the e-mail, opens the privacy policy, and leads to the delete confirmation', async () => {
    await renderScreen();

    expect(screen.getByTestId('account-email')).toHaveTextContent(mockEmail);

    await act(async () => {
      fireEvent.press(screen.getByTestId('account-privacy'));
    });
    expect(openWebMock).toHaveBeenCalledWith('/legal/privacy');
    expect(screen.queryByTestId('account-privacy-error')).toBeNull();

    // Mangler bygget adressen, sier raden det i stedet for å gjøre ingenting.
    openWebMock.mockResolvedValueOnce({ ok: false, reason: 'no-web-base-url' });
    await act(async () => {
      fireEvent.press(screen.getByTestId('account-privacy'));
    });
    expect(screen.getByTestId('account-privacy-error')).toHaveTextContent(
      describeWebLinkFailure('no-web-base-url'),
    );

    // Sletting bekreftes i sitt eget rom; raden her er bare inngangen.
    await fireEvent.press(screen.getByTestId('account-delete-entry'));
    expect(navigate).toHaveBeenCalledWith('DeleteAccount');
  });

  it('logs out, and has no developer surface in a store build', async () => {
    await renderScreen();

    // Porten mot App Store: raden skal ikke finnes, ikke bare være usynlig.
    expect(screen.queryByTestId('account-sync-lab')).toBeNull();
    expect(screen.queryByTestId('account-developer')).toBeNull();

    // Første forsøk går alltid uten `keepUnsent`: det er `logOut` som avgjør om
    // køen er tom, ikke skjermen.
    await fireEvent.press(screen.getByTestId('account-log-out'));
    await waitFor(() => {
      expect(logOutMock).toHaveBeenCalledWith();
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('lets Sync-lab in on a staging build', async () => {
    isStagingBuildMock.mockReturnValue(true);
    await renderScreen();

    await fireEvent.press(screen.getByTestId('account-sync-lab'));
    expect(navigate).toHaveBeenCalledWith('SyncLab');
  });

  it('asks before leaving undelivered strokes behind', async () => {
    logOutMock.mockResolvedValue({ ok: false, reason: 'unsent', pending: 3 });
    await renderScreen();

    await fireEvent.press(screen.getByTestId('account-log-out'));
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });

    const alertMock = Alert.alert as unknown as jest.Mock;
    const [title, message, buttons] = alertMock.mock.calls[0] as [
      string,
      string,
      AlertButton[],
    ];
    expect(title).toBe(PROFILE_TEXT.unsentStrokesTitle);
    // Antallet MÅ nå fram — «noen slag» er ikke nok til å ta valget på.
    expect(message).toBe(unsentStrokesWarning(3));
    expect(buttons).toHaveLength(2);

    const [cancel, confirm] = buttons;

    // «Avbryt»: ingenting har skjedd, og raden er trykkbar igjen med det samme.
    // Uten dette står den låst på «Logger ut …» for godt.
    await act(async () => {
      cancel.onPress?.();
    });
    expect(logOutMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('account-log-out')).toHaveTextContent(PROFILE_TEXT.logout);

    // «Logg ut likevel» er det eneste stedet `keepUnsent` sendes. Slagene blir
    // liggende, og den lokale basen tømmes ikke.
    await act(async () => {
      confirm.onPress?.();
    });
    expect(logOutMock).toHaveBeenLastCalledWith({ keepUnsent: true });
  });

  it('says so and unlocks the row when the session survived the logout', async () => {
    // `signout-failed` betyr at spilleren FORTSATT er innlogget: tokenet var
    // utløpt og appen kom ikke til serveren for å fornye det (offline på en
    // runde). Da må raden bli trykkbar igjen — ellers står «Logger ut …» til
    // appen startes på nytt, for skjermen unmountes aldri: `SIGNED_OUT` kom
    // aldri. Og teksten må si at nett er kravet, ikke bare «prøv igjen».
    logOutMock.mockResolvedValue({ ok: false, reason: 'signout-failed' });
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByTestId('account-log-out'));
    });

    expect(screen.getByTestId('account-logout-error')).toHaveTextContent(
      PROFILE_TEXT.logoutOfflineNote,
    );
    expect(screen.getByTestId('account-log-out')).toHaveTextContent(PROFILE_TEXT.logout);
    // Ingen dialog: dette er ikke et spørsmål til spilleren, det er en beskjed.
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

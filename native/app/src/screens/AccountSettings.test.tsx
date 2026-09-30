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
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { logOut } from '../data/logout';
import { PROFILE_TEXT, unsentStrokesWarning } from '../lib/profileCopy';
import { isStagingBuild } from '../lib/stagingGate';
import { describeWebLinkFailure, openWeb } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
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
jest.mock('../lib/stagingGate', () => ({ isStagingBuild: jest.fn() }));

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
  beforeEach(() => {
    jest.clearAllMocks();
    openWebMock.mockResolvedValue({ ok: true });
    logOutMock.mockResolvedValue({ ok: true });
    isStagingBuildMock.mockReturnValue(false);
    // Spionen settes for HVER test, ikke bare den som venter dialogen: uten den
    // er `Alert.alert` den ekte funksjonen, og «ble ikke spurt» kunne ikke
    // uttrykkes som en assert i det hele tatt.
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

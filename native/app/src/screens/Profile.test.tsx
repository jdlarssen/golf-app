// native/app/src/screens/Profile.test.tsx
// Native #1906: render-testene (Type C) for profil-rommet.
//
// Setningene er dekket av `lib/profileCopy.test.ts` (paritet mot webbens
// `messages/no.json`), og rekkefølgen drain → port → signOut → wipe er dekket av
// `data/logout.test.ts`. Ingen av delene gjentas her: testene under leser copyen
// gjennom de samme funksjonene skjermen bruker, i stedet for å skrive av
// strengene, og de rører ikke tallformateringen.
//
// Det som blir igjen er koblingene bare en render kan bekrefte:
//
//  1. **Sync-lab finnes ikke i et butikk-bygg.** Den viktigste asserten i fila:
//     den er porten mot at en utviklerflate følger med appen ut i App Store.
//     Ikke skjult, ikke deaktivert — ikke i treet.
//  2. **«Slett konto» og «Rediger profil» navigerer** og gjør ingenting selv.
//     Både bekreftelsen og skjemaet er egne rom; rommet her er inngangen.
//  3. **«Logg ut» spør før den lar slag ligge igjen.** `logOut` svarer `unsent`,
//     skjermen viser dialogen, «Avbryt» setter raden tilbake slik den var, og
//     «Logg ut likevel» er det ENESTE som sender `keepUnsent`.
//  4. **Raden låser seg ikke når sesjonen overlevde.** `signout-failed` betyr at
//     spilleren fortsatt er innlogget; da må «Logger ut …» gå tilbake til «Logg
//     ut», for skjermen unmountes aldri — `SIGNED_OUT` kom jo ikke.
//
// Fire renders og ikke én: staging-på og staging-av er to bygg, og en dialog som
// står åpen (eller en feilet utlogging) er tilstander skjermen ikke kan være i
// samtidig med utgangspunktet. Samme grunn som `DeleteAccount.test.tsx` har
// flere. Kontrakten ba om «én Type C-render»; avviket er bokført i PR-en.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { logOut } from '../data/logout';
import { fetchOwnProfile } from '../data/profile';
import { PROFILE_TEXT, formatHcpNb, unsentStrokesWarning } from '../lib/profileCopy';
import { isStagingBuild } from '../lib/stagingGate';
import type { ScreenProps } from '../navigation';
import { Profile } from './Profile';

// `mock`-prefiks kreves: bare navn som starter med «mock» slipper inn i en
// heist jest.mock-fabrikk.
const mockMe = 'user-me';
const mockEmail = 'spiller@example.com';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../session', () => ({
  useSession: () => ({ userId: mockMe, email: mockEmail }),
}));
jest.mock('../data/profile', () => ({ fetchOwnProfile: jest.fn() }));
jest.mock('../data/logout', () => ({ logOut: jest.fn() }));
jest.mock('../lib/stagingGate', () => ({ isStagingBuild: jest.fn() }));

const fetchOwnProfileMock = fetchOwnProfile as jest.Mock;
const logOutMock = logOut as jest.Mock;
const isStagingBuildMock = isStagingBuild as jest.Mock;

const MY_NAME = 'Jørgen Larssen';
const MY_HCP = 12.4;

const navigate = jest.fn();
const setParams = jest.fn();
// Rommet abonnerer på `blur` for å nullstille lagrings-kvitteringen. Stubben
// svarer med en avmeldingsfunksjon, slik den ekte gjør — uten den ville
// effektens opprydding kastet.
const addListener = jest.fn(() => jest.fn());

/** Rendrer rommet og venter til profilraden har landet i kortet. */
async function renderScreen() {
  await render(
    <Profile
      {...({
        navigation: { navigate, setParams, addListener },
        // Ingen kvittering: rommet er åpnet fra hjem, ikke fra en lagring.
        route: { params: undefined },
      } as unknown as ScreenProps<'Profile'>)}
    />,
  );
  await screen.findByTestId('profile-hcp');
}

describe('Profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchOwnProfileMock.mockResolvedValue({
      name: MY_NAME,
      nickname: null,
      hcpIndex: MY_HCP,
      // Satt i dag, så ferskhets-linja er den «Oppdatert …»-grenen. Selve
      // datoteksten er `profileCopy`-territorium og asserteres ikke her.
      handicapUpdatedAt: new Date().toISOString(),
      gender: null,
      level: null,
    });
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

  it('viser hvem du er, logger ut, og har ingen utviklerflate i et butikk-bygg', async () => {
    await renderScreen();

    expect(screen.getByTestId('profile-name')).toHaveTextContent(MY_NAME);
    expect(screen.getByTestId('profile-email')).toHaveTextContent(mockEmail);
    expect(screen.getByTestId('profile-hcp-value')).toHaveTextContent(
      formatHcpNb(MY_HCP),
    );

    // Porten mot App Store: raden skal ikke finnes, ikke bare være usynlig.
    expect(screen.queryByTestId('profile-sync-lab')).toBeNull();
    expect(screen.queryByTestId('profile-developer')).toBeNull();

    // Begge inngangene navigerer bare — skjemaet fylles ut i sitt eget rom, og
    // sletting bekreftes i sitt. Ingen av dem logger deg ut på veien.
    await fireEvent.press(screen.getByTestId('profile-edit-entry'));
    expect(navigate).toHaveBeenCalledWith('EditProfile');

    await fireEvent.press(screen.getByTestId('profile-delete-entry'));
    expect(navigate).toHaveBeenCalledWith('DeleteAccount');
    expect(logOutMock).not.toHaveBeenCalled();

    // Første forsøk går alltid uten `keepUnsent`: det er `logOut` som avgjør om
    // køen er tom, ikke skjermen.
    await fireEvent.press(screen.getByTestId('profile-log-out'));
    await waitFor(() => {
      expect(logOutMock).toHaveBeenCalledWith();
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('slipper Sync-lab inn i et staging-bygg', async () => {
    isStagingBuildMock.mockReturnValue(true);
    await renderScreen();

    await fireEvent.press(screen.getByTestId('profile-sync-lab'));
    expect(navigate).toHaveBeenCalledWith('SyncLab');
  });

  it('spør før den lar uleverte slag bli liggende', async () => {
    logOutMock.mockResolvedValue({ ok: false, reason: 'unsent', pending: 3 });
    await renderScreen();

    await fireEvent.press(screen.getByTestId('profile-log-out'));
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
    expect(screen.getByTestId('profile-log-out')).toHaveTextContent(
      PROFILE_TEXT.logout,
    );

    // «Logg ut likevel» er det eneste stedet `keepUnsent` sendes. Slagene blir
    // liggende, og den lokale basen tømmes ikke.
    await act(async () => {
      confirm.onPress?.();
    });
    expect(logOutMock).toHaveBeenLastCalledWith({ keepUnsent: true });
  });

  it('sier fra og låser opp raden når sesjonen overlevde utloggingen', async () => {
    // `signout-failed` betyr at spilleren FORTSATT er innlogget: tokenet var
    // utløpt og appen kom ikke til serveren for å fornye det (offline på en
    // runde). Da må raden bli trykkbar igjen — ellers står «Logger ut …» til
    // appen startes på nytt, for skjermen unmountes aldri: `SIGNED_OUT` kom
    // aldri. Og teksten må si at nett er kravet, ikke bare «prøv igjen».
    logOutMock.mockResolvedValue({ ok: false, reason: 'signout-failed' });
    await renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-log-out'));
    });

    expect(screen.getByTestId('profile-logout-error')).toHaveTextContent(
      PROFILE_TEXT.logoutOfflineNote,
    );
    expect(screen.getByTestId('profile-log-out')).toHaveTextContent(
      PROFILE_TEXT.logout,
    );
    // Ingen dialog: dette er ikke et spørsmål til spilleren, det er en beskjed.
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

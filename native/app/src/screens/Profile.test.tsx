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
//  1. **Menyen navigerer** og gjør ingenting selv (#2256): «Historikk og
//     statistikk» (#2265), «Venner», «Varsler og tema» og «Personvern og
//     konto» er egne rom. «Rediger» står ved
//     tittelen. «Logg ut», utviklerflaten, personvernerklæringen og «Slett
//     konto» bor i «Personvern og konto» (`AccountSettings.test.tsx`, Profil
//     v2), så ingen av dem finnes her.
//  2. **Flisene forsvinner bare når sesongen ikke kunne leses (#2256).**
//
// Flere renders og ikke én: en rad som lastes, en sesong som ikke kunne leses
// og et oppslag som feilet er tilstander skjermen ikke kan være i samtidig med
// utgangspunktet. Samme grunn som `DeleteAccount.test.tsx` har flere.
// Kontrakten ba om «én Type C-render»; avviket er bokført i PR-ene (#1906,
// #2256).
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { fetchBagTagExtras } from '../data/bagTag';
import { fetchOwnProfile } from '../data/profile';
import { PROFILE_TEXT, formatHcpNb } from '../lib/profileCopy';
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
jest.mock('../data/bagTag', () => ({ fetchBagTagExtras: jest.fn() }));

const fetchOwnProfileMock = fetchOwnProfile as jest.Mock;
const fetchBagTagExtrasMock = fetchBagTagExtras as jest.Mock;

const MY_NAME = 'Jørgen Larssen';
const MY_HCP = 12.4;

const navigate = jest.fn();
const setParams = jest.fn();
// Rommet abonnerer på `blur` for å nullstille lagrings-kvitteringen. Stubben
// svarer med en avmeldingsfunksjon — uten den ville effektens opprydding kastet.
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
      // En vanlig spiller HAR fullført profilen. Uten stempelet leser kortet
      // handicapet som «aldri satt» (#1979), og det er en annen test.
      profileCompletedAt: '2026-08-30T10:00:00.000Z',
      createdAt: '2026-04-12T18:00:00.000Z',
    });
    // Tallene er `computeProfileSeason` sine og asserteres ikke her.
    fetchBagTagExtrasMock.mockResolvedValue({
      year: 2026,
      club: 'Losby GK',
      season: { rounds: 3, bestRound: 82, wins: 1 },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // #1979: `hcp_index` er `not null default 54.0` og `handicap_updated_at`
  // `default now()`, så en profil ingen har fylt ut leste «hcp 54,0 · Oppdatert
  // i dag» — databasens default presentert som et tall spilleren hadde valgt.
  // `profile_completed_at` er det eneste som skiller «satt til 54» fra «aldri
  // satt», og kortet faller nå til samme gren som en tom profil.
  it('presenterer ikke databasens default-handicap som et valgt tall', async () => {
    fetchOwnProfileMock.mockResolvedValue({
      name: null,
      nickname: null,
      hcpIndex: 54,
      handicapUpdatedAt: new Date().toISOString(),
      gender: null,
      level: null,
      profileCompletedAt: null,
      createdAt: null,
    });

    await renderScreen();

    expect(screen.getByTestId('profile-hcp-value')).toHaveTextContent('–');
    // Ingen «Oppdatert i dag» på et handicap som aldri ble satt — en vei til
    // skjemaet i stedet.
    expect(screen.queryByTestId('profile-hcp-age')).toBeNull();
    expect(screen.getByTestId('profile-set-handicap')).toBeTruthy();
  });

  it('viser hvem du er og fører videre fra menyen', async () => {
    await renderScreen();

    expect(screen.getByTestId('profile-name')).toHaveTextContent(MY_NAME);
    expect(screen.getByTestId('profile-hcp-value')).toHaveTextContent(
      formatHcpNb(MY_HCP),
    );
    expect(await screen.findByTestId('season-tile-wins')).toBeTruthy();

    // Menyradene navigerer bare. Historikken står øverst (#2265), og
    // vennerraden har én linje (designet).
    expect(screen.getByTestId('profile-history')).toHaveTextContent(PROFILE_TEXT.menuHistory, {
      exact: false,
    });
    await fireEvent.press(screen.getByTestId('profile-history'));
    expect(navigate).toHaveBeenCalledWith('RoundDiary');
    expect(screen.getByTestId('profile-friends')).toHaveTextContent(PROFILE_TEXT.friendsRow, {
      exact: false,
    });
    await fireEvent.press(screen.getByTestId('profile-friends'));
    // Initialene følger med til heltekortet på vennesiden.
    expect(navigate).toHaveBeenCalledWith('Friends', { selfInitials: 'JL' });
    await fireEvent.press(screen.getByTestId('profile-notifications-theme'));
    expect(navigate).toHaveBeenCalledWith('NotificationsAndTheme');
    // «Rediger» står ved tittelen i innholdet (designet), ikke i headeren.
    await fireEvent.press(screen.getByTestId('profile-edit-entry'));
    expect(navigate).toHaveBeenCalledWith('EditProfile');
    await fireEvent.press(screen.getByTestId('profile-account-settings'));
    expect(navigate).toHaveBeenCalledWith('AccountSettings');

    // Profil v2: siden slutter med «Del bag-taggen». Utloggingen og
    // utviklerflaten bor i «Personvern og konto».
    expect(screen.queryByText(PROFILE_TEXT.logout)).toBeNull();
    expect(screen.queryByText(PROFILE_TEXT.syncLabRow)).toBeNull();
  });

  // Evaluator-funn (#2256): klubben kommer etter profilraden. Uten denne
  // vakten sto «Tørny» som kicker til klubben landet, og byttet så.
  it('viser ikke reserve-kickeren mens klubben lastes', async () => {
    fetchBagTagExtrasMock.mockReturnValue(new Promise(() => {}));
    await renderScreen();

    expect(screen.getByTestId('bag-tag-kicker')).not.toHaveTextContent(
      PROFILE_TEXT.bagTagFallbackKicker,
    );
  });

  it('skjuler flisene når sesongen ikke kunne leses, men beholder kortet', async () => {
    fetchBagTagExtrasMock.mockResolvedValue({ year: 2026, club: null, season: null });
    await renderScreen();

    await waitFor(() => {
      expect(screen.queryByTestId('season-tiles')).toBeNull();
    });
    expect(screen.getByTestId('profile-name')).toHaveTextContent(MY_NAME);
  });

  // #1973: overskriften skal ikke bytte tekst foran øynene på deg.
  //
  // Før denne fiksen falt navne-kjeden til e-posten så lenge `profile` var
  // null, altså hver gang rommet ble åpnet: e-postadresse i et halvt sekund,
  // så navnet. Eieren leste det som forrige brukers navn etter et eierbytte
  // (testkontoene deler adresse og skilles bare av en `+`-endelse). Hentingen
  // holdes derfor åpen her, slik at ventetilstanden kan asserteres for seg —
  // `renderScreen` venter til raden har landet og kunne aldri sett den.
  it('lar overskriften stå tom til profilraden er hentet', async () => {
    let land: (row: unknown) => void = () => {};
    fetchOwnProfileMock.mockReturnValue(
      new Promise((resolve) => {
        land = resolve;
      }),
    );

    await render(
      <Profile
        {...({
          navigation: { navigate, setParams, addListener },
          route: { params: undefined },
        } as unknown as ScreenProps<'Profile'>)}
      />,
    );

    // Linja finnes (den holder høyden sin), men bærer ingen av de to
    // kandidatene. Særlig ikke e-posten: den var hele feilen.
    const name = screen.getByTestId('profile-name');
    expect(name).not.toHaveTextContent(mockEmail);
    expect(name).not.toHaveTextContent(MY_NAME);

    await act(async () => {
      land({
        name: MY_NAME,
        nickname: null,
        hcpIndex: MY_HCP,
        handicapUpdatedAt: new Date().toISOString(),
        gender: null,
        level: null,
        profileCompletedAt: '2026-08-30T10:00:00.000Z',
        createdAt: '2026-04-12T18:00:00.000Z',
      });
    });

    expect(screen.getByTestId('profile-name')).toHaveTextContent(MY_NAME);
  });

  it('faller tilbake til e-posten som overskrift når profiloppslaget feiler', async () => {
    // Feilgrenen logger med `console.error`; den dempes slik at en forventet
    // feil ikke ser ut som en ekte i test-utskriften.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchOwnProfileMock.mockRejectedValue(new Error('nettverk'));

    await render(
      <Profile
        {...({
          navigation: { navigate, setParams, addListener },
          route: { params: undefined },
        } as unknown as ScreenProps<'Profile'>)}
      />,
    );

    await screen.findByTestId('profile-load-error');
    // Ingen rad å vise navn fra, men noe MÅ stå der: da er e-posten det
    // ærligste vi har, og feillinja står under den.
    expect(screen.getByTestId('profile-name')).toHaveTextContent(mockEmail);
  });
});

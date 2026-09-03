// native/app/src/screens/EditProfile.test.tsx
// Native #1906: den ene render-testen (Type C) for profil-skjemaet.
//
// Setningene er dekket av `lib/profileCopy.test.ts` (paritet mot webbens
// `messages/no.json`), status → feilkode av `data/profile.test.ts`, og selve
// valideringsregelen av `lib/users/profileInput.test.ts` i repo-rota. Ingenting
// av det gjentas her: testen leser copyen gjennom den samme funksjonen skjermen
// bruker, og den asserterer ikke et eneste tallformat.
//
// Det som blir igjen er koblingene bare en render kan bekrefte:
//
//  1. **«Lagre» er død til noe faktisk er endret.** Uten den porten kan en
//     spiller som bare åpnet skjemaet trykke lagre og få handicapets
//     ferskhets-stempel flyttet uten å ha ment noe med det.
//  2. **Plusshandicap sendes som magnitude + flagg**, aldri som et negativt
//     tall. Det er hele grunnen til at feltet har en «+»-knapp: sender vi
//     fortegnet i tallet OG flagget, blir verdien snudd to ganger — nøyaktig
//     feilen som ga fem slag for mye i tre aktive kamper i Ryder Cup 2026.
//  3. **En feilkode fra serveren blir en setning ved knappen**, og lagringen
//     navigerer ingen steder.
//  4. **En vellykket lagring går tilbake med kvitteringen**, som er det rommet
//     leser for å vise banneret og hente raden på nytt.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { fetchOwnProfile, saveProfile } from '../data/profile';
import { PROFILE_TEXT, describeProfileSaveFailure } from '../lib/profileCopy';
import type { ScreenProps } from '../navigation';
import { EditProfile, asGender, asLevel } from './EditProfile';

// `mock`-prefiks kreves: bare navn som starter med «mock» slipper inn i en
// heist jest.mock-fabrikk.
const mockMe = 'user-me';
const mockEmail = 'spiller@example.com';

jest.mock('../session', () => ({
  useSession: () => ({ userId: mockMe, email: mockEmail }),
}));
jest.mock('../data/profile', () => ({
  fetchOwnProfile: jest.fn(),
  saveProfile: jest.fn(),
}));

const fetchOwnProfileMock = fetchOwnProfile as jest.Mock;
const saveProfileMock = saveProfile as jest.Mock;

const navigate = jest.fn();

// Lagret −1,5 = plusshandicap 1,5. Feltet skal vise magnituden, «+»-knappen
// bærer fortegnet, og det er de to som skal ut på tråden.
const STORED_HCP = -1.5;
const MY_NAME = 'Jørgen Larssen';
const NEW_NAME = 'Jørgen L. Larssen';

/** Rendrer skjemaet og venter til raden har landet i feltene. */
async function renderScreen() {
  await render(
    <EditProfile
      {...({ navigation: { navigate } } as unknown as ScreenProps<'EditProfile'>)}
    />,
  );
  await screen.findByTestId('edit-profile-name');
}

describe('EditProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchOwnProfileMock.mockResolvedValue({
      name: MY_NAME,
      nickname: null,
      hcpIndex: STORED_HCP,
      handicapUpdatedAt: new Date().toISOString(),
      gender: 'mens',
      level: 'normal',
    });
  });

  it('krever en endring, sender magnitude + plusshake, og sier fra når ruta avviser', async () => {
    await renderScreen();

    // Ingenting er rørt: knappen er død, og linja under sier hvorfor — ellers
    // leser en grå knapp som at appen er i stykker.
    expect(screen.getByTestId('edit-profile-save')).toBeDisabled();
    expect(screen.getByTestId('edit-profile-save-hint')).toHaveTextContent(
      PROFILE_TEXT.saveHint,
    );

    // `fireEvent` er asynkron i RNTL 14 — uten `await` er state-oppdateringen
    // ikke landet når neste linje leser knappen, og testen ville feilet på en
    // knapp som i virkeligheten er trykkbar.
    await fireEvent.changeText(screen.getByTestId('edit-profile-name'), NEW_NAME);
    expect(screen.getByTestId('edit-profile-save')).toBeEnabled();
    expect(screen.queryByTestId('edit-profile-save-hint')).toBeNull();

    // Ruta avviser. Skjermen viser setningen koden hører til og blir stående.
    saveProfileMock.mockResolvedValue({ ok: false, reason: 'hcp_invalid' });
    await fireEvent.press(screen.getByTestId('edit-profile-save'));
    await waitFor(() => {
      expect(saveProfileMock).toHaveBeenCalled();
    });

    // Kallet, felt for felt. `hcpIndex` er magnituden som streng og `hcpPlus`
    // bærer fortegnet — et negativt tall her ville blitt snudd én gang til av
    // parseren. Tomt kallenavn går som `null`, ikke som tom streng.
    expect(saveProfileMock).toHaveBeenCalledWith({
      name: NEW_NAME,
      nickname: null,
      hcpIndex: '1,5',
      hcpPlus: true,
      gender: 'mens',
      level: 'normal',
    });

    expect(screen.getByTestId('edit-profile-error')).toHaveTextContent(
      describeProfileSaveFailure('hcp_invalid'),
    );
    // Et avslag er ikke en lagring: rommet skal ikke få en kvittering.
    expect(navigate).not.toHaveBeenCalled();
    // Og knappen må være trykkbar igjen — ellers står «Lagrer …» for godt.
    expect(screen.getByTestId('edit-profile-save')).toBeEnabled();

    // Andre forsøk går gjennom, og kvitteringen er det rommet leser for å vise
    // banneret og hente raden på nytt.
    saveProfileMock.mockResolvedValue({ ok: true });
    await fireEvent.press(screen.getByTestId('edit-profile-save'));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('Profile', { saved: true });
    });
  });

  it('fjerner feilen når spilleren retter feltet', async () => {
    // Sett i staging-runden: «99» ga «Handicap-index må være et tall mellom 0
    // og 54», og den røde linja ble stående etter at feltet var rettet. En feil
    // som gjelder verdier spilleren nettopp har endret, er ikke sann lenger.
    saveProfileMock.mockResolvedValue({ ok: false, reason: 'hcp_invalid' });
    await renderScreen();

    // `fireEvent` er asynkron i RNTL 14 — uten `await` er state-oppdateringen
    // ikke landet når neste linje leser skjermen.
    await fireEvent.changeText(screen.getByTestId('edit-profile-hcp'), '99');
    await fireEvent.press(screen.getByTestId('edit-profile-save'));
    await waitFor(() => {
      expect(screen.getByTestId('edit-profile-error')).toBeTruthy();
    });

    await fireEvent.changeText(screen.getByTestId('edit-profile-hcp'), '4');
    expect(screen.queryByTestId('edit-profile-error')).toBeNull();
  });
});

describe('asGender / asLevel', () => {
  // Raden kommer fra databasen som løse strenger. En verdi chip-radene ikke
  // kjenner ville ellers ligget usynlig i skjemaet og blitt sendt inn igjen ved
  // neste lagring — hvorpå serveren avviste den med en feil spilleren ikke
  // kunne rette, fordi ingen chip så valgt ut.
  it.each([
    ['mens', 'mens'],
    ['ladies', 'ladies'],
    [null, null],
    ['', null],
    ['Mens', null],
    ['annet', null],
  ] as [string | null, string | null][])('asGender(%p) → %p', (raw, expected) => {
    expect(asGender(raw)).toBe(expected);
  });

  it.each([
    ['junior', 'junior'],
    ['normal', 'normal'],
    ['senior', 'senior'],
    [null, 'normal'],
    ['', 'normal'],
    ['veteran', 'normal'],
  ] as [string | null, string][])('asLevel(%p) → %p', (raw, expected) => {
    expect(asLevel(raw)).toBe(expected);
  });
});

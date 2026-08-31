// native/app/src/screens/CreateGame.test.tsx
// Native N6a (#1854): den ene render-testen (Type C) for opprett-veiviseren.
//
// Alle reglene er dekket andre steder: payload-fasongen i
// `wizardPayload.test.ts`, spillertaket i `rosterLimits.test.ts`, feilcopyen i
// `createGameCopy.test.ts`, skrivingen i `createGame.test.ts`. Det som står
// igjen — og som ingen ren funksjon kan svare på — er KOBLINGEN gjennom fem
// steg:
//
//  1. Havner valgene arrangøren gjør faktisk i utkastet som sendes? Et
//     format valgt i steg 1 og en sideturnering slått på i steg 2 skal fortsatt
//     være der i steg 5. Utkastet lever i minnet, så en feil her er stille:
//     runden opprettes, bare ikke den runden arrangøren satte opp.
//  2. Blir knappene STÅENDE etter en feilet publisering? En veiviser som låser
//     seg etter en nettverksfeil er verre enn en som feiler — arrangøren har
//     fylt ut fem steg og har ingen vei videre.
//  3. Går en vellykket publisering til `replace` og ikke `navigate`? Med
//     `navigate` ville «tilbake» fra den nye runden ført rett inn i en ferdig
//     veiviser.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { publishGame } from '../data/createGame';
import type { ScreenProps } from '../navigation';
import { SessionProvider } from '../session';
import { CreateGame } from './CreateGame';

// Den ekte `supabase.ts` kaster uten EXPO_PUBLIC_-variablene og kobler seg på
// AppState ved import. `formatCatalog` hentes med `requireActual` under, så
// den må stå her selv om ingen spørring kjøres i denne testen.
jest.mock('../supabase', () => require('../test/supabaseMock'));

jest.mock('../data/syncTriggers', () => ({
  isDeviceOnline: () => true,
}));

jest.mock('../data/formatCatalog', () => ({
  ...jest.requireActual('../data/formatCatalog'),
  fetchFormatCatalog: jest.fn(async () => [
    {
      slug: 'stableford',
      label: 'Stableford',
      iconKey: 'flag',
      isPrimary: true,
      sortOrder: 1,
    },
    {
      slug: 'wolf',
      label: 'Wolf',
      iconKey: 'wolf',
      isPrimary: false,
      sortOrder: 2,
    },
  ]),
}));

jest.mock('../data/createGame', () => ({
  fetchCourses: jest.fn(async () => [
    {
      id: 'course-1',
      name: 'Losby Golfklubb',
      tees: [
        { id: 'tee-1', name: 'Gul', hasMens: true, hasLadies: false, hasJuniors: false },
      ],
    },
  ]),
  fetchRosterCandidates: jest.fn(async () => [
    {
      id: 'me',
      name: 'Jørgen Arrangør',
      nickname: null,
      hcpIndex: 12.4,
      gender: 'mens',
      pending: false,
    },
    {
      id: 'p2',
      name: 'Ada Aas',
      nickname: null,
      hcpIndex: 8.1,
      gender: 'ladies',
      pending: false,
    },
    {
      id: 'p3',
      name: 'Ola Olsen',
      nickname: null,
      hcpIndex: 21.7,
      gender: 'mens',
      pending: false,
    },
  ]),
  publishGame: jest.fn(),
}));

const publishGameMock = publishGame as jest.MockedFunction<typeof publishGame>;

async function renderWizard() {
  const navigation = {
    replace: jest.fn(),
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as unknown as ScreenProps<'CreateGame'>['navigation'];

  const view = await render(
    <SessionProvider value={{ userId: 'me', email: 'admin@example.test' }}>
      <CreateGame
        navigation={navigation}
        route={{ key: 'CreateGame-1', name: 'CreateGame' }}
      />
    </SessionProvider>,
  );

  return { ...view, navigation };
}

describe('CreateGame', () => {
  it('bærer valgene gjennom alle fem stegene, står imot en feilet publisering, og bytter ut seg selv ved suksess', async () => {
    publishGameMock
      // Første forsøk feiler: knappen skal ikke låse seg, og meldingen skal
      // være den norske setningen for koden — ikke en rå PostgREST-streng.
      .mockResolvedValueOnce({ ok: false, error: 'db_game' })
      .mockResolvedValueOnce({ ok: true, gameId: 'new-game-1' });

    const { navigation } = await renderWizard();

    // ── Steg 1: format ────────────────────────────────────────────────────
    await screen.findByTestId('create-format-stableford');
    // Wolf er hentet og vises selv om rosteret (bare meg) ikke passer ennå —
    // antalls-gaten hører hjemme i steg 4, ikke i formatlista.
    expect(screen.getByTestId('create-format-wolf')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // ── Steg 2: oppsett ───────────────────────────────────────────────────
    expect(screen.getByTestId('create-step-setup')).toBeTruthy();
    // Navnet er forhåndsfylt fra formatet, så `name_required` aldri møter
    // arrangøren.
    expect(screen.getByTestId('create-name').props.value).toBe('Stableford');
    await fireEvent(screen.getByTestId('create-side-toggle'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('create-side-ld-1'));
    await fireEvent.press(screen.getByTestId('create-side-ctp-1'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // ── Steg 3: bane og tid ───────────────────────────────────────────────
    await screen.findByTestId('create-course-course-1');
    await fireEvent.press(screen.getByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-1'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // ── Steg 4: spillere ──────────────────────────────────────────────────
    expect(screen.getByTestId('create-step-players')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('create-player-p2'));
    await fireEvent.press(screen.getByTestId('create-player-p3'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // ── Steg 5: oppsummering ──────────────────────────────────────────────
    expect(screen.getByTestId('create-summary-players').props.children).toBe(
      'Jørgen Arrangør, Ada Aas, Ola Olsen',
    );
    expect(screen.getByTestId('create-summary-side').props.children).toBe(
      '1 longest drive · 1 closest to pin',
    );

    await fireEvent.press(screen.getByTestId('create-publish'));

    // Utkastet skal bære HELE veiviseren, ikke bare siste steg.
    expect(publishGameMock).toHaveBeenCalledTimes(1);
    const draft = publishGameMock.mock.calls[0]![0];
    expect(draft).toEqual(
      expect.objectContaining({
        gameMode: 'stableford',
        name: 'Stableford',
        courseId: 'course-1',
        teeBoxId: 'tee-1',
        sideTournamentEnabled: true,
        sideLdCount: 1,
        sideCtpCount: 1,
      }),
    );
    expect(draft.teeOffAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Tee-kjønnet leses fra profilen: Ada står som `ladies` og skal spille fra
    // dametee uten at veiviseren spør.
    expect(draft.players).toEqual([
      { userId: 'me', teeGender: 'M', teamNumber: null },
      { userId: 'p2', teeGender: 'D', teamNumber: null },
      { userId: 'p3', teeGender: 'M', teamNumber: null },
    ]);

    // Feilet skriving: norsk melding, ingen navigasjon, knappen fortsatt åpen.
    expect(screen.getByTestId('create-error').props.children).toBe(
      'Klarte ikke å lagre spillet. Prøv igjen om litt.',
    );
    expect(navigation.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('create-publish'));

    expect(publishGameMock).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledWith('GameHome', {
      gameId: 'new-game-1',
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

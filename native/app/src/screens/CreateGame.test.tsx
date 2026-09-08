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

// #1934: veiviseren leser egen profilrad for admin-flagget. Stubbet som de
// andre hentingene, så lesingen faktisk lykkes i riggen i stedet for å ende i
// en avvist promise som `useRemote` svelger stille.
jest.mock('../data/profile', () => ({
  fetchOwnProfile: jest.fn(async () => ({
    name: 'Jørgen Arrangør',
    nickname: null,
    hcpIndex: 12.4,
    handicapUpdatedAt: null,
    gender: 'mens',
    level: null,
    isAdmin: false,
  })),
}));

jest.mock('../data/createGame', () => ({
  fetchCourses: jest.fn(async () => [
    {
      id: 'course-1',
      name: 'Losby Golfklubb',
      tees: [
        // Gul rater alle tre: uten dame-rating ville #1859-klemmen flyttet Ada
        // til herre, og «tee-settet følger profilen» hadde ikke vært testbart
        // i det hele tatt. Hvit mangler dame med vilje — den er den eneste
        // måten å se at et sett teen ikke rater faktisk er avslått, og at en
        // profilverdi teen ikke rater klemmes til noe den har.
        { id: 'tee-1', name: 'Gul', hasMens: true, hasLadies: true, hasJuniors: true },
        { id: 'tee-2', name: 'Hvit', hasMens: true, hasLadies: false, hasJuniors: true },
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
      level: 'normal',
      pending: false,
    },
    {
      id: 'p2',
      name: 'Ada Aas',
      nickname: null,
      hcpIndex: 8.1,
      gender: 'ladies',
      level: 'normal',
      pending: false,
    },
    {
      id: 'p3',
      name: 'Ola Olsen',
      nickname: null,
      hcpIndex: 21.7,
      gender: 'mens',
      level: 'normal',
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
    // Går gjennom alle fem veiviser-stegene i én flyt (bevisst — det er nettopp
    // det testen skal bevise). ~150ms alene, men jests 5000ms-default er for
    // knapp når CI kjører suitene parallelt under last (#1872, #1916).
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
  }, 20000);

  // N6a-evaluatorens funn N2: at `selectMode` nullstiller oppsettet var
  // ubeskyttet -- begge linjene kunne slettes med 511/511 groenne tester. Selve
  // lekkasjen fanges av `isParStableford` i payload-laget, men nullstillingen er
  // det som gjoer at SKJERMEN ikke viser et «Par»-valg som ikke lenger gjelder.
  it('kaster modus-spesifikke valg naar formatet byttes, og lar dobbelttrykk staa', async () => {
    await renderWizard();

    // Stableford -> «Par», altsaa 4BBB.
    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-team-size-2'));

    // Dobbelttrykk paa formatet som ALLEREDE er valgt skal ikke kaste noe.
    await fireEvent.press(screen.getByTestId('create-back'));
    await fireEvent.press(screen.getByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByTestId('create-team-size-2').props.accessibilityState)
      .toMatchObject({ selected: true });

    // Bytte til wolf skal kaste det. Wolf rendrer ikke kontrollen i det hele
    // tatt, saa fravaeret av den beviser ingenting -- vi maa gaa TILBAKE til
    // stableford og se at valget faktisk er borte. Uten nullstillingen staar
    // «Par» der fortsatt, og arrangoeren faar 4BBB hen ikke har bedt om.
    await fireEvent.press(screen.getByTestId('create-back'));
    await fireEvent.press(screen.getByTestId('create-format-wolf'));
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.queryByTestId('create-team-size-2')).toBeNull();

    await fireEvent.press(screen.getByTestId('create-back'));
    await fireEvent.press(screen.getByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    expect(screen.getByTestId('create-team-size-1').props.accessibilityState)
      .toMatchObject({ selected: true });
  });

  // #1859. Selve utledningen (profil-default + overstyring + klem) er dekket i
  // `lib/teeChoice.test.ts`; det som bare kan ses gjennom hele veiviseren er
  // KOBLINGEN: at chipen faktisk skriver til utkastet, og at et sett teen ikke
  // rater er avslått i stedet for å bli et stille feil banehandicap.
  it('lar arrangøren velge tee-sett per spiller, og slår av settene teen ikke rater', async () => {
    await renderWizard();

    await fireEvent.press(await screen.findByTestId('create-format-stableford'));
    await fireEvent.press(screen.getByTestId('create-next'));
    await fireEvent.press(screen.getByTestId('create-next'));

    // Hvit rater herre og junior, men ikke dame.
    await fireEvent.press(await screen.findByTestId('create-course-course-1'));
    await fireEvent.press(screen.getByTestId('create-tee-tee-2'));
    await fireEvent.press(screen.getByTestId('create-next'));

    await fireEvent.press(screen.getByTestId('create-player-p2'));
    // Ada står som `ladies`, men Hvit har ingen dame-rating: klemmen setter
    // herre, og dame-chipen er avslått.
    expect(screen.getByTestId('create-tee-gender-p2-M').props.accessibilityState)
      .toMatchObject({ selected: true });
    expect(screen.getByTestId('create-tee-gender-p2-D').props.accessibilityState)
      .toMatchObject({ disabled: true });

    // Et avslått valg endrer ingenting.
    await fireEvent.press(screen.getByTestId('create-tee-gender-p2-D'));
    expect(screen.getByTestId('create-tee-gender-p2-M').props.accessibilityState)
      .toMatchObject({ selected: true });

    // Junior rates av Hvit, så det er et ekte valg.
    await fireEvent.press(screen.getByTestId('create-tee-gender-p2-J'));
    expect(screen.getByTestId('create-tee-gender-p2-J').props.accessibilityState)
      .toMatchObject({ selected: true, disabled: false });
    await fireEvent.press(screen.getByTestId('create-next'));

    // Bare avvikene står i oppsummeringen — arrangøren selv spiller fra herre
    // og skal ikke nevnes.
    expect(screen.getByTestId('create-summary-tees').props.children).toBe(
      'Ada Aas: junior',
    );
  }, 20000);
});

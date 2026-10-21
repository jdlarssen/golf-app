// native/app/src/screens/EndGame.test.tsx
// Native N6c (#1856): den ene render-testen (Type C) for avslutt-flaten.
//
// Alt som kan svares av en ren funksjon er dekket andre steder: planen i
// `lib/endGamePlan.test.ts`, copyen i `lib/endGameCopy.test.ts`, portene og
// skriverekkefølgen i `data/endGame.test.ts`. Ingen av dem gjentas her.
//
// Det som blir igjen er koblingene ingen ren funksjon kan bekrefte:
//
//  1. **Manglende godkjenning har ingen avkryssing.** Den skal navngis og
//     forklares, aldri tilbys en vei rundt.
//  2. **Kvitteringen og kåringen når fram til skrivingen** — med `allowMissing`,
//     riktig frafalls-liste og `winner_user_id: null` for «Ingen kvalifiserte».
//  3. **Et avslag navngir årsaken**, ikke én generisk streng.
//  4. **Cup-runder tilbyr ingenting selv** — men de har nå en knapp DIT (#1891).
//  5. **Purringen (#1889) viser serverens tall, ikke skjermens.** Knappen teller
//     dem som er ferdige uten å ha levert; lista over teller alle som mangler
//     kort. At de to er ulike er hele poenget, og differansen får en setning.
//  6. **Godkjenn på vegne av gruppa (#1891)** når fram til den skrivingen som
//     alt finnes — og henter bundelen på nytt etterpå, uansett utfall.
//  7. **En valgt vinner som trakk seg (#2284)** gir ny henting, og valget som
//     pekte på hen, faller bort før neste trykk.
//  8. **Bekreft-steget (#2578)** viser hva som lagres, og tilbake (pila, sveip)
//     går til lista med valgene i behold — men `replace` til tavla slipper
//     gjennom. Navigasjons-mocken etterligner hindringen, ellers kunne den
//     testen aldri bli rød.
//
// Selve setningene er dekket av `lib/endGameCopy.test.ts`; det som testes her
// er at riktig oversetter brukes på riktig sted.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { bottomPadding, setBottomInset } from '../test/safeAreaMock';
import { finishRound } from '../data/endGame';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import { refreshGameBundle } from '../data/gameBundle';
import { approveScorecard } from '../data/playerActions';
import { fetchReminderPreview, sendReminder } from '../data/remind';
import type { ReminderFailure } from '../data/remind';
import { fetchOwnProfile } from '../data/profile';
import {
  describeReminderFailure,
  END_GAME_TEXT,
  reminderNote,
  unremindableNotes,
} from '../lib/endGameCopy';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';
import type { ScreenProps } from '../navigation';
import { EndGame } from './EndGame';

// `mock`-prefiks kreves: jest heiser `jest.mock`-fabrikkene over
// deklarasjonene, og bare navn som starter med «mock» slipper forbi vakten mot
// uinitialiserte variabler i en fabrikk.
const mockMe = 'user-me';
const MATE = 'user-mate';
const GAME_ID = 'game-1';

function player(
  overrides: Partial<BundlePlayer> & { userId: string },
): BundlePlayer {
  return {
    name: overrides.userId === mockMe ? 'Meg Selv' : 'Makker Makkersen',
    nickname: null,
    teamNumber: null,
    flightNumber: null,
    courseHandicap: null,
    teeGender: 'mens',
    acceptedAt: null,
    submittedAt: null,
    approvedAt: null,
    rejectionReason: null,
    withdrawnAt: null,
    withdrawnByUserId: null,
    submittedByUserId: null,
    isGuest: false,
    ...overrides,
  };
}

let mockBundle: GameBundle;

function setBundle(
  players: BundlePlayer[],
  gameOverrides: Partial<BundleGame> = {},
): void {
  mockBundle = {
    game: {
      id: GAME_ID,
      name: 'Torsdagsrunden',
      status: 'active',
      gameMode: 'stableford',
      modeConfig: null,
      courseId: 'course-1',
      teeBoxId: 'tee-1',
      requirePeerApproval: false,
      scheduledTeeOffAt: null,
      holeSegment: 'full',
      sourceGameId: null,
      createdBy: mockMe,
      scoreVisibility: 'live',
      tournamentId: null,
      foursomesSide1TeeStarterUserId: null,
      foursomesSide2TeeStarterUserId: null,
      sideTournamentEnabled: false,
      sideLdCount: 0,
      sideCtpCount: 0,
      sideDisabledCategories: [],
      ...gameOverrides,
    },
    players,
    courseName: 'Testbanen',
    teeBoxName: 'Gul',
    holes: [],
    fetchedAt: '2026-09-01T10:00:00.000Z',
  };
}

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/endGame', () => ({
  finishRound: jest.fn(async () => ({ ok: true, alreadyFinished: false })),
}));
jest.mock('../data/gameBundle', () => ({
  loadGameBundle: jest.fn(async () => mockBundle),
  refreshGameBundle: jest.fn(async () => mockBundle),
}));
// Purringen er en HTTP-rute på webben, ikke en skriving: datalaget er testet
// for seg (`data/remind.test.ts`), og her mockes det bort så testen handler om
// hva skjermen gjør med svaret.
jest.mock('../data/remind', () => ({
  fetchReminderPreview: jest.fn(async () => ({
    ok: true,
    targets: 1,
    unremindable: null,
    lastRemindedAt: null,
  })),
  sendReminder: jest.fn(async () => ({ ok: true, reminded: 1 })),
}));
jest.mock('../data/playerActions', () => ({
  approveScorecard: jest.fn(async () => ({ ok: true, alreadyDone: false })),
}));
// Samme grunn som purringen: selv-frafallet er en HTTP-rute, testet for seg i
// `data/withdrawSelf.test.ts`.
jest.mock('../data/withdrawSelf', () => ({
  withdrawSelf: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../session', () => ({ useSession: () => ({ userId: mockMe }) }));
jest.mock('../lib/useMarkVisitRead');
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
// Lås-linja på bekreft-steget leser `isAdmin`. Uten mocken gikk kallet til
// `supabaseMock`, som kaster på `users`.
jest.mock('../data/profile', () => ({
  fetchOwnProfile: jest.fn(async () => ({ isAdmin: false })),
}));

type PreventCallback = (options: { data: { action: { type: string; payload?: unknown } } }) => void;
// Siste `usePreventRemove` skjermen rendret med: om den hindrer, og
// tilbakekallet. Som i core leses begge fra siste render.
const mockPrevent: { current: { prevent: boolean; cb: PreventCallback } | null } = {
  current: null,
};
// Fokus-tilbakekallene skjermen har registrert (bundelen og `useOnResume`
// har hver sin), så en test kan gi skjermen fokus på nytt mens den står åpen.
const mockFocus = { all: new Set<() => void>() };
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus.all.add(callback);
    require('react').useEffect(callback, [callback]);
  },
  usePreventRemove: (prevent: boolean, cb: PreventCallback) => {
    mockPrevent.current = { prevent, cb };
  },
}));

/**
 * `replace` som en ekte native-stack: mens skjermen hindrer fjerning, lander
 * den ikke, men går til tilbakekallet. Skjermen må da sende handlingen videre
 * selv (`dispatch`).
 */
const landed: { name: string; params: unknown }[] = [];
const replace = jest.fn((name: string, params: unknown) => {
  if (mockPrevent.current?.prevent) {
    mockPrevent.current.cb({ data: { action: { type: 'REPLACE', payload: { name, params } } } });
    return;
  }
  landed.push({ name, params });
});
const dispatch = jest.fn();
const setOptions = jest.fn();

/** «Landet på tavla»: `replace` uten hindring, eller den samme handlingen sendt videre. */
function landedOnBoard(): boolean {
  const viaReplace = landed.some(
    ({ name, params }) =>
      name === 'Leaderboard' && (params as { gameId: string }).gameId === GAME_ID,
  );
  const viaDispatch = dispatch.mock.calls.some(
    ([action]) =>
      action.type === 'REPLACE' &&
      action.payload.name === 'Leaderboard' &&
      action.payload.params.gameId === GAME_ID,
  );
  return viaReplace || viaDispatch;
}

async function renderScreen() {
  await render(
    <EndGame
      {...({
        route: { params: { gameId: GAME_ID } },
        navigation: { replace, dispatch, setOptions, goBack: jest.fn() },
      } as unknown as ScreenProps<'EndGame'>)}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('end-game-screen')).toBeTruthy();
  });
}

/** «Avslutt runden» og så «Ja, avslutt runden» på bekreft-steget. */
async function submitAndConfirm(): Promise<void> {
  await fireEvent.press(screen.getByTestId('end-game-submit'));
  await fireEvent.press(screen.getByTestId('end-game-confirm-submit'));
}

/** Kår en slot: raden åpner arket, og et trykk på valget lukker det. */
async function pickWinner(slotKey: string, value: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(`end-game-slot-${slotKey}`));
  await fireEvent.press(screen.getByTestId(`end-game-slot-${slotKey}-${value}`));
}

/**
 * Samme for godkjenningen — men den er IKKE `destructive`.
 *
 * Å godkjenne et kort kan angres (nettsiden gjenåpner det), så knappen har
 * ingen rød stil, og den må plukkes på at den ikke er avbryt-knappen.
 */
function autoConfirmApprove(): void {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style !== 'cancel')?.onPress?.();
  });
}

/** Én levert rad + `count` som mangler kort. Purre-testenes utgangspunkt. */
function setMissing(count: number): void {
  setBundle([
    player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
    ...Array.from({ length: count }, (_, i) => player({ userId: `mate-${i}` })),
  ]);
}

describe('EndGame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    landed.length = 0;
    mockFocus.all.clear();
  });

  it('kvitterer ut manglende kort, kårer slotene og sender alt inn i skrivingen', async () => {
    // Første test i filen betaler engangskostnaden for modul-transform og RNTLs
    // første render (4,6 s mot ~365 ms isolert, #1946). Tidsgrensen som dekker
    // det står i jest.config.js (#1872).
    setBundle(
      [
        player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
        player({ userId: MATE }),
      ],
      { sideTournamentEnabled: true, sideLdCount: 1, sideCtpCount: 1 },
    );
    await renderScreen();

    // Leveringsstatusen står per spiller i den utfoldede lista — arrangøren
    // skal kunne se hva hen avslutter.
    await fireEvent.press(screen.getByTestId('end-game-deliveries-toggle'));
    expect(screen.getByTestId(`end-game-status-${mockMe}`)).toHaveTextContent(
      'Levert',
    );
    expect(screen.getByTestId(`end-game-status-${MATE}`)).toHaveTextContent(
      'Ikke levert',
    );

    // Knappen er sperret: makkeren er ikke kvittert ut, og ingen slot er kåret.
    await fireEvent.press(screen.getByTestId('end-game-submit'));
    expect(screen.queryByTestId('end-game-confirm')).toBeNull();

    await pickWinner('ld-1', MATE);
    await fireEvent.press(screen.getByTestId(`end-game-check-${MATE}`));
    // #2284: makkeren er huket av for frafall og er ikke lenger et vinnervalg.
    // Valget som pekte på hen, faller bort — databasen (0193) ville nektet
    // kåringen etter at frafallet alt var skrevet.
    await fireEvent.press(screen.getByTestId('end-game-slot-ld-1'));
    expect(screen.queryByTestId(`end-game-slot-ld-1-${MATE}`)).toBeNull();
    expect(screen.getByTestId(`end-game-slot-ld-1-${mockMe}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('end-game-sheet-close'));
    await fireEvent.press(screen.getByTestId('end-game-submit'));
    expect(screen.queryByTestId('end-game-confirm')).toBeNull();

    await pickWinner('ld-1', mockMe);
    // «Ingen kvalifiserte» er et VALG, ikke en tom verdi — uten den ville
    // sloten stått som en null ingen tok stilling til.
    await pickWinner('ctp-1', 'none');

    await submitAndConfirm();

    await waitFor(() => {
      expect(finishRound).toHaveBeenCalledWith(GAME_ID, {
        allowMissing: true,
        withdrawUserIds: [MATE],
        sideWinners: [
          { category: 'longest_drive', position: 1, winner_user_id: mockMe },
          { category: 'closest_to_pin', position: 1, winner_user_id: null },
        ],
      });
    });
    // Resultatskjermen ERSTATTER avslutt-flaten: «tilbake» skal ikke lande på
    // en avslutt-side for en runde som nettopp ble lukket.
    expect(landedOnBoard()).toBe(true);
  });

  it('#2203: åpner du skjermen, er «Alle har levert» og påminnelsen for spillet lest', async () => {
    setBundle([player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' })]);
    await renderScreen();
    expect(useMarkVisitRead).toHaveBeenCalledWith('gameFinish', GAME_ID);
  });

  it('tilbyr ingen vei rundt manglende godkjenning', async () => {
    setBundle(
      [
        player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
        player({ userId: MATE, submittedAt: '2026-09-01T09:10:00.000Z' }),
      ],
      { requirePeerApproval: true },
    );
    await renderScreen();

    // Godkjenningen navngis, men får ingen avkryssing — verken for makkeren
    // eller for meg. Appen har ingen Sekretariat-overstyring, og en boks som
    // så ut som en vei ut ville vært en løgn.
    expect(screen.getByTestId('end-game-unapproved')).toBeTruthy();
    expect(screen.queryByTestId(`end-game-check-${MATE}`)).toBeNull();

    await fireEvent.press(screen.getByTestId('end-game-submit'));
    expect(screen.queryByTestId('end-game-confirm')).toBeNull();
    expect(finishRound).not.toHaveBeenCalled();
  });

  it('navngir årsaken når skrivingen avviser', async () => {
    // Ærlig feil (N6b-guardrailen): femten grunner, femten setninger. Én
    // generisk «noe gikk galt» over alle sammen kostet tre feilsøkingsrunder.
    setBundle([
      player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
      player({ userId: MATE, submittedAt: '2026-09-01T09:10:00.000Z' }),
    ]);
    (finishRound as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: 'not-all-approved',
      blockedUserIds: [MATE],
    });
    await renderScreen();

    await submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByTestId('end-game-notice')).toHaveTextContent(
        /Makker Makkersen mangler godkjenning/,
      );
    });
    // Setningen står på bekreft-steget: en ny liste løser ikke dette avslaget.
    expect(screen.getByTestId('end-game-confirm')).toBeTruthy();
    // Et avslag skal ikke se ut som en avslutning: ingen navigasjon videre.
    expect(landedOnBoard()).toBe(false);
  });

  it('henter lista på nytt når en valgt vinner har trukket seg, og glemmer det valget (#2284)', async () => {
    // Kappløpet: makkeren trekker seg mens arrangøren står her. Databasen
    // nekter kåringen (0193), skjermen henter bundelen på nytt, og valget som
    // pekte på makkeren skal ikke stå usynlig igjen og sendes en gang til.
    const sideOn = { sideTournamentEnabled: true, sideLdCount: 1, sideCtpCount: 1 };
    setBundle(
      [
        player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
        player({ userId: MATE, submittedAt: '2026-09-01T09:10:00.000Z' }),
      ],
      sideOn,
    );
    (finishRound as jest.Mock).mockImplementationOnce(async () => {
      // Det neste hentingen ser: makkeren har trukket seg.
      setBundle(
        [
          player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
          player({
            userId: MATE,
            submittedAt: '2026-09-01T09:10:00.000Z',
            withdrawnAt: '2026-09-01T09:20:00.000Z',
          }),
        ],
        sideOn,
      );
      return { ok: false, reason: 'winner-withdrawn' };
    });
    await renderScreen();

    await pickWinner('ld-1', MATE);
    await pickWinner('ctp-1', mockMe);
    const before = (refreshGameBundle as jest.Mock).mock.calls.length;
    await submitAndConfirm();

    // Avslaget sender skjermen tilbake til lista (`returnsToList`), med
    // setningen over den grå knappen.
    await waitFor(() => {
      expect(screen.queryByTestId('end-game-confirm')).toBeNull();
    });
    expect(screen.getByTestId('end-game-submit')).toBeTruthy();
    expect(screen.getByTestId('end-game-notice')).toHaveTextContent(/har trukket seg/);
    expect((refreshGameBundle as jest.Mock).mock.calls.length).toBeGreaterThan(
      before,
    );
    await fireEvent.press(screen.getByTestId('end-game-slot-ld-1'));
    expect(screen.queryByTestId(`end-game-slot-ld-1-${MATE}`)).toBeNull();
    // De andre kandidatene står fortsatt i arket.
    expect(screen.getByTestId(`end-game-slot-ld-1-${mockMe}`)).toBeTruthy();
    expect(screen.getByTestId('end-game-slot-ld-1-none')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('end-game-sheet-close'));
    expect(landedOnBoard()).toBe(false);

    // LD-valget er borte, så knappen er sperret til arrangøren velger på nytt.
    await fireEvent.press(screen.getByTestId('end-game-submit'));
    expect(screen.queryByTestId('end-game-confirm')).toBeNull();
    expect(finishRound).toHaveBeenCalledTimes(1);

    // CTP-valget pekte på en aktiv spiller og står.
    await pickWinner('ld-1', mockMe);
    await submitAndConfirm();
    await waitFor(() => {
      expect(finishRound).toHaveBeenLastCalledWith(GAME_ID, {
        allowMissing: false,
        withdrawUserIds: [],
        sideWinners: [
          { category: 'longest_drive', position: 1, winner_user_id: mockMe },
          { category: 'closest_to_pin', position: 1, winner_user_id: mockMe },
        ],
      });
    });
  });

  // #1954 D2: uten lagret kopi og uten svar sto bare teksten, uten en vei videre.
  it('runden kom ikke, og ingenting er lagret: «Prøv igjen» henter på nytt', async () => {
    const { loadGameBundle } = require('../data/gameBundle') as { loadGameBundle: jest.Mock };
    loadGameBundle.mockResolvedValueOnce(undefined);
    (refreshGameBundle as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed (timeout)'));
    await render(
      <EndGame
        {...({
          route: { params: { gameId: GAME_ID } },
          navigation: { replace, dispatch, setOptions, goBack: jest.fn() },
        } as unknown as ScreenProps<'EndGame'>)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('game-retry')).toBeTruthy(),
    );
    // Avslutningen sier «runden», med sin egen setning.
    expect(screen.getByTestId('game-error')).toHaveTextContent(END_GAME_TEXT.loadFailed);
    await fireEvent.press(screen.getByTestId('game-retry'));
    await waitFor(() => expect(screen.queryByTestId('game-error')).toBeNull());
  });

  // #1954 D3 (kontrollrunden på #2624): cup- og ikke-aktiv-grenene er egne
  // rullevisninger og skal ende over systemlinja som resten av skjermen.
  it.each([
    ['cup-runde', { tournamentId: 'cup-1' }],
    ['ikke aktiv', { status: 'finished' }],
  ] as const)('%s: luften under står over systemlinja', async (_case, overrides) => {
    setBundle([player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' })], overrides);
    setBottomInset(48);
    try {
      await renderScreen();
      expect(bottomPadding('end-game-screen')).toBe(20 + 48);
    } finally {
      setBottomInset(0);
    }
  });

  it('avslutter ikke cup-runder — de hører til nettsiden', async () => {
    setBundle([player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' })], {
      tournamentId: 'cup-1',
    });
    await renderScreen();

    expect(screen.getByTestId('end-game-cup-note')).toBeTruthy();
    expect(screen.queryByTestId('end-game-submit')).toBeNull();
    // #1891: noten sa «på nettsiden» uten å si hvor. Nå gjør den det.
    expect(screen.getByTestId('end-game-cup-link')).toBeTruthy();
  });

  it('purrer på dem som er ferdige, og sier hvem knappen ikke treffer', async () => {
    // Tre mangler kort, men bare én av dem er FERDIG uten å ha levert. Purring
    // treffer den ene; av de to andre står én midt i runden og én er gjest, og
    // hver grunn får sin setning (#1933). Blandes tallene, lover knappen noe
    // den ikke gjør.
    setMissing(3);
    const unremindable = { unfinished: 1, guests: 1, splitDay: 0 };
    (fetchReminderPreview as jest.Mock).mockResolvedValue({
      ok: true,
      targets: 1,
      unremindable,
      lastRemindedAt: '2026-09-02T12:05:00.000Z',
    });
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('end-game-remind')).toHaveTextContent(
        'Purr på dem som mangler (1)',
      );
    });
    // Suiten kjører med TZ=UTC (`jest.config.js`): «12:05» er enhetens
    // veggklokke, ikke en Oslo-konvertering — Hermes har ikke tidssonene.
    expect(screen.getByTestId('end-game-reminder-note')).toHaveTextContent(
      reminderNote(unremindableNotes(unremindable), '12:05').join(' '),
    );

    await fireEvent.press(screen.getByTestId('end-game-remind'));

    await waitFor(() => {
      expect(screen.getByTestId('end-game-reminder-done')).toHaveTextContent(
        'Purret. De får et varsel nå.',
      );
    });
    expect(sendReminder).toHaveBeenCalledWith(GAME_ID);
    // Ny GET etter purringen: «Sist purret kl. …» ER guardrailen mot en
    // dobbeltpurring (eieren valgte bort en sperre), og en linje som ikke
    // oppdaterte seg ville vært verre enn ingen linje.
    expect(fetchReminderPreview).toHaveBeenCalledTimes(2);
  });

  it('viser bare setningen når ingen av dem kan purres ennå', async () => {
    setMissing(2);
    const unremindable = { unfinished: 2, guests: 0, splitDay: 0 };
    (fetchReminderPreview as jest.Mock).mockResolvedValue({
      ok: true,
      targets: 0,
      unremindable,
      lastRemindedAt: null,
    });
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('end-game-reminder-note')).toHaveTextContent(
        reminderNote(unremindableNotes(unremindable), null).join(' '),
      );
    });
    // Ingen knapp: en «Purr på dem som mangler (0)» ville sendt null varsler
    // og sett ut som om noe skjedde.
    expect(screen.queryByTestId('end-game-remind')).toBeNull();
  });

  it.each([
    'unauthorized',
    'not_active',
    'no-web-base-url',
    'remind_failed',
  ] as ReminderFailure[])('sier ærlig fra når purringen svarer «%s»', async (reason) => {
    // Koblingen som testes er at skjermen bruker `describeReminderFailure` —
    // selve setningene er låst i `lib/endGameCopy.test.ts` og gjentas ikke.
    setMissing(1);
    (fetchReminderPreview as jest.Mock).mockResolvedValue({
      ok: true,
      targets: 1,
      lastRemindedAt: null,
    });
    (sendReminder as jest.Mock).mockResolvedValueOnce({ ok: false, reason });
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('end-game-remind')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('end-game-remind'));

    await waitFor(() => {
      expect(screen.getByTestId('end-game-reminder-error')).toHaveTextContent(
        describeReminderFailure(reason),
      );
    });
    // Et avslag skal ikke se ut som en purring.
    expect(screen.queryByTestId('end-game-reminder-done')).toBeNull();
  });

  it('purrer ikke uten nett, og sier hvorfor i stedet for å vise en død knapp', async () => {
    setMissing(1);
    (fetchReminderPreview as jest.Mock).mockResolvedValue({
      ok: false,
      reason: 'offline',
    });
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('end-game-reminder-error')).toHaveTextContent(
        'Purring krever nett.',
      );
    });
    expect(screen.queryByTestId('end-game-remind')).toBeNull();
    expect(sendReminder).not.toHaveBeenCalled();
  });

  it('godkjenner et kort på vegne av gruppa og henter lista på nytt', async () => {
    setBundle(
      [
        player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z', approvedAt: '2026-09-01T09:05:00.000Z' }),
        player({ userId: MATE, submittedAt: '2026-09-01T09:10:00.000Z' }),
      ],
      { requirePeerApproval: true },
    );
    autoConfirmApprove();
    await renderScreen();

    const before = (refreshGameBundle as jest.Mock).mock.calls.length;
    await fireEvent.press(screen.getByTestId(`end-game-approve-${MATE}`));

    await waitFor(() => {
      // Kortet til MAKKEREN, ikke mitt eget: bytter de to plass, godkjenner
      // arrangøren seg selv — og 0106 nekter det uansett, så feilen ville
      // kommet som et avslag i stedet for som en gjort jobb.
      expect(approveScorecard).toHaveBeenCalledWith(GAME_ID, MATE);
    });
    await waitFor(() => {
      expect((refreshGameBundle as jest.Mock).mock.calls.length).toBeGreaterThan(
        before,
      );
    });
  });

  it('gir ikke egen rad en godkjenn-knapp — vakta i basen nekter den uansett', async () => {
    // Funnet i gjennomgangen av #1891: `unapproved` filtrerer ikke bort
    // arrangøren (til forskjell fra `missing.withdrawable`), så knappen ble
    // tegnet på et kort ingen kan godkjenne. Trykket endte i en rå engelsk
    // Postgres-tekst på skjermen — `guard_game_players_self_update` forbyr at
    // NOEN setter godkjenning på sin egen rad.
    setBundle(
      [
        player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
        player({ userId: MATE, submittedAt: '2026-09-01T09:10:00.000Z' }),
      ],
      { requirePeerApproval: true },
    );
    await renderScreen();

    expect(screen.queryByTestId(`end-game-approve-${mockMe}`)).toBeNull();
    expect(screen.getByTestId('end-game-own-card-needs-peer')).toBeTruthy();
    // Makkerens kort er fortsatt overstyrbart — det er hele poenget med #1891.
    expect(screen.getByTestId(`end-game-approve-${MATE}`)).toBeTruthy();
  });

  it('viser veien ut når ingen kan godkjenne arrangørens kort (#2200)', async () => {
    // Makkeren leverte kortet mitt og er den eneste i flighten, så ingen kan
    // godkjenne det. «Be en medspiller» ville vært en blindvei; nettsiden
    // viser samme vei ut (`own_card_no_peer`).
    setBundle(
      [
        player({
          userId: mockMe,
          submittedAt: '2026-09-01T09:00:00.000Z',
          submittedByUserId: MATE,
        }),
        player({ userId: MATE, submittedAt: '2026-09-01T09:00:00.000Z', submittedByUserId: MATE }),
      ],
      { requirePeerApproval: true },
    );
    await renderScreen();

    expect(screen.getByTestId('end-game-own-card-no-peer')).toBeTruthy();
    expect(screen.queryByTestId('end-game-own-card-needs-peer')).toBeNull();
  });

  it('tilbyr ikke frafall i et format som ikke har frafall', async () => {
    // `singles_matchplay` er utenfor `supportsWithdrawal`. Uten denne gaten
    // lovet knappen en handling kjernen svarer `game_locked` på.
    setBundle([player({ userId: mockMe }), player({ userId: MATE })], {
      gameMode: 'singles_matchplay',
    });
    await renderScreen();

    expect(screen.queryByTestId('end-game-withdraw-self')).toBeNull();
  });

  it('lar arrangøren trekke seg selv herfra', async () => {
    // `guard_game_players_self_update` (0147) nekter arrangøren å SKRIVE
    // frafallet på egen rad. Hinten sa «på nettsiden»; #1891 la veien dit, og
    // #1917 flyttet selve handlingen inn — via ruta, ikke via en skriving.
    setBundle([player({ userId: mockMe }), player({ userId: MATE })]);
    await renderScreen();

    expect(screen.getByTestId('end-game-withdraw-self')).toBeTruthy();
  });
  it('viser bekreft-steget, går tilbake med valgene i behold, og lander på tavla (#2578)', async () => {
    (fetchOwnProfile as jest.Mock).mockResolvedValueOnce({ isAdmin: true });
    setBundle(
      [
        player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
        player({ userId: MATE, submittedAt: '2026-09-01T09:10:00.000Z' }),
      ],
      { sideTournamentEnabled: true, sideLdCount: 1, sideCtpCount: 0 },
    );
    await renderScreen();

    await pickWinner('ld-1', MATE);
    await fireEvent.press(screen.getByTestId('end-game-submit'));

    // Bekreft-steget: det som lagres, og hvem som kan åpne runden igjen.
    expect(screen.getByTestId('end-game-confirm')).toBeTruthy();
    expect(screen.getByTestId('end-game-saved-ld-1')).toHaveTextContent(/Makker Makkersen/);
    await waitFor(() => {
      expect(screen.getByTestId('end-game-reopen')).toHaveTextContent(
        END_GAME_TEXT.reopenAdmin,
      );
    });
    expect(finishRound).not.toHaveBeenCalled();

    // Pila (eller sveipet) fjerner skjermen; hindringen sender den til lista.
    expect(mockPrevent.current?.prevent).toBe(true);
    await act(async () => {
      mockPrevent.current?.cb({ data: { action: { type: 'GO_BACK' } } });
    });
    expect(screen.queryByTestId('end-game-confirm')).toBeNull();
    expect(screen.getByTestId('end-game-slot-ld-1')).toHaveTextContent(/Makker Makkersen/);
    expect(dispatch).not.toHaveBeenCalled();

    await submitAndConfirm();
    await waitFor(() => {
      expect(finishRound).toHaveBeenCalledWith(GAME_ID, {
        allowMissing: false,
        withdrawUserIds: [],
        sideWinners: [{ category: 'longest_drive', position: 1, winner_user_id: MATE }],
      });
    });
    await waitFor(() => {
      expect(landedOnBoard()).toBe(true);
    });
  });

  it('går tilbake til lista når en ny henting gjør runden uklar mens bekreft-siden står åpen', async () => {
    // Bekreft-siden viser det som skal lagres. Trekker den valgte vinneren seg
    // mens siden står åpen, er sloten tom igjen, og «Ja, avslutt runden» ville
    // ellers avsluttet runden med en sidepremie uten vinner.
    const sideOn = { sideTournamentEnabled: true, sideLdCount: 1, sideCtpCount: 0 };
    setBundle(
      [
        player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
        player({ userId: MATE, submittedAt: '2026-09-01T09:10:00.000Z' }),
      ],
      sideOn,
    );
    await renderScreen();
    await pickWinner('ld-1', MATE);
    await fireEvent.press(screen.getByTestId('end-game-submit'));
    expect(screen.getByTestId('end-game-confirm')).toBeTruthy();

    // Neste henting (fokus): makkeren har trukket seg.
    setBundle(
      [
        player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
        player({
          userId: MATE,
          submittedAt: '2026-09-01T09:10:00.000Z',
          withdrawnAt: '2026-09-01T09:20:00.000Z',
        }),
      ],
      sideOn,
    );
    await act(async () => {
      for (const focus of mockFocus.all) focus();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('end-game-confirm')).toBeNull();
    });
    // Valget som pekte på makkeren, er borte: raden ber om et nytt.
    expect(screen.getByTestId('end-game-slot-ld-1')).toHaveTextContent(
      new RegExp(END_GAME_TEXT.chooseWinner),
    );
    expect(finishRound).not.toHaveBeenCalled();
    expect(landedOnBoard()).toBe(false);
  });
});

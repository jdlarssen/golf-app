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
//
// Selve setningene er dekket av `lib/endGameCopy.test.ts`; det som testes her
// er at riktig oversetter brukes på riktig sted.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { finishRound } from '../data/endGame';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
import { refreshGameBundle } from '../data/gameBundle';
import { approveScorecard } from '../data/playerActions';
import { fetchReminderPreview, sendReminder } from '../data/remind';
import type { ReminderFailure } from '../data/remind';
import { describeReminderFailure } from '../lib/endGameCopy';
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
    lastRemindedAt: null,
  })),
  sendReminder: jest.fn(async () => ({ ok: true, reminded: 1 })),
}));
jest.mock('../data/playerActions', () => ({
  approveScorecard: jest.fn(async () => ({ ok: true, alreadyDone: false })),
}));
jest.mock('../session', () => ({ useSession: () => ({ userId: mockMe }) }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) =>
    require('react').useEffect(callback, [callback]),
}));

const replace = jest.fn();

async function renderScreen() {
  await render(
    <EndGame
      {...({
        route: { params: { gameId: GAME_ID } },
        navigation: { replace },
      } as unknown as ScreenProps<'EndGame'>)}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('end-game-screen')).toBeTruthy();
  });
}

/** Bekreftelses-dialogen svarer ja: det som testes er skrivingen bak knappen. */
function autoConfirm(): void {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style === 'destructive')?.onPress?.();
  });
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
  });

  it('kvitterer ut manglende kort, kårer slotene og sender alt inn i skrivingen', async () => {
    setBundle(
      [
        player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
        player({ userId: MATE }),
      ],
      { sideTournamentEnabled: true, sideLdCount: 1, sideCtpCount: 1 },
    );
    autoConfirm();
    await renderScreen();

    // Leveringsstatusen står per spiller — arrangøren skal se hva hen avslutter.
    expect(screen.getByTestId(`end-game-status-${mockMe}`)).toHaveTextContent(
      'Levert',
    );
    expect(screen.getByTestId(`end-game-status-${MATE}`)).toHaveTextContent(
      'Ikke levert',
    );

    // Knappen er sperret: makkeren er ikke kvittert ut, og ingen slot er kåret.
    await fireEvent.press(screen.getByTestId('end-game-submit'));
    expect(finishRound).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId(`end-game-check-${MATE}`));
    await fireEvent.press(screen.getByTestId(`end-game-slot-ld-1-${MATE}`));
    // «Ingen kvalifiserte» er et VALG, ikke en tom verdi — uten den ville
    // sloten stått som en null ingen tok stilling til.
    await fireEvent.press(screen.getByTestId('end-game-slot-ctp-1-none'));

    await fireEvent.press(screen.getByTestId('end-game-submit'));

    await waitFor(() => {
      expect(finishRound).toHaveBeenCalledWith(GAME_ID, {
        allowMissing: true,
        withdrawUserIds: [MATE],
        sideWinners: [
          { category: 'longest_drive', position: 1, winner_user_id: MATE },
          { category: 'closest_to_pin', position: 1, winner_user_id: null },
        ],
      });
    });
    // Resultatskjermen ERSTATTER avslutt-flaten: «tilbake» skal ikke lande på
    // en avslutt-side for en runde som nettopp ble lukket.
    expect(replace).toHaveBeenCalledWith('Leaderboard', { gameId: GAME_ID });
  });

  it('tilbyr ingen vei rundt manglende godkjenning', async () => {
    setBundle(
      [
        player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
        player({ userId: MATE, submittedAt: '2026-09-01T09:10:00.000Z' }),
      ],
      { requirePeerApproval: true },
    );
    autoConfirm();
    await renderScreen();

    // Godkjenningen navngis, men får ingen avkryssing — verken for makkeren
    // eller for meg. Appen har ingen Sekretariat-overstyring, og en boks som
    // så ut som en vei ut ville vært en løgn.
    expect(screen.getByTestId('end-game-unapproved')).toBeTruthy();
    expect(screen.queryByTestId(`end-game-check-${MATE}`)).toBeNull();

    await fireEvent.press(screen.getByTestId('end-game-submit'));
    expect(finishRound).not.toHaveBeenCalled();
  });

  it('navngir årsaken når skrivingen avviser', async () => {
    // Ærlig feil (N6b-guardrailen): femten grunner, femten setninger. Én
    // generisk «noe gikk galt» over alle sammen kostet tre feilsøkingsrunder.
    setBundle([
      player({ userId: mockMe, submittedAt: '2026-09-01T09:00:00.000Z' }),
      player({ userId: MATE, submittedAt: '2026-09-01T09:10:00.000Z' }),
    ]);
    autoConfirm();
    (finishRound as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: 'not-all-approved',
      blockedUserIds: [MATE],
    });
    await renderScreen();

    await fireEvent.press(screen.getByTestId('end-game-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('end-game-notice')).toHaveTextContent(
        /Makker Makkersen mangler godkjenning/,
      );
    });
    // Et avslag skal ikke se ut som en avslutning: ingen navigasjon videre.
    expect(replace).not.toHaveBeenCalled();
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
    // treffer den ene; de to andre står midt i runden og får en setning.
    // Blandes de to tallene, lover knappen noe den ikke gjør.
    setMissing(3);
    (fetchReminderPreview as jest.Mock).mockResolvedValue({
      ok: true,
      targets: 1,
      lastRemindedAt: '2026-09-02T12:05:00.000Z',
    });
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('end-game-remind')).toHaveTextContent(
        'Purr på dem som mangler (1)',
      );
    });
    expect(screen.getByTestId('end-game-reminder-still-playing')).toHaveTextContent(
      /2 av dem har ikke ført alle hullene ennå/,
    );
    // Suiten kjører med TZ=UTC (`jest.config.js`): dette er enhetens
    // veggklokke, ikke en Oslo-konvertering — Hermes har ikke tidssonene.
    expect(screen.getByTestId('end-game-reminder-last')).toHaveTextContent(
      'Sist purret kl. 12:05',
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
    (fetchReminderPreview as jest.Mock).mockResolvedValue({
      ok: true,
      targets: 0,
      lastRemindedAt: null,
    });
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('end-game-reminder-still-playing')).toHaveTextContent(
        /2 av dem har ikke ført alle hullene ennå/,
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

  it('peker egen rad til frafalls-siden — den kan ikke trekkes herfra', async () => {
    // `guard_game_players_self_update` (0147) nekter arrangøren å trekke sin
    // egen rad. Hinten sa «på nettsiden»; #1891 la veien dit.
    setBundle([player({ userId: mockMe }), player({ userId: MATE })]);
    await renderScreen();

    expect(screen.getByTestId('end-game-withdraw-self-link')).toBeTruthy();
  });
});

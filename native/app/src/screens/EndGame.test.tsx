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
//  4. **Cup-runder tilbyr ingenting** — de avsluttes fra nettsiden.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { finishRound } from '../data/endGame';
import type { BundleGame, BundlePlayer, GameBundle } from '../data/gameBundle';
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
    // Ærlig feil (N6b-guardrailen): fjorten grunner, fjorten setninger. Én
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
  });
});

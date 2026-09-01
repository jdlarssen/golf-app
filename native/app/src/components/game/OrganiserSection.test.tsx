// native/app/src/components/game/OrganiserSection.test.tsx
// Native N6b (#1855): den ene render-testen (Type C) for arrangør-seksjonen.
//
// Alt som kan svares av en ren funksjon er dekket andre steder: skrivingene i
// `rosterActions.test.ts`, start-oversettelsen i `startGame.test.ts`, copyen i
// `rosterCopy.test.ts`, og lag-/flight-/frafalls-reglene i `lib/`. Ingen av
// dem gjentas her.
//
// Det som blir igjen er tre koblinger ingen ren funksjon kan bekrefte:
//
//  1. **Arrangørens EGEN rad tilbyr ikke det RLS nekter (#1868).**
//     `guard_game_players_self_update` (0147) blokkerer lag, flight og frafall
//     på egen rad for en oppretter som ikke er global admin. Vises knappen
//     likevel, får arrangøren «du har ikke lov» ETTER trykket — den ærlige
//     feilen skal komme før. Noten må stå i stedet.
//  2. **`alreadyRunning` tegnes som SUKSESS (#502).** Tapte vi status-flippen
//     til cron-sweepen eller nettsiden, ER runden i gang. En feilmelding der
//     ville vært direkte usann.
//  3. **Bundelen hentes på nytt etterpå.** Uten det står lista og lyver om en
//     virkelighet som nettopp flyttet seg.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { BundlePlayer, GameBundle } from '../../data/gameBundle';
import { withdrawPlayer } from '../../data/rosterActions';
import { startRoundNow } from '../../data/startGame';
import { OrganiserSection } from './OrganiserSection';

jest.mock('../../supabase', () => require('../../test/supabaseMock'));

jest.mock('../../data/createGame', () => ({
  fetchRosterCandidates: jest.fn(async () => []),
}));

jest.mock('../../data/rosterActions', () => ({
  addPlayerToGame: jest.fn(async () => ({ ok: true, alreadyDone: false })),
  removePlayerFromGame: jest.fn(async () => ({ ok: true, alreadyDone: false })),
  setPlayerFlight: jest.fn(async () => ({ ok: true, alreadyDone: false })),
  setPlayerTeam: jest.fn(async () => ({ ok: true, alreadyDone: false })),
  undoWithdrawPlayer: jest.fn(async () => ({ ok: true, alreadyDone: false })),
  withdrawPlayer: jest.fn(async () => ({ ok: true, alreadyDone: false })),
}));

jest.mock('../../data/startGame', () => ({
  startRoundNow: jest.fn(),
}));

const ME = 'user-me';
const MATE = 'user-mate';

function player(overrides: Partial<BundlePlayer> & { userId: string }): BundlePlayer {
  return {
    name: overrides.userId,
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

/** Best ball med to per lag, og ingen lag tildelt → lag-kontrollen skal vises. */
function bundle(status: string): GameBundle {
  return {
    game: {
      id: 'game-1',
      name: 'Torsdagsrunden',
      status,
      gameMode: 'best_ball',
      modeConfig: { team_size: 2 },
      courseId: 'course-1',
      teeBoxId: 'tee-1',
      requirePeerApproval: false,
      scheduledTeeOffAt: null,
      holeSegment: 'all18',
      sourceGameId: null,
      createdBy: ME,
      scoreVisibility: 'live',
      tournamentId: null,
      foursomesSide1TeeStarterUserId: null,
      foursomesSide2TeeStarterUserId: null,
      sideTournamentEnabled: false,
      sideLdCount: 0,
      sideCtpCount: 0,
      sideDisabledCategories: [],
    },
    players: [
      player({ userId: ME, name: 'Meg Selv', acceptedAt: '2026-08-30T08:00:00.000Z' }),
      player({ userId: MATE, name: 'Makker Makkersen' }),
    ],
    courseName: 'Testbanen',
    teeBoxName: 'Gul',
    holes: [],
    fetchedAt: '2026-08-30T10:00:00.000Z',
  };
}

describe('OrganiserSection', () => {
  it('holder arrangørens egen rad utenfor det RLS nekter, og tegner en tapt start-flipp som suksess', async () => {
    // Bekreftelses-dialogen svarer ja med én gang: det som testes er skrivingen
    // bak knappen, ikke at iOS tegner en Alert.
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => {
        buttons?.find((b) => b.style === 'destructive')?.onPress?.();
      });
    const onChanged = jest.fn();
    const { rerender } = await render(
      <OrganiserSection bundle={bundle('scheduled')} userId={ME} onChanged={onChanged} />,
    );

    // 1. Bekreftet/ubekreftet står per spiller.
    expect(screen.getByTestId(`organiser-accepted-${ME}`)).toHaveTextContent(
      'Bekreftet',
    );
    expect(screen.getByTestId(`organiser-accepted-${MATE}`)).toHaveTextContent(
      'Ikke bekreftet',
    );

    // 2. #1868: lag-kontrollen finnes for makkeren, men ikke for meg selv —
    //    0147-vakta ville avvist mitt eget lag-skriv. Noten står i stedet.
    expect(screen.getByTestId(`organiser-team-${MATE}-1`)).toBeTruthy();
    expect(screen.queryByTestId(`organiser-team-${ME}-1`)).toBeNull();
    expect(screen.getByTestId('organiser-own-row-note')).toBeTruthy();

    // 3. Fjern-knappen har derimot INGEN selv-vakt — hverken webbens action
    //    eller RLS har en, og to flater med hver sin regel er verre.
    expect(screen.getByTestId(`organiser-remove-${ME}`)).toBeTruthy();

    // 4. #502: en annen aktør vant status-flippen. Runden er i gang.
    (startRoundNow as jest.Mock).mockResolvedValue({
      ok: true,
      alreadyRunning: true,
    });
    await fireEvent.press(screen.getByTestId('organiser-start'));

    await waitFor(() => {
      expect(screen.getByTestId('organiser-notice')).toHaveTextContent(
        'Runden er i gang.',
      );
    });
    expect(onChanged).toHaveBeenCalled();

    // 5. Aktiv runde: frafall for makkeren, ingenting for meg selv.
    await rerender(
      <OrganiserSection bundle={bundle('active')} userId={ME} onChanged={onChanged} />,
    );
    expect(screen.getByTestId(`organiser-withdraw-${MATE}`)).toBeTruthy();
    expect(screen.queryByTestId(`organiser-withdraw-${ME}`)).toBeNull();
    expect(screen.queryByTestId(`organiser-remove-${MATE}`)).toBeNull();
    expect(screen.getByTestId('organiser-own-row-note')).toBeTruthy();

    // 6. Frafallet går gjennom bekreftelses-dialogen, ikke rett på skrivingen.
    //    Trykker man «Trekk» og raden forsvinner uten et spørsmål, er det en
    //    destruktiv handling uten brems.
    await fireEvent.press(screen.getByTestId(`organiser-withdraw-${MATE}`));
    expect(Alert.alert).toHaveBeenCalled();
    await waitFor(() => {
      expect(withdrawPlayer).toHaveBeenCalledWith('game-1', MATE);
    });
  });
});

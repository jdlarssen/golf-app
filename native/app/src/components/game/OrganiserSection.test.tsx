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
//  1. **Arrangørens EGEN rad tilbyr det basen faktisk tillater (#1868/#1917).**
//     Lag og flight åpnet 0168, og fram til #1917 sto det en note der
//     trekk-knappen skulle vært: `guard_game_players_self_update` vakt (c)
//     nekter appen å skrive `withdrawn_at` på egen rad. Nå står knappen, og
//     skrivingen går via `/api/games/[id]/withdraw-self` — vakta står urørt.
//     Det som må låses er at knappen står der basen sier ja, og ikke der den
//     sier nei: den ærlige feilen skal komme FØR trykket.
//  2. **`alreadyRunning` tegnes som SUKSESS (#502).** Tapte vi status-flippen
//     til cron-sweepen eller nettsiden, ER runden i gang. En feilmelding der
//     ville vært direkte usann.
//  3. **Bundelen hentes på nytt etterpå.** Uten det står lista og lyver om en
//     virkelighet som nettopp flyttet seg.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { BundlePlayer, GameBundle } from '../../data/gameBundle';
import { setPlayerTeam, withdrawPlayer } from '../../data/rosterActions';
import { startRoundNow } from '../../data/startGame';
import { withdrawSelf } from '../../data/withdrawSelf';
import { inviteToGame } from '../../data/inviteToGame';
import source from '../../../../../messages/no.json';
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

jest.mock('../../data/withdrawSelf', () => ({
  withdrawSelf: jest.fn(async () => ({ ok: true })),
}));

jest.mock('../../data/inviteToGame', () => ({
  inviteToGame: jest.fn(async () => ({ ok: true, kind: 'sent' })),
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
function bundle(
  status: string,
  gameOverrides: Partial<GameBundle['game']> = {},
): GameBundle {
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
      ...gameOverrides,
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

/** Samme runde, men alle har fått lag — utgangspunktet for Juster-modusen. */
function assigned(status: string): GameBundle {
  const base = bundle(status);
  return {
    ...base,
    players: base.players.map((p, i) => ({
      ...p,
      teamNumber: i + 1,
      flightNumber: i + 1,
    })),
  };
}

describe('OrganiserSection — Juster (#1875)', () => {
  // Kontrollene var gatet på «mangler noen lag/flight?». Fylte arrangøren siste
  // tomme plass, forsvant de i samme bevegelse, og rebalansering fra appen var
  // umulig. Eieren traff kanten to ganger på fem minutter i tapptest.
  //
  // Testen låser de tre tilstandene, i den rekkefølgen arrangøren møter dem.
  it('lar radene stå til arrangøren lukker dem selv — også når siste plass fylles', async () => {
    const onChanged = jest.fn();
    const onFinish = jest.fn();

    // 1. Noen mangler lag: radene er påkrevd arbeid og står framme av seg selv.
    //    Ingen «Juster»-knapp — den ville vært en knapp uten jobb.
    const { rerender } = await render(
      <OrganiserSection
        bundle={bundle('scheduled')}
        userId={ME}
        onChanged={onChanged}
        onFinish={onFinish}
      />,
    );
    expect(screen.getByTestId(`organiser-team-${MATE}-1`)).toBeTruthy();
    expect(screen.queryByTestId('organiser-adjust-toggle')).toBeNull();

    // 2. Arrangøren fyller den SISTE tomme plassen. Bundelen kommer tilbake
    //    ferdig fordelt — og det er nøyaktig her radene pleide å forsvinne
    //    under fingeren. Nå står de, og knappen sier «Ferdig».
    await fireEvent.press(screen.getByTestId(`organiser-team-${MATE}-1`));
    await waitFor(() => {
      expect(setPlayerTeam).toHaveBeenCalledWith('game-1', MATE, 1);
    });
    await rerender(
      <OrganiserSection
        bundle={assigned('scheduled')}
        userId={ME}
        onChanged={onChanged}
        onFinish={onFinish}
      />,
    );
    expect(screen.getByTestId(`organiser-team-${MATE}-1`)).toBeTruthy();
    expect(screen.getByTestId('organiser-adjust-toggle')).toHaveTextContent('Ferdig');

    // 3. «Ferdig» lukker lista, og «Juster» åpner den igjen — omfordeling etter
    //    at alle har fått lag er nå mulig fra appen.
    await fireEvent.press(screen.getByTestId('organiser-adjust-toggle'));
    expect(screen.queryByTestId(`organiser-team-${MATE}-1`)).toBeNull();
    expect(screen.getByTestId('organiser-adjust-toggle')).toHaveTextContent('Juster');

    await fireEvent.press(screen.getByTestId('organiser-adjust-toggle'));
    expect(screen.getByTestId(`organiser-team-${MATE}-1`)).toBeTruthy();

    // 4. Rebalansering etter start er fortsatt web/sekretariat: en aktiv runde
    //    har hverken rader eller knapp.
    await rerender(
      <OrganiserSection
        bundle={assigned('active')}
        userId={ME}
        onChanged={onChanged}
        onFinish={onFinish}
      />,
    );
    expect(screen.queryByTestId('organiser-adjust-toggle')).toBeNull();
    expect(screen.queryByTestId(`organiser-team-${MATE}-1`)).toBeNull();
  });

  it('gir wolf ingen Juster-knapp — rotasjons-plassen er trukket, ikke fordelt', async () => {
    await render(
      <OrganiserSection
        bundle={bundle('scheduled', {
          gameMode: 'wolf',
          modeConfig: { team_size: 1 },
        })}
        userId={ME}
        onChanged={jest.fn()}
        onFinish={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('organiser-adjust-toggle')).toBeNull();
    expect(screen.queryByTestId(`organiser-team-${MATE}-1`)).toBeNull();
    expect(screen.queryByTestId(`organiser-flight-${MATE}-1`)).toBeNull();
  });
});

describe('OrganiserSection', () => {
  it('aapner egen rad der basen tillater det, holder den utenfor der den ikke gjoer, og tegner en tapt start-flipp som suksess', async () => {
    // Bekreftelses-dialogen svarer ja med én gang: det som testes er skrivingen
    // bak knappen, ikke at iOS tegner en Alert.
    jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => {
        buttons?.find((b) => b.style === 'destructive')?.onPress?.();
      });
    const onChanged = jest.fn();
    const onFinish = jest.fn();
    const { rerender } = await render(
      <OrganiserSection
        bundle={bundle('scheduled')}
        userId={ME}
        onChanged={onChanged}
        onFinish={onFinish}
      />,
    );

    // 1. Bekreftet/ubekreftet står per spiller.
    expect(screen.getByTestId(`organiser-accepted-${ME}`)).toHaveTextContent(
      'Bekreftet',
    );
    expect(screen.getByTestId(`organiser-accepted-${MATE}`)).toHaveTextContent(
      'Ikke bekreftet',
    );

    // 2. #1855/#1868: lag-kontrollen finnes for BEGGE, ogsaa min egen rad.
    //    Migrasjon 0168 ga oppretteren samme unntak paa egen rad som de alt
    //    hadde paa andres. UI-sperren ble staaende igjen etter at basen aapnet,
    //    saa evnen fantes uten aa vaere naabar — eieren fant det i tapptest,
    //    ikke denne testen. Naa laaser den begge radene.
    expect(screen.getByTestId(`organiser-team-${MATE}-1`)).toBeTruthy();
    expect(screen.getByTestId(`organiser-team-${ME}-1`)).toBeTruthy();

    // 2b. Foer runden er i gang finnes det ingenting aa trekke seg fra: lag og
    //     flight er aapne, og frafall gjelder foerst naar spillet gaar. Foer
    //     start fjerner man seg selv med «Fjern» i stedet.
    expect(screen.queryByTestId('organiser-withdraw-self')).toBeNull();

    // 3. Fjern-knappen har derimot INGEN selv-vakt — hverken webbens action
    //    eller RLS har en, og to flater med hver sin regel er verre.
    expect(screen.getByTestId(`organiser-remove-${ME}`)).toBeTruthy();

    // 3b. #1919: her sto blindveien. Er det ingen igjen å velge, sa kortet
    //     «Nye folk inviterer du fra nettsiden» — og det var alt. Nå står
    //     e-postfeltet i kortet, og kvitteringen er beviset på at handlingen
    //     faktisk skjedde: en invitasjon som gikk ut endrer ingenting i lista,
    //     så uten setningen ville arrangøren ikke visst om noe skjedde.
    await fireEvent.press(screen.getByTestId('organiser-add-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('organiser-invite-email')).toBeTruthy();
    });
    await fireEvent.changeText(
      screen.getByTestId('organiser-invite-email'),
      'ny@example.com',
    );
    await fireEvent.press(screen.getByTestId('organiser-invite-submit'));
    await waitFor(() => {
      // Kun runden og adressen: hvem som inviterer kommer fra tokenet.
      expect(inviteToGame).toHaveBeenCalledWith('game-1', 'ny@example.com');
    });
    await waitFor(() => {
      expect(screen.getByTestId('organiser-notice')).toHaveTextContent(
        'Invitasjon sendt til ny@example.com.',
      );
    });
    // Lenka til nettsiden blir stående: pending-oversyn og avlysning bor der.
    expect(screen.getByTestId('organiser-invite-link')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('organiser-add-toggle'));

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

    // 4b. Avslutt-CTA-en hører til den AKTIVE runden (N6c, #1856) — på en
    //     planlagt runde finnes det ingenting å avslutte.
    expect(screen.queryByTestId('organiser-finish')).toBeNull();

    // 5. Aktiv runde: frafall for makkeren, ingenting for meg selv.
    await rerender(
      <OrganiserSection
        bundle={bundle('active')}
        userId={ME}
        onChanged={onChanged}
        onFinish={onFinish}
      />,
    );
    expect(screen.getByTestId(`organiser-withdraw-${MATE}`)).toBeTruthy();
    expect(screen.queryByTestId(`organiser-withdraw-${ME}`)).toBeNull();
    expect(screen.queryByTestId(`organiser-remove-${MATE}`)).toBeNull();
    // Naa — og foerst naa — finnes «Trekk meg» (#1917). Vakt (c) staar, saa
    // skrivingen gaar via `/api/games/[id]/withdraw-self`; det er knappen som
    // flyttet inn i appen, ikke regelen.
    expect(screen.getByTestId('organiser-withdraw-self')).toBeTruthy();

    // 6. Frafallet går gjennom bekreftelses-dialogen, ikke rett på skrivingen.
    //    Trykker man «Trekk» og raden forsvinner uten et spørsmål, er det en
    //    destruktiv handling uten brems.
    await fireEvent.press(screen.getByTestId(`organiser-withdraw-${MATE}`));
    expect(Alert.alert).toHaveBeenCalled();
    await waitFor(() => {
      expect(withdrawPlayer).toHaveBeenCalledWith('game-1', MATE);
    });

    // 6b. #1917: og egen rad gaar samme vei — gjennom bekreftelsen, og deretter
    //     til ruta med spill-id-en. Spilleren sendes aldri med: den kommer fra
    //     tokenet paa serversiden.
    await fireEvent.press(screen.getByTestId('organiser-withdraw-self'));
    await waitFor(() => {
      expect(withdrawSelf).toHaveBeenCalledWith('game-1');
    });

    // 7. #1856: avslutt-CTA-en åpner den egne flaten. Den skriver ingenting
    //    her — flippen er praktisk irreversibel, og husregelen er at slikt får
    //    en bekreftelses-side, ikke en knapp midt i rosteret.
    await fireEvent.press(screen.getByTestId('organiser-finish'));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('organiser-cup-note')).toBeNull();

    // 8. Cup-runde: ingen CTA i det hele tatt, bare setningen som sier hvor
    //    avslutningen gjøres. Cup-flyten eier de avledede kampene og demper
    //    per-spill-varslene; en app-flipp ville gått utenom begge.
    await rerender(
      <OrganiserSection
        bundle={bundle('active', { tournamentId: 'cup-1' })}
        userId={ME}
        onChanged={onChanged}
        onFinish={onFinish}
      />,
    );
    expect(screen.queryByTestId('organiser-finish')).toBeNull();
    expect(screen.getByTestId('organiser-cup-note')).toBeTruthy();
    expect(screen.getByTestId('organiser-cup-link')).toBeTruthy();

    // 9. #1937: planlagt cupkamp har ingen Fjern-knapp. RLS (0178) nekter
    //    slettingen, og knappen skal ikke love noe basen sier nei til.
    await rerender(
      <OrganiserSection
        bundle={bundle('scheduled', { tournamentId: 'cup-1' })}
        userId={ME}
        onChanged={onChanged}
        onFinish={onFinish}
      />,
    );
    expect(screen.queryByTestId(`organiser-remove-${MATE}`)).toBeNull();
    expect(screen.queryByTestId(`organiser-remove-${ME}`)).toBeNull();
  });

  // #1980: «Start runden nå» er en enveis-flipp. Webben spør med
  // `confirm(startRoundConfirm)`; appen skal spørre med de samme ordene, og
  // ingenting skal skje før svaret.
  it('spør med webbens tekst før runden startes, og starter ikke ved avbryt', async () => {
    let buttons: { text?: string; style?: string; onPress?: () => void }[] = [];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => {
      buttons = (b ?? []) as typeof buttons;
    });
    (startRoundNow as jest.Mock).mockClear();
    (startRoundNow as jest.Mock).mockResolvedValue({ ok: true, alreadyRunning: false });
    await render(
      <OrganiserSection
        bundle={bundle('scheduled')}
        userId={ME}
        onChanged={jest.fn()}
        onFinish={jest.fn()}
      />,
    );

    await fireEvent.press(screen.getByTestId('organiser-start'));

    expect(alert).toHaveBeenCalledWith(
      'Start runden nå',
      source.admin.game.buttons.startRoundConfirm,
      expect.any(Array),
    );
    expect(startRoundNow).not.toHaveBeenCalled();

    // Avbryt: fortsatt ingenting.
    buttons.find((b) => b.style === 'cancel')?.onPress?.();
    expect(startRoundNow).not.toHaveBeenCalled();

    buttons.find((b) => b.style === 'destructive')!.onPress!();
    await waitFor(() => {
      expect(screen.getByTestId('organiser-notice')).toHaveTextContent('Runden er i gang.');
    });
    expect(startRoundNow).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});

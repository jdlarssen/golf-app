// native/app/src/data/startGame.ts
// Native N6b (#1855): «Start runden nå» fra appen.
//
// Fila er med vilje tynn. Hele orkestreringen — tee-rating, ubekreftede
// spillere, ufullstendige sider/lag/flighter, rotasjons-antall, frysingen av
// `course_handicap`, greensome-overstyringen og den optimistisk låste
// status-flippen — bor i `lib/games/startScheduledGameCore.ts` og deles med
// webben. Appen speiler ingen av de reglene; den kaller kjernen med sin egen
// RLS-klient og oversetter svaret til noe skjermen kan handle på.
//
// **Vinner-semantikken (#502) er det ene som er lett å få feil her.** Kjernen
// svarer `{ ok: true, started: false }` når en ANNEN aktør rakk status-flippen
// først — cron-sweepen på tee-off, «Start runden nå» på nettsiden, eller
// E1-fallbacken når noen åpner spillsiden etter tee-off. Det er nøyaktig det
// arrangøren ba om: runden er i gang. Utfallet bæres derfor som
// `alreadyRunning: true` under `ok: true`, ikke som en feil — et navn det er
// vanskelig å lese som noe annet enn suksess.
//
// **Bokført gap: appen varsler ikke.** Kjernen avslår ventende påmeldinger
// (#1055) og RETURNERER søkerne, fordi `notify` er `server-only` +
// service-role. Webbens wrapper fyrer `registration_expired` for dem. Starter
// arrangøren fra appen, skjer avslaget i basen, men varselet uteblir — samme
// klasse gap som de manglende `player_added`-varslene i `rosterActions.ts`.
// Lista leses derfor bevisst ikke her; se {@link startRoundNow}.
import type { StartCountMode } from '../../../../lib/games/startPlayerCount';
import {
  startScheduledGameCore,
  type StartScheduledGameFailure,
} from '../../../../lib/games/startScheduledGameCore';
import { supabase } from '../supabase';
import { isDeviceOnline } from './syncTriggers';

/**
 * Hvorfor starten ikke gikk gjennom: kjernens egne koder, pluss `offline`.
 *
 * Nett-gaten står foran fordi starten ALDRI går i sync-køen (samme v1-linje som
 * roster-skrivingene og opprettelsen i #1854). Uten den ville et trykk i
 * flymodus endt i en rå «Network request failed».
 */
export type StartRoundFailure = StartScheduledGameFailure['reason'] | 'offline';

/**
 * Avslaget slik skjermen leser det. Feltene er råstoff for copyen i
 * `lib/rosterCopy.ts` — datalaget har ingen bruker-tekst.
 */
export interface StartRoundRefusal {
  ok: false;
  reason: StartRoundFailure;
  /** Satt kun ved `rotation_player_count` (#969, #2071) — velger hvilken setning. */
  rotationMode?: StartCountMode;
  rotationActiveCount?: number;
}

export type StartRoundResult =
  | {
      ok: true;
      /**
       * `true` når en annen aktør vant status-flippen. Fortsatt suksess:
       * runden ER i gang, og skjermen skal si det — aldri vise en feil.
       */
      alreadyRunning: boolean;
    }
  | StartRoundRefusal;

/**
 * Start en planlagt runde herfra.
 *
 * @param gameId spillet som skal flippes fra `scheduled` til `active`.
 * @returns suksess (også når noen andre rakk det først) eller et typet avslag.
 */
export async function startRoundNow(gameId: string): Promise<StartRoundResult> {
  if (!isDeviceOnline()) return { ok: false, reason: 'offline' };

  const result = await startScheduledGameCore(supabase, gameId);

  if (result.ok) {
    // `result.expiredSignups` slippes med vilje: varslene til de avviste
    // søkerne er server-eide (`notify` er `server-only`), og en app-start
    // sender dem ikke. Gapet er bokført i `docs/native/app-spike.md` og i
    // filhodet — det er ikke en glipp, og det er ikke stille.
    return { ok: true, alreadyRunning: !result.started };
  }

  // `pending_players` bærer ingen liste (#2207): kjernen svarer med id-er, og
  // de som mangler profil har uansett ikke navn ennå. Teksten er den generelle,
  // som ved publisering.
  return {
    ok: false,
    reason: result.reason,
    ...(result.rotationMode === undefined
      ? {}
      : { rotationMode: result.rotationMode }),
    ...(result.rotationActiveCount === undefined
      ? {}
      : { rotationActiveCount: result.rotationActiveCount }),
  };
}

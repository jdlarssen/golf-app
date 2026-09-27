// native/app/src/data/startGame.ts
// Native N6b (#1855), #2215: «Start runden nå» fra appen.
//
// Fila er med vilje tynn. Hele orkestreringen — tee-rating, ubekreftede
// spillere, ufullstendige sider/lag/flighter, rotasjons-antall, frysingen av
// `course_handicap`, greensome-overstyringen og den optimistisk låste
// status-flippen — bor i `lib/games/startScheduledGameCore.ts` og deles med
// webben. Appen speiler ingen av de reglene.
//
// **Hvorfor en rute (#2215).** Fram til #2215 kalte appen kjernen direkte med
// sin egen RLS-klient. Flippen ble riktig, men alt webben gjør rundt den ble
// borte: `registration_expired` til de avviste søkerne (#1055), `game_started`
// til medspillerne, starten av avledede spill og tømmingen av web-cachen. En
// makker på nettsiden ble stående i venterommet. Alt det krever Node
// (`notify()`, service-role, `expireGameCache`), så appen spør
// `POST /api/games/{id}/start`, og ruta gjør det samme som webbens knapp.
// Fila har derfor ingen verdi-import fra kjernen, bare typen på avslagene.
//
// **Vinner-semantikken (#502) er det ene som er lett å få feil her.** Ruta
// svarer `alreadyRunning: true` når en ANNEN aktør rakk status-flippen først —
// cron-sweepen på tee-off, «Start runden nå» på nettsiden, eller E1-fallbacken
// når noen åpner spillsiden etter tee-off. Det er nøyaktig det arrangøren ba
// om: runden er i gang. Utfallet bæres derfor under `ok: true`, ikke som en
// feil — et navn det er vanskelig å lese som noe annet enn suksess.
//
// **Wire-kontrakten** (ruta og denne fila endres i samme PR):
//   POST /api/games/{id}/start (ingen kropp)
//     200 { alreadyRunning: boolean }
//     401 · 403 · 404
//     409 { error: <kjernens grunn>, rotationMode?, rotationActiveCount? }
//     500 start_failed
import { isStartCountMode, type StartCountMode } from '../../../../lib/games/startPlayerCount';
import type { StartScheduledGameFailure } from '../../../../lib/games/startScheduledGameCore';
import { callWebRoute, type WebApiFailure } from './webApi';

/** Kjernens avslag, slik ruta sender dem videre i en 409. */
type CoreReason = StartScheduledGameFailure['reason'];

/**
 * Hvorfor starten ikke gikk gjennom.
 *
 * Kjernens egne koder, appens egen tilstand før kallet ({@link WebApiFailure}:
 * nett, adresse, sesjon, nettverk), og de to ruta selv kan svare med:
 * `forbidden` (ikke arrangør) og `start_failed` (serverfeil, eller en 409 med
 * en grunn vi ikke kjenner). Starten går ALDRI i sync-køen (samme v1-linje som
 * roster-skrivingene og opprettelsen i #1854), så `offline` stopper før kallet.
 */
export type StartRoundFailure = CoreReason | WebApiFailure | 'forbidden' | 'start_failed';

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
 * Kjernens koder. `Record<…, true>` er porten: får kjernen en ny avslagskode og
 * ingen legger den til her, faller `tsc` på den manglende nøkkelen i stedet for
 * at koden stille blir til «Klarte ikke å oppdatere spillet». En kode vi ikke
 * kjenner på wiren blir `start_failed`: en gjettet forklaring er verre.
 */
const CORE_REASONS: Record<CoreReason, true> = {
  not_found: true,
  not_scheduled: true,
  tee_missing: true,
  tee_missing_rating: true,
  no_players: true,
  pending_players: true,
  incomplete_sides: true,
  decided_by_withdrawal: true,
  unassigned_teams: true,
  unassigned_flights: true,
  rotation_player_count: true,
  db_players: true,
  db_game: true,
};

function readCoreReason(value: unknown): CoreReason | undefined {
  return typeof value === 'string' && Object.hasOwn(CORE_REASONS, value)
    ? (value as CoreReason)
    : undefined;
}

/**
 * En 409 som avslag, med rotasjons-feltene når de er der og er lesbare.
 *
 * `pending_players` bærer ingen liste (#2207): kjernen svarer med id-er, og de
 * som mangler profil har uansett ikke navn ennå. Teksten er den generelle, som
 * ved publisering.
 */
function refusalFromConflict(body: Record<string, unknown>): StartRoundRefusal {
  const { rotationMode, rotationActiveCount } = body;
  return {
    ok: false,
    reason: readCoreReason(body.error) ?? 'start_failed',
    ...(typeof rotationMode === 'string' && isStartCountMode(rotationMode)
      ? { rotationMode }
      : {}),
    ...(typeof rotationActiveCount === 'number' ? { rotationActiveCount } : {}),
  };
}

/** Status → kode for alt annet enn 200 og 409, oversatt ÉN gang. */
function failureForStatus(status: number): StartRoundFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  return 'start_failed';
}

/**
 * Start en planlagt runde herfra.
 *
 * **200 ER kvitteringen.** Varslene på serversiden er best-effort, så ruta
 * svarer 200 selv om et varsel ikke gikk. Mangler `alreadyRunning`, faller det
 * til `false` og svaret er fortsatt suksess.
 *
 * @param gameId spillet som skal flippes fra `scheduled` til `active`.
 * @returns suksess (også når noen andre rakk det først) eller et typet avslag.
 */
export async function startRoundNow(gameId: string): Promise<StartRoundResult> {
  const call = await callWebRoute(
    `/api/games/${encodeURIComponent(gameId)}/start`,
    'POST',
  );
  if (!call.ok) return call;

  if (call.status === 200) {
    return { ok: true, alreadyRunning: call.body.alreadyRunning === true };
  }
  if (call.status === 409) return refusalFromConflict(call.body);
  return { ok: false, reason: failureForStatus(call.status) };
}

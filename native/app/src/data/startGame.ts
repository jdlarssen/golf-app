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
import type { RotationMode } from '../../../../lib/games/assignRotationSlots';
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
  /**
   * Satt kun ved `pending_players`: hvem det gjelder, med NAVN der navnet er
   * lesbart og e-post ellers. Se {@link labelPendingPlayers}.
   */
  pendingLabels?: string[];
  /** Satt kun ved `rotation_player_count` (#969) — velger hvilken setning. */
  rotationMode?: RotationMode;
  rotationActiveCount?: number;
}

/**
 * Klient-typen kjernen forlanger.
 *
 * ⚠️ **To installasjoner av `@supabase/supabase-js`.** Appen har sin egen
 * (`native/app/node_modules`, 2.112.x) fordi Metro må resolve alt mot appens
 * eget avhengighetstre; repo-rota har sin (2.105.x). `startScheduledGameCore`
 * ligger i `lib/` og annoterer derfor ROTAS `SupabaseClient`, mens
 * `src/supabase.ts` gir appens. TypeScript nominal-sammenligner klasser med
 * `protected`-felter (`supabaseUrl`) og avviser de to som ulike — selv om
 * flatene er identiske og begge tilfredsstiller rotas `^2.105.4`.
 *
 * Kastet under er derfor et pakke-duplikat-kast, ikke et «typene stemmer
 * ikke»-kast. Det står ETT sted, og typen hentes fra kjernens egen signatur, så
 * en ekte endring av parameteren fortsatt slår ut her.
 */
type CoreSupabaseClient = Parameters<typeof startScheduledGameCore>[0];

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

  const result = await startScheduledGameCore(
    supabase as unknown as CoreSupabaseClient,
    gameId,
  );

  if (result.ok) {
    // `result.expiredSignups` slippes med vilje: varslene til de avviste
    // søkerne er server-eide (`notify` er `server-only`), og en app-start
    // sender dem ikke. Gapet er bokført i `docs/native/app-spike.md` og i
    // filhodet — det er ikke en glipp, og det er ikke stille.
    return { ok: true, alreadyRunning: !result.started };
  }

  if (result.reason === 'pending_players') {
    return {
      ok: false,
      reason: 'pending_players',
      pendingLabels: await labelPendingPlayers(result.pendingEmails ?? []),
    };
  }

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

/** Én `users`-rad, akkurat de tre feltene navne-oppslaget trenger. */
interface PendingUserRow {
  email: string;
  name: string | null;
  nickname: string | null;
}

/**
 * E-post → navn, for `pending_players`-meldingen.
 *
 * Kjernen svarer med e-post (`findPendingPlayers` leser `users.email`), og
 * webbens banner viser den e-posten rått. Det duger på en admin-side; på
 * telefonen er det arrangørens medspillere, og de har navn.
 *
 * Oppslaget går mot `users` under RLS — de ventende spillerne står på samme
 * roster som arrangøren, så SELECT-policyen (0092: egen rad ∨ admin ∨ delt
 * spill) slipper radene gjennom.
 *
 * **Fallbacken er e-posten, aldri en tom liste eller «Ukjent spiller».** En
 * spiller som ikke har fullført registreringen har som regel hverken navn eller
 * kallenavn ennå — nettopp derfor blokkerer hen starten. Da er e-posten det
 * eneste som faktisk identifiserer personen, og den er bedre enn en plassholder
 * arrangøren ikke kan gjøre noe med. Feiler hele oppslaget, står vi igjen med
 * webbens oppførsel, som er greit nok.
 */
async function labelPendingPlayers(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];

  const { data, error } = await supabase
    .from('users')
    .select('email, name, nickname')
    .in('email', emails)
    .returns<PendingUserRow[]>();

  if (error) {
    console.error('[startRoundNow] pending name lookup failed', error);
    return emails;
  }

  const byEmail = new Map((data ?? []).map((row) => [row.email, row]));
  return emails.map((email) => {
    const row = byEmail.get(email);
    const label = row?.nickname?.trim() || row?.name?.trim();
    return label || email;
  });
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { notify } from '@/lib/notifications/notify';
import {
  startScheduledGameCore,
  type ExpiredSignup,
  type StartScheduledGameFailure,
} from './startScheduledGameCore';

export type StartScheduledGameResult =
  // `started` = denne calleren vant status-flippen (scheduled → active).
  // Konkurrerende callere (cron-sweep, E1-fallback, admin-knapp) får
  // ok:true/started:false når en annen var først — varsel-fan-out skal
  // kun skje hos vinneren, ellers dobles game_started-varslene (#502).
  | { ok: true; started: boolean }
  // Avslags-formen (med hele reason-unionen) bor i kjernen — se
  // `startScheduledGameCore.ts`. Den er uendret herfra sett.
  | StartScheduledGameFailure;

/**
 * Web-innpakningen rundt `startScheduledGameCore` (#1855).
 *
 * All orkestrering — vakter, frysing av course_handicap, greensome-re-derivering
 * og den optimistisk-låste status-flippen — ligger i kjernen, som er import-ren
 * så React Native-appen kan kjøre nøyaktig samme sekvens med sin egen
 * RLS-klient. Det ene kjernen ikke kan gjøre er å varsle: `notify` åpner med
 * `import 'server-only'` og skriver via service-role-klienten. Kjernen avslår
 * derfor ventende påmeldinger selv og RETURNERER søkerne; denne fila fyrer
 * `registration_expired` for dem og snevrer resultatet ned til formen alle
 * eksisterende web-callsites allerede leser.
 *
 * Used by:
 * - D5: admin "Start runden nå" server action (interactive)
 * - E1: server-side fallback on /games/[id] when tee-off has passed
 * - the cron sweep + the league/derived-games sync
 *
 * The caller decides redirects / revalidation based on the structured result.
 */
export async function startScheduledGame(
  supabase: SupabaseClient<Database>,
  gameId: string,
): Promise<StartScheduledGameResult> {
  const result = await startScheduledGameCore(supabase, gameId);
  if (!result.ok) return result;

  if (result.started && result.expiredSignups.length > 0) {
    await notifyExpiredSignups(gameId, result.gameName, result.expiredSignups);
  }

  return { ok: true, started: result.started };
}

/**
 * Best-effort: fire one `registration_expired` notification per applicant the
 * start just auto-rejected (#1055). Only the caller that won the
 * scheduled→active flip gets here — the kernel returns an empty list to
 * everyone else — which mirrors the `game_started` fan-out contract.
 *
 * `Promise.allSettled` + one `console.error` per rejection: the round has
 * already started at this point, and failing the start over a notification
 * side-effect would be worse than a missing varsel. Same reasoning as
 * `notifyAchievementUnlocks` and the Resend mail helpers.
 */
async function notifyExpiredSignups(
  gameId: string,
  gameName: string,
  expiredSignups: ExpiredSignup[],
): Promise<void> {
  const results = await Promise.allSettled(
    expiredSignups.map((s) =>
      notify({
        userId: s.userId,
        kind: 'registration_expired',
        payload: { game_id: gameId, game_name: gameName },
      }),
    ),
  );
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[startScheduledGame] registration_expired notify failed', {
        gameId,
        error: r.reason,
      });
    }
  }
}

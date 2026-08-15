import 'server-only';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';

export type ArchiveOpts = {
  userId: string;
  /**
   * Hvis satt: arkiver kun dette ene varselet (✕-knapp per kort).
   * Hvis utelatt: arkiver alle LESTE varsler for brukeren («Tøm leste»).
   */
  notificationId?: string;
};

/**
 * Soft-archive av innboks-varsler for `userId` (#616). Setter `archived_at`
 * så raden skjules fra /innboks-lista — vi sletter aldri rader, historikken
 * beholdes i DB.
 *
 * To moduser:
 *  - `notificationId` satt → arkiver det ene varselet. Vi setter `read_at`
 *    samtidig (coalesce-effekt via egen update) så en arkivert-mens-ulest rad
 *    ikke etterlater en hengende bunn-nav-prikk: tellerne i
 *    `useUnreadNotificationsCount` teller `read_at is null` uavhengig av
 *    archived, og realtime-UPDATE-handleren dekrementerer korrekt på null→satt.
 *  - `notificationId` utelatt → arkiver alle leste (`read_at is not null`).
 *    De er allerede lest, så `read_at` røres ikke og prikken er uberørt.
 *
 * Best-effort: getServerClient() (cookies → RLS via notifications_update_own),
 * feiler stille på error (kaster aldri), blokkerer aldri parent-flyten.
 * Invaliderer innboks-cachen så SSR ikke serverer den arkiverte raden på nytt.
 * Returnerer `false` når DB-en avviste skrivingen, `true` ellers — innboks-
 * handlingene ruller tilbake sin optimistiske state på `false` i stedet for å
 * vise falsk suksess (#1394).
 *
 * De to modusene har ulikt 0-rads-regime (#1665), siden PostgREST returnerer
 * `error == null` også for en UPDATE som traff ingenting (AGENTS.md felle 2):
 *  - ett varsel → raden brukeren nettopp trykket ✕ på SKAL treffes. 0 rader
 *    betyr at skrivingen ble filtrert bort (RLS, feil id, allerede arkivert)
 *    → `false`, så kortet kommer tilbake i lista i stedet for å forsvinne
 *    stille. `.select('id')` er det som gjør radantallet synlig.
 *  - «Tøm leste» → 0 rader er legitimt (ingenting lest å arkivere) og gir
 *    fortsatt `true`.
 */
export async function archiveNotifications(
  opts: ArchiveOpts,
): Promise<boolean> {
  const supabase = await getServerClient();
  const nowIso = new Date().toISOString();

  if (opts.notificationId) {
    // Ett varsel: arkiver + marker lest i samme update (idempotent for
    // allerede-lest — read_at overskrives med en nyere verdi, usynlig siden
    // raden uansett skjules fra lista).
    const { data, error } = await supabase
      .from('notifications')
      .update({ archived_at: nowIso, read_at: nowIso })
      .eq('user_id', opts.userId)
      .eq('id', opts.notificationId)
      .is('archived_at', null)
      .select('id');
    if (error) {
      console.error('[notifications] archive one failed', error);
      return false;
    }
    if ((data?.length ?? 0) === 0) {
      console.error('[notifications] archive one matched 0 rows', {
        notificationId: opts.notificationId,
      });
      return false;
    }
  } else {
    // «Tøm leste»: arkiver alle leste, ikke-arkiverte rader. read_at røres
    // ikke (allerede satt) → bunn-nav-prikken er uberørt.
    const { error } = await supabase
      .from('notifications')
      .update({ archived_at: nowIso })
      .eq('user_id', opts.userId)
      .not('read_at', 'is', null)
      .is('archived_at', null);
    if (error) {
      console.error('[notifications] archive read failed', error);
      return false;
    }
  }

  // Next.js 16 krever to-arg-form for revalidateTag.
  revalidateTag(`notifications-${opts.userId}`, 'max');
  return true;
}

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
 * feiler stille på error, blokkerer aldri parent-flyten. Invaliderer
 * innboks-cachen så SSR ikke serverer den arkiverte raden på nytt.
 */
export async function archiveNotifications(opts: ArchiveOpts): Promise<void> {
  const supabase = await getServerClient();
  const nowIso = new Date().toISOString();

  if (opts.notificationId) {
    // Ett varsel: arkiver + marker lest i samme update (idempotent for
    // allerede-lest — read_at overskrives med en nyere verdi, usynlig siden
    // raden uansett skjules fra lista).
    const { error } = await supabase
      .from('notifications')
      .update({ archived_at: nowIso, read_at: nowIso })
      .eq('user_id', opts.userId)
      .eq('id', opts.notificationId)
      .is('archived_at', null);
    if (error) {
      console.error('[notifications] archive one failed', error);
      return;
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
      return;
    }
  }

  // Next.js 16 krever to-arg-form for revalidateTag.
  revalidateTag(`notifications-${opts.userId}`, 'max');
}

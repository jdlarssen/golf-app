import 'server-only';
import { revalidateTag } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import type { NotificationKind } from './types';

export type MarkReadOpts = {
  userId: string;
  /** Hvis satt, kun varselet med denne id-en markeres (brukes fra /innboks-tap). */
  notificationId?: string;
  /** Hvis satt, kun varsler med denne kind markeres. */
  kind?: NotificationKind;
  /** Hvis satt, kun varsler hvor payload.game_id matcher. */
  entityId?: string;
};

/**
 * Markerer matching uleste varsler som lest for `userId`. Best-effort:
 * feiler stille på error (kaster aldri), blokkerer aldri parent-page-render.
 * Returnerer `false` når DB-en avviste skrivingen, `true` ellers, så
 * interaktive call-sites (innboks-handlingene) kan rulle tilbake sin
 * optimistiske state i stedet for å vise falsk suksess (#1394). `after()`-
 * og page-kallerne bryr seg ikke og `void`-er returverdien som før.
 *
 * Bruker getAdminClient() (service-role, cookies-fri) framfor cookies-
 * klienten fordi flere call-sites kjører inni `after()` (leaderboard,
 * approve, game-home, admin-protokoll), og Next.js 16 forbyr `cookies()`
 * der — cookies-klienten kastet stille og varselet ble aldri markert lest
 * (#726). Speiler maybeAutoConfirmParticipation, som løser samme problem i
 * samme after(). Authz bevares: update-en er alltid scopet `.eq('user_id',
 * userId)`, og hver caller utleder userId server-side (getProxyVerifiedUserId)
 * — aldri klient-levert, så en bruker kan kun markere sine egne varsler.
 * RLS-policyen notifications_update_own blir stående og garderer fortsatt
 * den offentlige PostgREST-flaten.
 *
 * Brukes både ved tap-i-innboks og fra server-side helper på målsider
 * (f.eks. /games/[id]/leaderboard markerer game_finished-varsler for det
 * spillet). Mail-deeplink-klikk havner også her, siden mailen lenker til
 * samme target-rute.
 */
export async function markNotificationsRead(
  opts: MarkReadOpts,
): Promise<boolean> {
  const supabase = getAdminClient();

  let q = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', opts.userId)
    .is('read_at', null);

  if (opts.notificationId) q = q.eq('id', opts.notificationId);
  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.entityId) q = q.eq('payload->>game_id', opts.entityId);

  const { error } = await q;
  if (error) {
    console.error('[notifications] markRead failed', error);
    return false;
  }

  // Next.js 16 krever to-arg-form for revalidateTag.
  revalidateTag(`notifications-${opts.userId}`, 'max');
  return true;
}

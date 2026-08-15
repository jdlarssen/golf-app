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
 * To 0-rads-regimer (#1665), fordi PostgREST returnerer `error == null` for en
 * UPDATE som traff ingenting (AGENTS.md felle 2):
 *  - `notificationId` satt → caller peker på ÉN rad hen nettopp så som ulest
 *    (innboks-tap, produktnytt-banner). 0 rader betyr at skrivingen ble
 *    filtrert bort (RLS, feil id, rad allerede lest) → `false`, så UI-et
 *    ruller tilbake i stedet for å påstå at varselet ble lest. Derfor
 *    `.select('id')` på den grenen — uten den finnes det ikke noe radantall.
 *  - uten id (marker-alle, side-besøk) → 0 rader er helt legitimt (ingenting
 *    ulest å røre) og gir fortsatt `true`. Den grenen henter ingen rader
 *    tilbake; et marker-alle kan treffe hundrevis.
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

  // Single-id: ask for the touched ids back so 0 rows is visible. Bulk: no
  // rows needed — see the two 0-row regimes in the doc comment above.
  const { data, error } = opts.notificationId ? await q.select('id') : await q;
  if (error) {
    console.error('[notifications] markRead failed', error);
    return false;
  }
  if (opts.notificationId && (data?.length ?? 0) === 0) {
    console.error('[notifications] markRead single-id matched 0 rows', {
      notificationId: opts.notificationId,
    });
    return false;
  }

  // Next.js 16 krever to-arg-form for revalidateTag.
  revalidateTag(`notifications-${opts.userId}`, 'max');
  return true;
}

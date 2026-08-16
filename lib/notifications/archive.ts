import 'server-only';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

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

export type ArchiveStaleOpts = {
  userId: string;
  /** Id-ene innboks-siden nettopp fant utdaterte. Tom liste → ingen skriving. */
  ids: string[];
};

/**
 * Arkiver påmeldings-varsler som peker på et slettet spill (#1393).
 *
 * Innboks-siden holdt dem bare utenfor VISNINGEN (#613). Radene ble liggende
 * uleste, og siden bunn-nav-prikken teller `read_at is null`, kunne den aldri
 * slukkes: varselet fantes, men ingen flate kunne åpne det. Vi setter derfor
 * `archived_at` og `read_at` i samme skriving — samme par som ett-varsel-grenen
 * i `archiveNotifications` — så prikken slukker og raden ikke dukker opp igjen.
 * Realtime-hooken ser UPDATE-en og dekrementerer telleren uten reload.
 *
 * Admin-klienten (service-role, cookies-fri) fordi call-siten kjører inni
 * `after()`, der Next.js 16 forbyr `cookies()` — cookies-klienten ville kastet
 * stille og ingenting blitt arkivert (#726, samme grunn som i markRead).
 * Authz bevares: skrivingen er alltid scopet `.eq('user_id', userId)`, og
 * innboks-siden utleder userId server-side via getProxyVerifiedUserId.
 *
 * Best-effort: kaster aldri, blokkerer aldri sida. 0 rader er legitimt her —
 * et parallelt besøk (eller forrige lasting av samme side) kan ha arkivert dem
 * allerede — så vi teller ikke rader, i motsetning til ✕-grenen over.
 */
export async function archiveStaleNotifications(
  opts: ArchiveStaleOpts,
): Promise<boolean> {
  if (opts.ids.length === 0) return true;

  const nowIso = new Date().toISOString();
  const { error } = await getAdminClient()
    .from('notifications')
    .update({ archived_at: nowIso, read_at: nowIso })
    .eq('user_id', opts.userId)
    .in('id', opts.ids)
    .is('archived_at', null);
  if (error) {
    console.error('[innboks] archive stale failed', error);
    return false;
  }

  revalidateTag(`notifications-${opts.userId}`, 'max');
  return true;
}

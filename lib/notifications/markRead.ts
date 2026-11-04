import 'server-only';
import { revalidateTag } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { findSettledActionIds, type InboxRow } from './inboxSections';
import { chunkIds } from './inboxReads';
import { readSettledInputs } from './loadInboxBoard';
import {
  NOT_WAITING_FILTER,
  READ_ON_VISIT,
  WAITING_KINDS,
  visitCanMarkRead,
  type VisitSurface,
} from './readOnVisit';

export type MarkReadOpts = {
  userId: string;
  /** Hvis satt, kun varselet med denne id-en markeres (brukes fra /innboks-tap). */
  notificationId?: string;
  /**
   * Push tap (#2201, `?varsel=`): the target page's own `markReadOnVisit`
   * usually marks the row first, so 0 rows is the normal case. Gives `true`
   * without logging. Only meaningful with `notificationId`.
   */
  zeroRowsOk?: boolean;
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
 *    Unntak: `zeroRowsOk` (push-trykket, #2201), der siden alt har merket
 *    raden → `true`, uten logg.
 *  - uten id (marker-alle) → 0 rader er helt legitimt (ingenting ulest å
 *    røre) og gir fortsatt `true`. Den grenen henter ingen rader tilbake; et
 *    marker-alle kan treffe hundrevis.
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
 * Brukes fra innboksen og ved push-trykk. Målsidene bruker
 * `markReadOnVisit` under.
 *
 * #2759: en rad som venter på deg (`isWaitingRow`), merkes aldri her. Den blir
 * lest når saken er gjort (`markSettledRead`).
 */
export async function markNotificationsRead(
  opts: MarkReadOpts,
): Promise<boolean> {
  const supabase = getAdminClient();

  let q = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', opts.userId)
    .is('read_at', null)
    .or(NOT_WAITING_FILTER);

  if (opts.notificationId) q = q.eq('id', opts.notificationId);

  // Single-id: ask for the touched ids back so 0 rows is visible. Bulk: no
  // rows needed — see the two 0-row regimes in the doc comment above.
  const { data, error } = opts.notificationId ? await q.select('id') : await q;
  if (error) {
    console.error('[notifications] markRead failed', error);
    return false;
  }
  if (opts.notificationId && (data?.length ?? 0) === 0) {
    if (opts.zeroRowsOk) return true;
    console.error('[notifications] markRead single-id matched 0 rows', {
      notificationId: opts.notificationId,
    });
    return false;
  }

  // Next.js 16 krever to-arg-form for revalidateTag.
  revalidateTag(`notifications-${opts.userId}`, 'max');
  return true;
}

export type MarkReadOnVisitOpts = {
  userId: string;
  surface: VisitSurface;
  /** The page's entity (game, cup or club id). Required when the surface has a key. */
  entityId?: string;
};

/**
 * Opening a page marks the viewer's unread notifications that link to it as
 * read (#2201): the surface's kinds from `READ_ON_VISIT`, for this page's
 * entity. One UPDATE per visit.
 *
 * Callers register it in `after()` as soon as the user id (and the entity id)
 * is known, BEFORE the page's status, door, profile or `notFound()` gates:
 * `after()` also runs when `redirect()` or `notFound()` is thrown, so a
 * reminder for a card already delivered is read even though the page sends
 * you on. The write needs no page authz: it touches only the viewer's own
 * rows, `.eq('user_id', userId)` with a server-derived id (same reasoning and
 * admin client as `markNotificationsRead`).
 *
 * Best-effort, never throws. 0 rows is normal (nothing unread), so the cache
 * tag is revalidated only when a row was touched: the hole page renders often.
 *
 * #2759: a row that waits for you stays unread through the visit. The visit is
 * also where the web sees that the matter just got done (you approved the card,
 * so the dot should go out without a trip to the inbox), so it checks the rows
 * that wait about this page's entity and marks the settled ones.
 */
export async function markReadOnVisit(opts: MarkReadOnVisitOpts): Promise<void> {
  const { kinds, key } = READ_ON_VISIT[opts.surface];
  if (key && !opts.entityId) {
    console.error('[notifications] markReadOnVisit without entity id', { surface: opts.surface });
    return;
  }

  try {
    if (visitCanMarkRead(opts.surface)) {
      let q = getAdminClient()
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', opts.userId)
        .is('read_at', null)
        .in('kind', [...kinds])
        .or(NOT_WAITING_FILTER);
      if (key && opts.entityId) q = q.eq(`payload->>${key}`, opts.entityId);

      const { data, error } = await q.select('id');
      if (error) {
        console.error('[notifications] markReadOnVisit failed', { surface: opts.surface, error });
        return;
      }
      if ((data?.length ?? 0) > 0) {
        revalidateTag(`notifications-${opts.userId}`, 'max');
      }
    }
    await settleVisitRows(opts);
  } catch (err) {
    console.error('[notifications] markReadOnVisit failed', { surface: opts.surface, err });
  }
}

/**
 * Pages where no waiting row can have just been finished. The hole page renders
 * for every stroke, and a delivery goes through the submit page; a cup or the
 * history has no waiting rows at all.
 */
const NO_SETTLE_ON_VISIT: ReadonlySet<VisitSurface> = new Set([
  'gameHole',
  'cup',
  'cupResults',
  'cupParticipants',
  'history',
]);

/**
 * The rows that wait about this page's entity, checked against the same rules as
 * the inbox. One small read when nothing waits, which is the usual case; the
 * lookups only run for what these rows need. A page without an entity checks the
 * waiting kinds it answers (the friends page).
 *
 * Exported for a page that has just changed what a rule reads (the game's page,
 * after it confirmed the seat). Best-effort, never throws, like the visit.
 */
export async function settleOnVisit(opts: MarkReadOnVisitOpts): Promise<void> {
  try {
    await settleVisitRows(opts);
  } catch (err) {
    console.error('[notifications] settleOnVisit failed', { surface: opts.surface, err });
  }
}

async function settleVisitRows(opts: MarkReadOnVisitOpts): Promise<void> {
  if (NO_SETTLE_ON_VISIT.has(opts.surface)) return;
  const { kinds, key } = READ_ON_VISIT[opts.surface];
  const admin = getAdminClient();
  let q = admin
    .from('notifications')
    .select('id, kind, payload, read_at, created_at')
    .eq('user_id', opts.userId)
    .is('read_at', null)
    .is('archived_at', null)
    .in('kind', key ? [...WAITING_KINDS] : kinds.filter((kind) => WAITING_KINDS.includes(kind)));
  if (key && opts.entityId) q = q.eq(`payload->>${key}`, opts.entityId);

  const { data, error } = await q.returns<InboxRow[]>();
  if (error) throw error;
  if (!data || data.length === 0) return;

  const now = Date.now();
  const ids = findSettledActionIds(data, await readSettledInputs(admin, opts.userId, data, now));
  await markSettledRead({ userId: opts.userId, ids });
}

export type MarkIdsReadOpts = {
  userId: string;
  /** The rows the caller just saw as unread — a group in the inbox (#2263). */
  ids: string[];
};

/**
 * Marks exactly these notifications read for `userId` (#2263, a tap on a
 * group row in the inbox). By id rather than kind + game: one game can hold a
 * group of signup heads-ups AND a pending request that still needs an answer,
 * and marking the group must not mark the request. #2759: a row among the ids
 * that waits for you stays unread.
 *
 * The ids travel in the request URL, so the write goes in slices of 100
 * (`chunkIds`; a club-scale group holds 150). Same authz as
 * `markNotificationsRead`: the admin client, every slice scoped
 * `.eq('user_id', userId)` with a server-derived id. Same 0-row rule as its
 * single-id branch (#1665): the caller points at rows it just saw unread, so a
 * write that touched none of them was filtered away and reports `false`. A
 * slice that touched none is fine as long as another one did (read elsewhere
 * in the meantime); any slice that errors reports `false`.
 */
export async function markNotificationIdsRead(opts: MarkIdsReadOpts): Promise<boolean> {
  return markIdsRead(opts, true);
}

/**
 * The same write for rows whose matter is done (#2759): the server has seen it
 * (`findSettledActionIds`, or «Godta» on a request already answered), so this is
 * the one path that also marks a row that waits.
 */
export async function markSettledRead(opts: MarkIdsReadOpts): Promise<boolean> {
  return markIdsRead(opts, false);
}

async function markIdsRead(opts: MarkIdsReadOpts, notWaitingOnly: boolean): Promise<boolean> {
  if (opts.ids.length === 0) return true;

  const nowIso = new Date().toISOString();
  let touched = 0;
  for (const slice of chunkIds(opts.ids)) {
    let q = getAdminClient()
      .from('notifications')
      .update({ read_at: nowIso })
      .eq('user_id', opts.userId)
      .in('id', slice)
      .is('read_at', null);
    if (notWaitingOnly) q = q.or(NOT_WAITING_FILTER);
    const { data, error } = await q.select('id');
    if (error) {
      console.error('[notifications] markIdsRead failed', error);
      return false;
    }
    touched += data?.length ?? 0;
  }
  if (touched === 0) {
    console.error('[notifications] markIdsRead matched 0 rows', { count: opts.ids.length });
    return false;
  }

  revalidateTag(`notifications-${opts.userId}`, 'max');
  return true;
}

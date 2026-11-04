import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { archiveStaleNotifications } from './archive';
import { findSettledActionIds, trimToWholeDays, type InboxRow } from './inboxSections';
import { readInChunks } from './inboxReads';
import { markNotificationIdsRead } from './markRead';
import { collectSignupGameIds, partitionStaleSignupNotifications } from './staleNotifications';
import type { NotificationPayload } from './types';

const COLUMNS = 'id, kind, payload, read_at, created_at';
const UNREAD_LIMIT = 500;
const READ_LIMIT = 100;

export type InboxBoardData = {
  /** The rows to show: stale ones out, settled ones already read. */
  rows: InboxRow[];
  /** Signup rows whose game is gone (#1393). The caller archives them. */
  staleIds: string[];
  /** Action rows whose matter is settled (#2263). The caller marks them read. */
  settledIds: string[];
  teeOffByGame: Record<string, string | null>;
  resultByGame: Record<string, ResultSummary | null>;
  finishedGameIds: string[];
  leagueFlightGameIds: string[];
  /** The one «now» of this read, so every relative time on the board agrees. */
  now: number;
};

function gameIdsOf(rows: InboxRow[], kinds: ReadonlySet<string>, unreadOnly = false): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!kinds.has(row.kind) || (unreadOnly && row.read_at != null)) continue;
    // A payload without a game id (only possible through a hand-edited row)
    // must not put `undefined` into an `.in()` list.
    const id = (row.payload as { game_id?: unknown }).game_id;
    if (typeof id === 'string') ids.add(id);
  }
  return [...ids];
}

/**
 * The read behind the inbox (#2263), for the web page and the app's route
 * (#2759). `client` reads as the viewer under RLS: the page's cookie client, or
 * the route's client built from the bearer token.
 *
 * Reads unread and read rows separately, so a busy week of read varsler never
 * pushes an unread one off the list. When a read hits its limit, the rows from
 * its oldest day are dropped so no group shows cut short. Every query that
 * fails throws, so the caller shows an error instead of an empty or wrong inbox
 * (#1392).
 *
 * Not every target page marks its varsel read, so this also finds action rows
 * whose matter is settled — the card was approved, the request answered, the
 * fee paid — and returns them as read. The writes stay with the caller
 * (`settleInboxBoard`, in `after()`): no DB writes during a Next.js 16 render.
 */
export async function loadInboxBoard(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<InboxBoardData> {
  const [unreadRes, readRes] = await Promise.all([
    client
      .from('notifications')
      .select(COLUMNS)
      .eq('user_id', userId)
      .is('archived_at', null)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(UNREAD_LIMIT)
      .returns<InboxRow[]>(),
    client
      .from('notifications')
      .select(COLUMNS)
      .eq('user_id', userId)
      .is('archived_at', null)
      .not('read_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(READ_LIMIT)
      .returns<InboxRow[]>(),
  ]);
  if (unreadRes.error) throw unreadRes.error;
  if (readRes.error) throw readRes.error;

  const notifications = [
    ...trimToWholeDays(unreadRes.data ?? [], UNREAD_LIMIT),
    ...trimToWholeDays(readRes.data ?? [], READ_LIMIT),
  ];

  // Games behind signup rows (do they still exist? when do they start?),
  // result rows (finished, or reopened?) and the organiser's finish rows
  // (#2203: finished yet?). Admin client: an id check on games the user was
  // told about (#613).
  const signupGameIds = collectSignupGameIds(notifications);
  const finishedGameIds = gameIdsOf(
    notifications,
    new Set(['game_finished', 'all_scorecards_delivered', 'game_stale_reminder']),
  );
  const lookupGameIds = [...new Set([...signupGameIds, ...finishedGameIds])];
  // Every `.in()` below goes in slices of 100: the inbox reads up to 600
  // rows, and a list of a few hundred ids overflows the request URL (#2263).
  // A failed lookup would stamp every signup varsel stale — and archive it
  // (#1393). readInChunks throws instead of guessing.
  const games = await readInChunks(lookupGameIds, (slice) =>
    getAdminClient().from('games').select('id, status, scheduled_tee_off_at, league_round_id').in('id', slice),
  );

  let visible = notifications;
  let staleIds: string[] = [];
  if (signupGameIds.length > 0) {
    const existingIds = new Set(games.map((g) => g.id));
    const { visible: kept, stale } = partitionStaleSignupNotifications(notifications, existingIds);
    visible = kept;
    // Hiding them was not enough: they stayed unread and kept the bottom-nav
    // dot lit (#1393), so the caller archives them too.
    staleIds = stale.map((row) => row.id);
  }

  // The viewer's own player row: the result, and whether a reminder is settled.
  const ownGameIds = gameIdsOf(
    visible,
    new Set(['game_finished', 'payment_reminder', 'deliver_reminder', 'missing_score_reminder']),
  );
  const peerGameIds = gameIdsOf(visible, new Set(['peer_approval_request']), true);
  const requestIds = visible.flatMap((row) => {
    if (row.kind !== 'registration_request' || row.read_at != null) return [];
    const id = (row.payload as NotificationPayload<'registration_request'>).request_id;
    return id ? [id] : [];
  });

  const [own, cards, requests] = await Promise.all([
    readInChunks(ownGameIds, (slice) =>
      client
        .from('game_players')
        .select('game_id, result_summary, paid_at, submitted_at')
        .eq('user_id', userId)
        .in('game_id', slice)
        .overrideTypes<Array<{ result_summary: ResultSummary | null }>>(),
    ),
    // RLS «game_players select shared game»: the cards in games you play in.
    readInChunks(peerGameIds, (slice) =>
      client
        .from('game_players')
        .select('game_id, user_id, submitted_at, approved_at')
        .in('game_id', slice),
    ),
    // Admin client, but only for request ids from the user's own varsler.
    readInChunks(requestIds, (slice) =>
      getAdminClient().from('game_registration_requests').select('id, status').in('id', slice),
    ),
  ]);

  const now = Date.now();

  const settledIds = findSettledActionIds(visible, {
    viewerId: userId,
    requestStatus: new Map(requests.map((r) => [r.id, r.status as string])),
    cards,
    own: new Map(own.map((r) => [r.game_id, { paid_at: r.paid_at, submitted_at: r.submitted_at }])),
    lockedGameIds: new Set(
      games.filter((g) => g.status === 'active' || g.status === 'finished').map((g) => g.id),
    ),
    finishedGameIds: new Set(games.filter((g) => g.status === 'finished').map((g) => g.id)),
    now,
  });

  let rows = visible;
  if (settledIds.length > 0) {
    const settled = new Set(settledIds);
    const nowIso = new Date(now).toISOString();
    rows = visible.map((row) => (settled.has(row.id) ? { ...row, read_at: nowIso } : row));
  }

  return {
    rows,
    staleIds,
    settledIds,
    teeOffByGame: Object.fromEntries(games.map((g) => [g.id, g.scheduled_tee_off_at])),
    resultByGame: Object.fromEntries(own.map((r) => [r.game_id, r.result_summary])),
    finishedGameIds: games.filter((g) => g.status === 'finished').map((g) => g.id),
    leagueFlightGameIds: games.filter((g) => g.league_round_id != null).map((g) => g.id),
    now,
  };
}

/**
 * Writes what the read found: stale rows archived, settled rows read. Run it in
 * `after()`, best-effort: the next read finds the same rows again.
 */
export async function settleInboxBoard(
  userId: string,
  board: Pick<InboxBoardData, 'staleIds' | 'settledIds'>,
): Promise<void> {
  if (board.staleIds.length > 0) {
    await archiveStaleNotifications({ userId, ids: board.staleIds });
  }
  if (board.settledIds.length > 0) {
    await markNotificationIdsRead({ userId, ids: board.settledIds });
  }
}

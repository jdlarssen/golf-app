import { after } from 'next/server';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import {
  collectSignupGameIds,
  partitionStaleSignupNotifications,
} from '@/lib/notifications/staleNotifications';
import { archiveStaleNotifications } from '@/lib/notifications/archive';
import { markNotificationIdsRead } from '@/lib/notifications/markRead';
import {
  findSettledActionIds,
  trimToWholeDays,
  type InboxRow,
} from '@/lib/notifications/inboxSections';
import type { NotificationPayload } from '@/lib/notifications/types';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { InboxClient } from './InboxClient';

const COLUMNS = 'id, kind, payload, read_at, created_at';
const UNREAD_LIMIT = 500;
const READ_LIMIT = 100;
// PostgREST carries `.in()` lists in the URL; keep each write's list short.
const WRITE_CHUNK = 100;

function gameIdsOf(rows: InboxRow[], kinds: ReadonlySet<string>, unreadOnly = false): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!kinds.has(row.kind) || (unreadOnly && row.read_at != null)) continue;
    ids.add((row.payload as { game_id: string }).game_id);
  }
  return [...ids];
}

/**
 * /innboks as a board (#2263): KREVER HANDLING, I DAG, TIDLIGERE.
 *
 * Reads unread and read rows separately, so a busy week of read varsler never
 * pushes an unread one off the list. When a read hits its limit, the rows from
 * its oldest day are dropped so no group shows cut short. Every query that
 * fails throws to the error boundary («Prøv igjen») instead of showing an
 * empty or wrong inbox (#1392).
 *
 * Not every target page marks its varsel read, so the page also finds action
 * rows whose matter is settled — the card was approved, the request answered,
 * the fee paid — shows them as read, and marks them read in `after()`.
 */
export default async function InboxPage() {
  const locale = await getLocale();

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login', locale });
  }

  const supabase = await getServerClient();
  // `users.is_admin` is the role the signup page and its answers check
  // (getRoleContext reads the same column). One read, no auth round trip.
  const [roleRes, unreadRes, readRes] = await Promise.all([
    supabase.from('users').select('is_admin').eq('id', userId).maybeSingle(),
    supabase
      .from('notifications')
      .select(COLUMNS)
      .eq('user_id', userId)
      .is('archived_at', null)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(UNREAD_LIMIT)
      .returns<InboxRow[]>(),
    supabase
      .from('notifications')
      .select(COLUMNS)
      .eq('user_id', userId)
      .is('archived_at', null)
      .not('read_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(READ_LIMIT)
      .returns<InboxRow[]>(),
  ]);
  if (roleRes.error) throw roleRes.error;
  if (unreadRes.error) throw unreadRes.error;
  if (readRes.error) throw readRes.error;
  const isAdmin = roleRes.data?.is_admin === true;

  const notifications = [
    ...trimToWholeDays(unreadRes.data ?? [], UNREAD_LIMIT),
    ...trimToWholeDays(readRes.data ?? [], READ_LIMIT),
  ];

  // Games behind signup rows (do they still exist? when do they start?) and
  // result rows (finished, or reopened?). Admin client: an id check on games
  // the user was told about (#613).
  const signupGameIds = collectSignupGameIds(notifications);
  const finishedGameIds = gameIdsOf(notifications, new Set(['game_finished']));
  const lookupGameIds = [...new Set([...signupGameIds, ...finishedGameIds])];
  let games: { id: string; status: string; scheduled_tee_off_at: string | null }[] = [];
  if (lookupGameIds.length > 0) {
    const { data, error } = await getAdminClient()
      .from('games')
      .select('id, status, scheduled_tee_off_at')
      .in('id', lookupGameIds);
    // A failed lookup would stamp every signup varsel stale — and archive it
    // (#1393). Error boundary, not a guess.
    if (error) throw error;
    games = data ?? [];
  }

  let visible = notifications;
  if (signupGameIds.length > 0) {
    const existingIds = new Set(games.map((g) => g.id));
    const { visible: kept, stale } = partitionStaleSignupNotifications(notifications, existingIds);
    visible = kept;
    // Hiding them was not enough: they stayed unread and kept the bottom-nav
    // dot lit (#1393). Archive + mark read on the first visit, in `after()`
    // (no DB writes during render in Next.js 16), best-effort.
    const staleIds = stale.map((row) => row.id);
    if (staleIds.length > 0) {
      after(async () => {
        await archiveStaleNotifications({ userId, ids: staleIds });
      });
    }
  }

  // The viewer's own player row: the result, and whether a reminder is settled.
  const ownGameIds = gameIdsOf(
    visible,
    new Set(['game_finished', 'payment_reminder', 'deliver_reminder']),
  );
  const peerGameIds = gameIdsOf(visible, new Set(['peer_approval_request']), true);
  const requestIds = visible.flatMap((row) => {
    if (row.kind !== 'registration_request' || row.read_at != null) return [];
    const id = (row.payload as NotificationPayload<'registration_request'>).request_id;
    return id ? [id] : [];
  });

  const [ownRes, cardsRes, requestsRes] = await Promise.all([
    ownGameIds.length > 0
      ? supabase
          .from('game_players')
          .select('game_id, result_summary, paid_at, submitted_at')
          .eq('user_id', userId)
          .in('game_id', ownGameIds)
          .overrideTypes<Array<{ result_summary: ResultSummary | null }>>()
      : Promise.resolve({ data: [], error: null }),
    // RLS «game_players select shared game»: the cards in games you play in.
    peerGameIds.length > 0
      ? supabase
          .from('game_players')
          .select('game_id, user_id, submitted_at, approved_at')
          .in('game_id', peerGameIds)
      : Promise.resolve({ data: [], error: null }),
    // Admin client, but only for request ids from the user's own varsler.
    requestIds.length > 0
      ? getAdminClient()
          .from('game_registration_requests')
          .select('id, status')
          .in('id', requestIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (ownRes.error) throw ownRes.error;
  if (cardsRes.error) throw cardsRes.error;
  if (requestsRes.error) throw requestsRes.error;

  const own = ownRes.data ?? [];
  const settledIds = findSettledActionIds(visible, {
    viewerId: userId,
    requestStatus: new Map((requestsRes.data ?? []).map((r) => [r.id, r.status as string])),
    cards: cardsRes.data ?? [],
    own: new Map(own.map((r) => [r.game_id, { paid_at: r.paid_at, submitted_at: r.submitted_at }])),
  });

  // One "now" per request, sent to the client so server and browser write the
  // same relative times. A server component runs once per request — the same
  // exception as the game home page.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  let rows = visible;
  if (settledIds.length > 0) {
    const settled = new Set(settledIds);
    const nowIso = new Date(now).toISOString();
    rows = visible.map((row) => (settled.has(row.id) ? { ...row, read_at: nowIso } : row));
    after(async () => {
      for (let i = 0; i < settledIds.length; i += WRITE_CHUNK) {
        await markNotificationIdsRead({ userId, ids: settledIds.slice(i, i + WRITE_CHUNK) });
      }
    });
  }

  const tSignups = await getTranslations('admin.game.signups');

  return (
    <AppShell flush showVersion={false}>
      <InboxClient
        initialNotifications={rows}
        isAdmin={isAdmin}
        teeOffByGame={Object.fromEntries(games.map((g) => [g.id, g.scheduled_tee_off_at]))}
        resultByGame={Object.fromEntries(own.map((r) => [r.game_id, r.result_summary]))}
        finishedGameIds={games.filter((g) => g.status === 'finished').map((g) => g.id)}
        now={now}
        signupErrorText={{
          game_locked: tSignups('errors.game_locked'),
          no_team_slot: tSignups('errors.no_team_slot'),
        }}
      />
    </AppShell>
  );
}

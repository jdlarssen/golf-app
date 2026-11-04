import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { roundPlayerLocks } from '@/lib/league/roundLocks';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import { chunkIds, readInChunks } from './inboxReads';
import {
  findSettledActionIds,
  inboxActionKey,
  trimToWholeDays,
  type InboxBoard,
  type InboxRow,
  type SettledCard,
  type SettledInputs,
  type SettledOwnPlayer,
} from './inboxSections';
import { isKnownKind } from './readOnVisit';
import { collectSignupGameIds, partitionStaleSignupNotifications } from './staleNotifications';
import type { NotificationPayload } from './types';

const COLUMNS = 'id, kind, payload, read_at, created_at';
const UNREAD_LIMIT = 500;
const READ_LIMIT = 100;

/** The RLS client that reads the viewer's rows, or the admin client inside `after()`. */
type InboxClient = SupabaseClient<Database>;

type GameLookup = {
  id: string;
  status: string;
  scheduled_tee_off_at: string | null;
  league_round_id: string | null;
};

type OwnLookup = SettledOwnPlayer & { game_id: string; result_summary: ResultSummary | null };

type RoundFlightLookup = {
  league_round_id: string;
  status: string;
  game_players: Array<{ user_id: string; withdrawn_at: string | null }>;
};

function payloadGameId(row: InboxRow): string | null {
  // A payload without a game id (only possible through a hand-edited row) must
  // not put `undefined` into an `.in()` list.
  const id = (row.payload as { game_id?: unknown }).game_id;
  return typeof id === 'string' ? id : null;
}

function distinct(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

const isUnread = (row: InboxRow) => row.read_at == null;

/** The unread rows the settle rules read: known kinds with a button. */
function unreadActionRows(rows: InboxRow[]): InboxRow[] {
  return rows.filter((row) => isUnread(row) && isKnownKind(row.kind) && inboxActionKey(row) !== null);
}

/** Games behind the rows (do they still exist, are they over?). An id check on games the viewer was told about (#613). */
function lookupGameIds(rows: InboxRow[]): string[] {
  return distinct([
    ...collectSignupGameIds(rows),
    ...rows.filter((row) => row.kind === 'game_finished').map(payloadGameId),
    ...unreadActionRows(rows).map(payloadGameId),
  ]);
}

/**
 * Every `.in()` below goes in slices of 100: the inbox reads up to 600 rows, and
 * a list of a few hundred ids overflows the request URL (#2263). A failed lookup
 * throws instead of reading as «no rows», which would settle or archive rows
 * that still wait (#1393).
 */
function readGames(gameIds: string[]): Promise<GameLookup[]> {
  return readInChunks(gameIds, (slice) =>
    getAdminClient()
      .from('games')
      .select('id, status, scheduled_tee_off_at, league_round_id')
      .in('id', slice),
  ) as Promise<GameLookup[]>;
}

/**
 * Paged: a club-scale game has 150 cards, so a list of games can outgrow
 * PostgREST's row cap, and a card cut off would read as a card that is gone.
 */
async function readCards(gameIds: string[]): Promise<SettledCard[]> {
  const pages = await Promise.all(
    chunkIds(gameIds).map((slice) =>
      selectAllRows(
        (from, to) =>
          getAdminClient()
            .from('game_players')
            .select('game_id, user_id, submitted_at, approved_at, withdrawn_at, marker_user_id')
            .in('game_id', slice)
            .order('game_id')
            .order('user_id')
            .range(from, to),
        'loadInboxBoard cards',
      ),
    ),
  );
  return pages.flat();
}

/** Kinds whose rule reads the viewer's own player row. */
const OWN_KINDS: ReadonlySet<string> = new Set([
  'peer_approval_request',
  'payment_reminder',
  'deliver_reminder',
  'missing_score_reminder',
  'scorecard_rejected',
  'scorecard_reopened',
  'invite',
  'player_added',
  'team_invite',
]);

/** Does the row's rule read other players' cards in the game? */
function readsCards(row: InboxRow): boolean {
  if (row.kind === 'peer_approval_request' || row.kind === 'league_marker_request') return true;
  const p = row.payload as { player_id?: unknown; card_user_ids?: unknown };
  return (
    (row.kind === 'scorecard_rejected' && p.player_id != null) ||
    (row.kind === 'deliver_reminder' && p.card_user_ids != null)
  );
}

/**
 * What the settle rules need for these rows, and nothing for a kind that is not
 * among them, so a quiet inbox stays a couple of queries.
 *
 * `client` reads the viewer's own player row. The rest is the admin client, with
 * ids that come from the viewer's own rows: a marker can sit outside the flight,
 * where RLS hides the card, and it answers the same on the web, in the app and
 * inside `after()`. None of it reaches the caller beyond what the rules decide.
 */
async function readSettledLookups(
  client: InboxClient,
  userId: string,
  rows: InboxRow[],
  games: GameLookup[],
  now: number,
): Promise<{ inputs: SettledInputs; ownRows: OwnLookup[] }> {
  const admin = getAdminClient();
  const action = unreadActionRows(rows);
  const ofKind = (kind: string) => action.filter((row) => row.kind === kind);

  const ownGameIds = distinct([
    ...rows.filter((row) => row.kind === 'game_finished').map(payloadGameId),
    ...action.filter((row) => OWN_KINDS.has(row.kind)).map(payloadGameId),
  ]);
  const cardGameIds = distinct(action.filter(readsCards).map(payloadGameId));
  const requestIds = distinct(
    ofKind('registration_request').map(
      (row) => (row.payload as NotificationPayload<'registration_request'>).request_id ?? null,
    ),
  );
  const teamGameIds = distinct(ofKind('team_invite').map(payloadGameId));
  const actorIds = distinct(
    ofKind('friend_request').map((row) => (row.payload as NotificationPayload<'friend_request'>).actor_id),
  );
  const clubIds = distinct(
    ofKind('club_join_request').map((row) => (row.payload as NotificationPayload<'club_join_request'>).group_id),
  );
  const roundIds = distinct(
    [...ofKind('league_round_open'), ...ofKind('league_round_closing')].map(
      (row) => (row.payload as NotificationPayload<'league_round_open'>).round_id,
    ),
  );

  const [own, cards, requests, teamRequests, friendships, clubWaits, clubRoles, flights] = await Promise.all([
    readInChunks(ownGameIds, (slice) =>
      client
        .from('game_players')
        .select('game_id, result_summary, paid_at, submitted_at, accepted_at, withdrawn_at')
        .eq('user_id', userId)
        .in('game_id', slice)
        .returns<OwnLookup[]>(),
    ),
    readCards(cardGameIds),
    readInChunks(requestIds, (slice) =>
      admin.from('game_registration_requests').select('id, status').in('id', slice),
    ),
    readInChunks(teamGameIds, (slice) =>
      admin
        .from('game_registration_requests')
        .select('game_id, status')
        .eq('user_id', userId)
        .in('game_id', slice),
    ),
    readInChunks(actorIds, (slice) =>
      admin
        .from('friendships')
        .select('requester_id')
        .eq('addressee_id', userId)
        .eq('status', 'pending')
        .in('requester_id', slice),
    ),
    readInChunks(clubIds, (slice) =>
      admin.from('group_join_requests').select('group_id').eq('status', 'pending').in('group_id', slice),
    ),
    readInChunks(clubIds, (slice) =>
      admin
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .in('role', ['owner', 'admin'])
        .in('group_id', slice),
    ),
    // Only the viewer's own row in each flight, and not one they withdrew from:
    // a league round's flight stays `active`, and withdrawing frees them to
    // start a new one (`roundLocks`).
    readInChunks(roundIds, (slice) =>
      admin
        .from('games')
        .select('league_round_id, status, game_players!inner(user_id, withdrawn_at)')
        .in('league_round_id', slice)
        .eq('game_players.user_id', userId)
        .returns<RoundFlightLookup[]>(),
    ),
  ]);

  const adminOfClubs = new Set(clubRoles.map((row) => row.group_id));
  const playedRoundIds = new Set(
    flights
      .filter((flight) => {
        const locks = roundPlayerLocks([
          {
            status: flight.status,
            players: flight.game_players.map((p) => ({ userId: p.user_id, withdrawnAt: p.withdrawn_at })),
          },
        ]);
        return locks.delivered.has(userId) || locks.inProgress.has(userId);
      })
      .map((flight) => flight.league_round_id),
  );

  return {
    ownRows: own,
    inputs: {
      viewerId: userId,
      now,
      requestStatus: new Map(requests.map((r) => [r.id, r.status as string])),
      cards,
      own: new Map(
        own.map((r) => [
          r.game_id,
          { paid_at: r.paid_at, submitted_at: r.submitted_at, accepted_at: r.accepted_at, withdrawn_at: r.withdrawn_at },
        ]),
      ),
      gameStatus: new Map(games.map((g) => [g.id, g.status])),
      ownRequestStatus: new Map(teamRequests.map((r) => [r.game_id, r.status as string])),
      pendingFriendIds: new Set(friendships.map((r) => r.requester_id)),
      pendingClubIds: new Set(clubWaits.map((r) => r.group_id).filter((id) => adminOfClubs.has(id))),
      playedRoundIds,
    },
  };
}

/**
 * The inputs for `findSettledActionIds`, for any set of rows: the board below,
 * and the rows a page visit checks (`markReadOnVisit`). Throws on a failed read,
 * so a read error never settles anything.
 */
export async function readSettledInputs(
  client: InboxClient,
  userId: string,
  rows: InboxRow[],
  now: number,
): Promise<SettledInputs> {
  const games = await readGames(lookupGameIds(rows));
  return (await readSettledLookups(client, userId, rows, games, now)).inputs;
}

/**
 * The inbox from the first read to the settled ids (#2263, moved here for the
 * app's route in #2759).
 *
 * Reads unread and read rows separately, so a busy week of read varsler never
 * pushes an unread one off the list. When a read hits its limit, the rows from
 * its oldest day are dropped so no group shows cut short. Every query that fails
 * throws, so the caller shows an error instead of an empty or wrong inbox
 * (#1392).
 *
 * Rows whose matter is done are shown as read here, so what the caller renders
 * is right before its `after()` has written them.
 */
export async function loadInboxBoard(client: InboxClient, userId: string): Promise<InboxBoard> {
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

  const games = await readGames(lookupGameIds(notifications));
  const { visible, stale } = partitionStaleSignupNotifications(
    notifications,
    new Set(games.map((g) => g.id)),
  );

  const now = Date.now();
  const { inputs, ownRows } = await readSettledLookups(client, userId, visible, games, now);
  const settledIds = findSettledActionIds(visible, inputs);

  const settled = new Set(settledIds);
  const nowIso = new Date(now).toISOString();
  return {
    rows: visible.map((row) => (settled.has(row.id) ? { ...row, read_at: nowIso } : row)),
    staleIds: stale.map((row) => row.id),
    settledIds,
    teeOffByGame: Object.fromEntries(games.map((g) => [g.id, g.scheduled_tee_off_at])),
    resultByGame: Object.fromEntries(ownRows.map((r) => [r.game_id, r.result_summary])),
    finishedGameIds: games.filter((g) => g.status === 'finished').map((g) => g.id),
    leagueFlightGameIds: games.filter((g) => g.league_round_id != null).map((g) => g.id),
    now,
  };
}

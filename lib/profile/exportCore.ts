import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { emailMatchPattern } from '@/lib/supabase/emailMatch';

/**
 * «Last ned dataene dine» (#2332), one home for both doors: the website's
 * `/profile/export` (cookie session) and the app's `/api/profile/export`
 * (bearer token). Both routes are transport only; which tables go into the
 * file, and how each is read, is decided here.
 *
 * The id passed in is the only id the file is about. It comes from the
 * proxy-verified session or the GoTrue-validated token, never from the
 * request, and every read below filters on it:
 *
 * - The reads in {@link SERVICE_ROLE_READS} use the service role, because RLS
 *   hides rows that are still the user's own data under art. 15/20: their own
 *   `email` and `friend_code` (#2207), their row on someone else's draft
 *   (#2445), a friend request they sent by e-mail that is not answered yet
 *   (0252), an invitation they sent to a round they do not organise, and the
 *   two tables only the server reads (`cup_lineup_slots`,
 *   `product_update_digest_recipients`). There the filter is the only authz.
 * - Everything else goes through the caller's own client, so RLS applies on
 *   top of the filter. Where RLS lets the caller see more than their own rows
 *   (a club's member list, the reactions in a game, everyone's ideas for an
 *   admin), the filter is the authz.
 *
 * A failed read fails the whole export (#2333): the caller gets every row or
 * nothing, never a file that looks whole but is not.
 *
 * `profile.data.exportSublabel` lists what the file holds, and
 * `exportCore.test.ts` keeps that sentence and {@link EXPORT_KEYS} in step.
 */

type Client = SupabaseClient<Database>;
type Row = Record<string, unknown>;

/** The keys of the file after `exported_at`, in file order. */
export const EXPORT_KEYS = [
  'user',
  'game_players',
  'scores',
  'game_registration_requests',
  'league_players',
  'tournament_participants',
  'cup_lineup_slots',
  'invitations',
  'friendships',
  'club_memberships',
  'club_join_requests',
  'handicap_history',
  'notifications',
  'notification_preferences',
  'push_subscriptions',
  'apns_tokens',
  'fcm_tokens',
  'product_update_digest_recipients',
  'ai_consents',
  'kavalkades',
  'kavalkade_shares',
  'reactions',
  'idea_submissions',
] as const;

export type ExportKey = (typeof EXPORT_KEYS)[number];

export type UserExport = { exported_at: string; user: Row } & Record<Exclude<ExportKey, 'user'>, unknown[]>;

/** The read that failed. The two invitation reads are named apart, as before. */
export type ExportRead =
  | Exclude<ExportKey, 'user' | 'invitations'>
  | 'users'
  | 'invitations by email'
  | 'invitations by inviter';

export type BuildUserExportResult =
  | { ok: true; payload: UserExport }
  | { ok: false; read: ExportRead; error: unknown };

/** The reads that go through the service role; see the file comment. */
export const SERVICE_ROLE_READS = [
  'users',
  'game_players',
  'friendships',
  'invitations by inviter',
  'cup_lineup_slots',
  'product_update_digest_recipients',
] as const satisfies readonly ExportRead[];

type ReadResult = { data: unknown[] | null; error: unknown };

class ReadFailed {
  constructor(
    readonly read: ExportRead,
    readonly error: unknown,
  ) {}
}

/** The rows, or a `ReadFailed` naming the read. */
function rowsOf(read: ExportRead, result: ReadResult): unknown[] {
  if (result.error) throw new ReadFailed(read, result.error);
  return result.data ?? [];
}

/** Every row of `table` whose `column` is the user, page by page, sorted on `id`. */
function allOwnRows(client: Client, table: 'handicap_history' | 'notifications' | 'reactions', userId: string) {
  return selectAllRowsResult(
    (from, to) => client.from(table).select('*').eq('user_id', userId).order('id').range(from, to),
    `profile export ${table}`,
  );
}

/**
 * Builds the file for `userId`. `rlsClient` reads as the caller: the web
 * route passes its cookie client, the app route `callerScopedClient`.
 * Throws only what `getAdminClient()` throws (a missing service key); the
 * routes answer that with the same 500.
 */
export async function buildUserExport(userId: string, rlsClient: Client): Promise<BuildUserExportResult> {
  try {
    const admin = getAdminClient();

    const userResult = await admin.from('users').select('*').eq('id', userId).maybeSingle();
    if (userResult.error) throw new ReadFailed('users', userResult.error);
    // Without the row there is no address to match invitations on.
    if (!userResult.data) throw new ReadFailed('users', 'no users row for verified id');
    const user = userResult.data as Row & { email: string };

    const gamePlayers = rowsOf('game_players', await admin.from('game_players').select('*').eq('user_id', userId));

    // Only the user's own scores and the ones they entered for others. The
    // rest of the game is other players' data (art. 20 does not reach it).
    const scores = rowsOf(
      'scores',
      await selectAllRowsResult(
        (from, to) =>
          rlsClient
            .from('scores')
            .select('*')
            .or(`user_id.eq.${userId},entered_by.eq.${userId}`)
            .order('id')
            .range(from, to),
        'profile export scores',
      ),
    );

    // Invitations to the user's address (case-insensitive, #2207) and the ones
    // they sent, merged on id.
    const invitationsByEmail = rowsOf(
      'invitations by email',
      await rlsClient.from('invitations').select('*').filter('email', 'imatch', emailMatchPattern(user.email)),
    );
    // Service role: the sender's own session reads a sent invitation only when
    // it has no game or the sender organises the game. One sent as a team
    // captain or a player is hidden, and so would be left out.
    const invitationsByInviter = rowsOf(
      'invitations by inviter',
      await admin.from('invitations').select('*').eq('invited_by', userId),
    );
    const invitations = Array.from(
      new Map([...invitationsByEmail, ...invitationsByInviter].map((row) => [(row as { id: string }).id, row])).values(),
    );

    // Every friendship the user is part of, any status. Service role: a
    // request the user sent by e-mail is hidden from their own session until
    // it is answered (0252), and it is still a row about them.
    const friendships = rowsOf(
      'friendships',
      await selectAllRowsResult(
        (from, to) =>
          admin
            .from('friendships')
            .select('*')
            .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
            .order('id')
            .range(from, to),
        'profile export friendships',
      ),
    );

    const clubMemberships = rowsOf(
      'club_memberships',
      await rlsClient.from('group_members').select('group_id, role, joined_at, groups(name)').eq('user_id', userId),
    );

    // Sign-ups, league and cup participation, and requests to join a club.
    const gameRegistrationRequests = rowsOf(
      'game_registration_requests',
      await rlsClient.from('game_registration_requests').select('*').eq('user_id', userId),
    );
    const leaguePlayers = rowsOf(
      'league_players',
      await rlsClient.from('league_players').select('*').eq('user_id', userId),
    );
    const tournamentParticipants = rowsOf(
      'tournament_participants',
      await rlsClient.from('tournament_participants').select('*').eq('user_id', userId),
    );
    const cupLineupSlots = rowsOf(
      'cup_lineup_slots',
      await admin.from('cup_lineup_slots').select('*').eq('user_id', userId),
    );
    const clubJoinRequests = rowsOf(
      'club_join_requests',
      await rlsClient.from('group_join_requests').select('*').eq('user_id', userId),
    );

    // The devices that get notifications. The web row leaves out the two
    // encryption keys (`p256dh`, `auth`): they are secrets of the browser, and
    // the file may end up in a mail or a shared folder.
    const pushSubscriptions = rowsOf(
      'push_subscriptions',
      await rlsClient
        .from('push_subscriptions')
        .select('id, user_id, endpoint, user_agent, created_at, last_used_at')
        .eq('user_id', userId),
    );
    const apnsTokens = rowsOf('apns_tokens', await rlsClient.from('apns_tokens').select('*').eq('user_id', userId));
    const fcmTokens = rowsOf('fcm_tokens', await rlsClient.from('fcm_tokens').select('*').eq('user_id', userId));
    // Which months the newsletter reached the user (0246).
    const digestRecipients = rowsOf(
      'product_update_digest_recipients',
      await admin.from('product_update_digest_recipients').select('*').eq('user_id', userId),
    );

    // #2332: the rest of what Tørny keeps about the user. Reactions are the
    // ones the user gave (`user_id`), not the ones they got.
    const handicapHistory = rowsOf('handicap_history', await allOwnRows(rlsClient, 'handicap_history', userId));
    const notifications = rowsOf('notifications', await allOwnRows(rlsClient, 'notifications', userId));
    // #2315: the push choices, one row or none.
    const notificationPreferences = rowsOf(
      'notification_preferences',
      await rlsClient.from('notification_preferences').select('*').eq('user_id', userId),
    );
    const aiConsents = rowsOf('ai_consents', await rlsClient.from('ai_consents').select('*').eq('user_id', userId));
    const kavalkades = rowsOf('kavalkades', await rlsClient.from('kavalkades').select('*').eq('user_id', userId));
    const kavalkadeShares = rowsOf(
      'kavalkade_shares',
      await rlsClient.from('kavalkade_shares').select('*').eq('user_id', userId),
    );
    const reactions = rowsOf('reactions', await allOwnRows(rlsClient, 'reactions', userId));
    const ideaSubmissions = rowsOf(
      'idea_submissions',
      await rlsClient.from('idea_submissions').select('*').eq('user_id', userId),
    );

    return {
      ok: true,
      payload: {
        exported_at: new Date().toISOString(),
        user,
        game_players: gamePlayers,
        scores,
        game_registration_requests: gameRegistrationRequests,
        league_players: leaguePlayers,
        tournament_participants: tournamentParticipants,
        cup_lineup_slots: cupLineupSlots,
        invitations,
        friendships,
        club_memberships: clubMemberships,
        club_join_requests: clubJoinRequests,
        handicap_history: handicapHistory,
        notifications,
        notification_preferences: notificationPreferences,
        push_subscriptions: pushSubscriptions,
        apns_tokens: apnsTokens,
        fcm_tokens: fcmTokens,
        product_update_digest_recipients: digestRecipients,
        ai_consents: aiConsents,
        kavalkades,
        kavalkade_shares: kavalkadeShares,
        reactions,
        idea_submissions: ideaSubmissions,
      },
    };
  } catch (failure) {
    if (failure instanceof ReadFailed) return { ok: false, read: failure.read, error: failure.error };
    throw failure;
  }
}

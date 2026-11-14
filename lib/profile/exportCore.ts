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
 * - `users` and `game_players` are read with the service role (#2207: the
 *   user's own `email` and `friend_code` are not readable through their
 *   session; #2445: their row on someone else's draft is hidden by RLS, yet it
 *   is still their data under art. 15/20).
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
  'invitations',
  'friendships',
  'club_memberships',
  'handicap_history',
  'notifications',
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
    const invitationsByInviter = rowsOf(
      'invitations by inviter',
      await rlsClient.from('invitations').select('*').eq('invited_by', userId),
    );
    const invitations = Array.from(
      new Map([...invitationsByEmail, ...invitationsByInviter].map((row) => [(row as { id: string }).id, row])).values(),
    );

    // Every friendship the user is part of, any status.
    const friendships = rowsOf(
      'friendships',
      await selectAllRowsResult(
        (from, to) =>
          rlsClient
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

    // #2332: the rest of what Tørny keeps about the user. Reactions are the
    // ones the user gave (`user_id`), not the ones they got.
    const handicapHistory = rowsOf('handicap_history', await allOwnRows(rlsClient, 'handicap_history', userId));
    const notifications = rowsOf('notifications', await allOwnRows(rlsClient, 'notifications', userId));
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
        invitations,
        friendships,
        club_memberships: clubMemberships,
        handicap_history: handicapHistory,
        notifications,
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

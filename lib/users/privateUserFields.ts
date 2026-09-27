import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

export type PrivateUserFields = { email: string; friendCode: string };

/**
 * `users.email` and `users.friend_code` for the given ids (#2207).
 *
 * The two columns are not readable through a signed-in user's own session:
 * RLS decides which rows a caller sees, and this helper only fills in the
 * private fields afterwards, with the admin client. Use it for
 *   (a) the caller's own row (a verified id), or
 *   (c) a server-side mail/notification send — the value never reaches the
 *       client.
 * Pass only ids from rows you already read with your own client, so the row
 * set stays the one RLS gave you. Admin surfaces behind `requireAdmin` (b)
 * switch the one query to the admin client instead: an admin sees every row
 * anyway.
 *
 * An empty list returns an empty map without a query. Throws on a query
 * error, so a failed read never looks like "no address".
 */
export async function getPrivateUserFields(
  userIds: readonly string[],
): Promise<Map<string, PrivateUserFields>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();

  const { data, error } = await getAdminClient()
    .from('users')
    .select('id, email, friend_code')
    .in('id', ids)
    .returns<{ id: string; email: string; friend_code: string }[]>();
  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [row.id, { email: row.email, friendCode: row.friend_code }]),
  );
}

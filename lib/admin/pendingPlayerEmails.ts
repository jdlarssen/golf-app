import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A roster is far below this; anything longer is not our redirect. */
const MAX_IDS = 50;

/**
 * The `{list}` text for the admin missing-profile banner (#2207): `: a, b`,
 * or '' when there is nothing to name.
 *
 * The publish and start gates redirect an admin with `pending=<id>,<id>`
 * instead of the addresses themselves, so no e-post ever sits in a URL. The
 * admin game page and the admin edit page turn the ids back into addresses
 * here, with the admin client (users.email is not readable through a user
 * session).
 *
 * Call it only AFTER `requireAdmin`: the query string is user input, and the
 * gate in the route is what makes this an admin surface. Anything that is not
 * a uuid is dropped, and at most 50 ids are looked up. A failed lookup names
 * nobody rather than failing the page.
 */
export async function pendingPlayerList(raw: string | undefined): Promise<string> {
  const ids = [
    ...new Set(
      (raw ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => UUID.test(part)),
    ),
  ].slice(0, MAX_IDS);
  if (ids.length === 0) return '';

  const { data, error } = await getAdminClient()
    .from('users')
    .select('id, email')
    .in('id', ids)
    .returns<{ id: string; email: string | null }[]>();
  if (error) {
    console.error('[pendingPlayerList] lookup failed', error);
    return '';
  }

  const emailById = new Map((data ?? []).map((row) => [row.id, row.email]));
  const emails = ids
    .map((id) => emailById.get(id))
    .filter((email): email is string => Boolean(email));
  return emails.length > 0 ? `: ${emails.join(', ')}` : '';
}

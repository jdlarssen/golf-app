import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Whose guest is it? (audit 20.11, migration 0251)
 *
 * A guest (`users.is_guest`) goes on a non-admin's roster only when that
 * person made the guest (`users.guest_created_by`), or already has the guest
 * in a round they created. The rule has one home, the SQL function
 * `guest_usable_by`; the insert guard on `game_players` asks it for a signed-in
 * client, and this file asks it for the server paths that write guest rows
 * with the service role (create, edit, add player) and for the pickers.
 *
 * A global admin may use any guest (the curator model, same as the invite
 * gate #906). The SQL function says so itself, so no caller has to know
 * whether the actor is an admin.
 */

/**
 * The guests among `userIds` that `actorUserId` may NOT put on a roster.
 * Ids that are not guests are never in the answer.
 *
 * Throws when the lookup fails: a caller that writes must refuse, and a
 * caller that lists must decide for itself what to show.
 */
export async function findForeignGuestIds(
  actorUserId: string,
  userIds: readonly string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await getAdminClient().rpc('foreign_guest_ids', {
    p_actor: actorUserId,
    p_ids: [...userIds],
  });
  if (error) {
    throw new Error(`findForeignGuestIds: ${error.message}`);
  }
  return new Set(data ?? []);
}

/**
 * For lists and prefills: `rows` without the guests the actor may not use.
 * A failed lookup drops every guest (`isGuest` rows): the list gets shorter,
 * never wrong, and the write paths refuse on their own.
 */
export async function withoutForeignGuests<T extends { id: string; isGuest?: boolean }>(
  actorUserId: string,
  rows: readonly T[],
): Promise<T[]> {
  const guestIds = rows.filter((r) => r.isGuest).map((r) => r.id);
  if (guestIds.length === 0) return [...rows];
  try {
    const foreign = await findForeignGuestIds(actorUserId, guestIds);
    return rows.filter((r) => !foreign.has(r.id));
  } catch (error) {
    console.error('[withoutForeignGuests] lookup failed, guests left out', error);
    return rows.filter((r) => !r.isGuest);
  }
}

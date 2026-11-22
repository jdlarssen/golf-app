import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';

/**
 * Records when a membership ended, so the 7-day wait before a new join
 * request (`joinRequestWaitUntil`, the owner's «Etter 7 dager») can count
 * from it. A leave or a removal deletes the `group_members` row and leaves no
 * timestamp, so the person's `group_join_requests` row (one per club and
 * person, UNIQUE in 0075) carries it: status `withdrawn`, `decided_at` = now,
 * `decided_by_user_id` = who ended it. A member added by e-mail has no row;
 * the upsert creates one.
 *
 * Callers stamp BEFORE the membership delete and stop when this returns
 * false: a stamp without a delete is harmless (a member cannot request), a
 * delete without a stamp would skip the wait. Runs on the service role, after
 * the caller's own authorization; the guard trigger (0107) keeps the decision
 * columns away from the requester's own client.
 *
 * Memberships removed outside `leaveClub` and `removeMember` (SQL, account
 * deletion, club deletion) get no stamp.
 */
export async function stampMembershipClosed(
  groupId: string,
  userId: string,
  actorId: string,
): Promise<boolean> {
  try {
    expectAffected(
      await getAdminClient()
        .from('group_join_requests')
        .upsert(
          {
            group_id: groupId,
            user_id: userId,
            status: 'withdrawn',
            message: null,
            decided_at: new Date().toISOString(),
            decided_by_user_id: actorId,
          },
          { onConflict: 'group_id,user_id' },
        )
        .select('id'),
      'stampMembershipClosed',
    );
    return true;
  } catch (err) {
    console.error('[stampMembershipClosed] failed', { groupId, userId, err });
    return false;
  }
}

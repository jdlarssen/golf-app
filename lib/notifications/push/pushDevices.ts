import 'server-only';
import type { getAdminClient } from '@/lib/supabase/admin';
import { chunkIds } from '../inboxReads';

type AdminClient = ReturnType<typeof getAdminClient>;

/**
 * Who among `userIds` has a device to push to (#2974): a row in any of the
 * three tables `sendPushToUser` reads — web push (`push_subscriptions`), an
 * iPhone (`apns_tokens`) or Android (`fcm_tokens`). A dead registration is
 * pruned when a push to it fails, so a row is a fair «has a device».
 *
 * One read per table for the whole list, in slices (`chunkIds`: an `.in()`
 * list rides in the URL). Throws on a failed read: the caller decides what a
 * player it knows nothing about should get.
 */
export async function usersWithPushDevice(
  admin: AdminClient,
  userIds: readonly string[],
): Promise<Set<string>> {
  const withDevice = new Set<string>();
  const slices = chunkIds(userIds);
  const reads = await Promise.all([
    ...slices.map((ids) =>
      admin.from('push_subscriptions').select('user_id').in('user_id', ids).returns<{ user_id: string }[]>(),
    ),
    ...slices.map((ids) =>
      admin.from('apns_tokens').select('user_id').in('user_id', ids).returns<{ user_id: string }[]>(),
    ),
    ...slices.map((ids) =>
      admin.from('fcm_tokens').select('user_id').in('user_id', ids).returns<{ user_id: string }[]>(),
    ),
  ]);
  for (const { data, error } of reads) {
    if (error) throw new Error(`push device read: ${error.message}`);
    for (const row of data ?? []) withDevice.add(row.user_id);
  }
  return withDevice;
}

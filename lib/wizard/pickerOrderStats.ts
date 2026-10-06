import 'server-only';
import { getFriendStats } from '@/lib/friends/getFriendStats';
import type { FriendStats } from '@/lib/friends/friendStats';

/**
 * «Last played» for the step 4 picker (#2321): one `getFriendStats` call,
 * which splits its own `.in()` lists (#2267).
 *
 * Best-effort: a failed lookup logs `[pickerOrderStats]` and returns an empty
 * map, so the picker falls back to name order instead of taking the wizard
 * down. Only the order leaves the server; the stats themselves never reach the
 * client.
 */
export async function getPickerOrderStats(
  userId: string,
  ids: readonly string[],
): Promise<Map<string, FriendStats>> {
  if (ids.length === 0) return new Map();
  try {
    return await getFriendStats(userId, ids);
  } catch (error) {
    console.error('[pickerOrderStats] lookup failed', error);
    return new Map();
  }
}

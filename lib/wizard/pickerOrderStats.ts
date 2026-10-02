import 'server-only';
import { getFriendStats } from '@/lib/friends/getFriendStats';
import type { FriendStats } from '@/lib/friends/friendStats';
import { PICKER_STATS_CHUNK, chunkIds } from '@/lib/wizard/pickerOrder';

/**
 * «Last played» for the step 4 picker (#2321): `getFriendStats` per chunk of
 * at most 100 ids, in parallel, merged into one map.
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
    const maps = await Promise.all(
      chunkIds(ids, PICKER_STATS_CHUNK).map((chunk) => getFriendStats(userId, chunk)),
    );
    return new Map(maps.flatMap((m) => [...m]));
  } catch (error) {
    console.error('[pickerOrderStats] lookup failed', error);
    return new Map();
  }
}

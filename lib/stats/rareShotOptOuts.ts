import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRows } from '@/lib/supabase/selectAllRows';
import type { RareMoment } from '@/lib/stats/rareMoments';

/**
 * «Del sjeldne slag med alle» (#2894): the players who said no. Their rare shots are left
 * out of everything everyone sees: the «Sjeldne slag» card now, the honour list and the
 * notification to everyone later. Friends and the league still get `friend_achievement`.
 *
 * The choice lives in `notification_preferences.share_rare_shots` (0238); no row means
 * yes, so only the `false` rows are read. Service role: the row is owner-only under RLS,
 * and the caller is the port, so the ids never leave the server. Not cached, so a
 * switch takes effect on the next read. Throws on a failed read: the caller fails closed
 * rather than show someone who said no.
 */
export async function getRareShotOptOuts(): Promise<Set<string>> {
  const supabase = getAdminClient();
  const rows = await selectAllRows(
    (from, to) =>
      supabase
        .from('notification_preferences')
        .select('user_id')
        .eq('share_rare_shots', false)
        .order('user_id')
        .range(from, to),
    'rare shot opt-outs',
  );
  return new Set(rows.map((r) => r.user_id));
}

/** The moments everyone may see: none by a player who said no, also not to that player. */
export function sharedMomentsOnly(
  moments: readonly RareMoment[],
  optOuts: ReadonlySet<string>,
): RareMoment[] {
  return moments.filter((m) => !optOuts.has(m.userId));
}

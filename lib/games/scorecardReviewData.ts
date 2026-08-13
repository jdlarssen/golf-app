import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { COURSE_HOLES_SELECT } from '@/lib/supabase/queryFragments';

/**
 * Course-hole row as the scorecard review table needs it. Mirrors the
 * `COURSE_HOLES_SELECT` fragment.
 */
export type ScorecardHole = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

/**
 * Holes + per-player scores for reviewing submitted scorecards (#1586).
 * Shared by the creator approval list and the Sekretariatet submitted list.
 *
 * `scoresClient` is separate from `holesClient` because the two surfaces
 * differ in authz: the Sekretariatet page reads scores with the admin's
 * session client (the `is_admin()` branch of the scores RLS), while the
 * creator page must use the service-role client — its viewer gate is
 * `requireAdminOrCreator` on the route, and the RLS client would silently
 * return nothing for other flights or hidden score visibility (#1542: the
 * gate at the call-site IS the enforcement).
 */
export async function fetchScorecardReviewData(
  holesClient: SupabaseClient<Database>,
  scoresClient: SupabaseClient<Database>,
  gameId: string,
  courseId: string | null,
  userIds: string[],
): Promise<{
  holes: ScorecardHole[];
  scoresByUser: Map<string, Map<number, number | null>>;
}> {
  if (!courseId || userIds.length === 0) {
    return { holes: [], scoresByUser: new Map() };
  }
  const [holesRes, scoresRes] = await Promise.all([
    holesClient
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', courseId)
      .order('hole_number', { ascending: true })
      .returns<ScorecardHole[]>(),
    scoresClient
      .from('scores')
      .select('user_id, hole_number, strokes')
      .eq('game_id', gameId)
      .in('user_id', userIds)
      .returns<{ user_id: string; hole_number: number; strokes: number | null }[]>(),
  ]);
  if (holesRes.error) throw holesRes.error;
  if (scoresRes.error) throw scoresRes.error;
  const scoresByUser = new Map<string, Map<number, number | null>>();
  for (const s of scoresRes.data ?? []) {
    let inner = scoresByUser.get(s.user_id);
    if (!inner) {
      inner = new Map();
      scoresByUser.set(s.user_id, inner);
    }
    inner.set(s.hole_number, s.strokes);
  }
  return { holes: holesRes.data ?? [], scoresByUser };
}

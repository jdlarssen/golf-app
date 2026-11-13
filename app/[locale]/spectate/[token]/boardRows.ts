import 'server-only';
import type { getAdminClient } from '@/lib/supabase/admin';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import {
  COURSE_HOLES_SELECT,
  SCORES_SELECT,
  type CourseHoleRow,
} from '@/lib/supabase/queryFragments';
import { holeNumbersForSegment } from '@/lib/games/holeScope';
import type { HoleSegment } from '@/lib/scoring/holeSegment';
import type { TvFeedScore } from '@/lib/leaderboard/tvBoard';

type AdminClient = ReturnType<typeof getAdminClient>;

/**
 * The holes and scores behind a public board (#2275, shared with the embed
 * card in #2330), read with the service-role client. Call it only after the
 * `spectate_token` is resolved: the token is the whole authorisation. A
 * derived game owns no scores and reads the host game's (#1441). Rows are
 * kept to the game's segment. Errors are thrown: both pages' `error.tsx`
 * retry by themselves.
 */
export async function readBoardRows(
  admin: AdminClient,
  game: { course_id: string; hole_segment: HoleSegment; source_game_id: string | null },
  gameId: string,
): Promise<{ holesRows: CourseHoleRow[]; scoresRows: TvFeedScore[] }> {
  const scoresGameId = game.source_game_id ?? gameId;
  const [holesRes, scoresRes] = await Promise.all([
    admin
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    selectAllRowsResult(
      (from, to) =>
        admin
          .from('scores')
          .select(`${SCORES_SELECT}, updated_at`)
          .eq('game_id', scoresGameId)
          .order('id')
          .range(from, to)
          .returns<TvFeedScore[]>(),
      'spectate tv scores',
    ),
  ]);
  if (holesRes.error) throw holesRes.error;
  if (scoresRes.data === null) throw scoresRes.error;

  const inSegment = new Set(holeNumbersForSegment(game.hole_segment));
  return {
    holesRows: (holesRes.data ?? []).filter((h) => inSegment.has(h.hole_number)),
    scoresRows: scoresRes.data.filter((s) => inSegment.has(s.hole_number)),
  };
}

/** The course's name for a title line; a missing course or a failed read is no name, never an error. */
export async function readCourseName(admin: AdminClient, courseId: string | null): Promise<string | null> {
  if (!courseId) return null;
  try {
    const { data } = await admin
      .from('courses')
      .select('name')
      .eq('id', courseId)
      .maybeSingle<{ name: string }>();
    return data?.name ?? null;
  } catch {
    return null;
  }
}

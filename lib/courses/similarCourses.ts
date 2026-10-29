'use server';

import { getServerClient } from '@/lib/supabase/server';
import { clipQuery, MIN_QUERY_LENGTH } from './similarCoursesPanel';

/** One row under «Finnes banen alt?» (#2485). */
export type SimilarCourse = {
  id: string;
  name: string;
  holeCount: number;
  par: number;
  teeCount: number;
  roundCount: number;
};

/**
 * Courses that look like the name being typed on the new-course form (#2485).
 * The match rule lives in the `similar_courses` RPC (0222); it only counts the
 * rounds with definer rights, the rest is readable for everyone anyway. Best
 * effort: under three characters or on an error the answer is `[]`, so the
 * panel just stays away and the form works as before.
 */
export async function findSimilarCourses(query: string): Promise<SimilarCourse[]> {
  const q = clipQuery(query);
  if (q.length < MIN_QUERY_LENGTH) return [];
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc('similar_courses', { p_query: q });
  if (error) {
    console.error('[findSimilarCourses] similar_courses failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    holeCount: row.hole_count,
    par: row.par,
    teeCount: row.tee_count,
    roundCount: row.round_count,
  }));
}

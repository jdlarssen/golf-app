// native/app/src/data/similarCourses.ts
// #2757: «Finnes banen alt?» i appen, samme RPC som nettet (`similar_courses`,
// 0222; hvilke navn som ligner, har sitt ene hjem der).
//
// Lista stopper aldri noen: en feil gir tom liste og en linje i loggen, aldri en
// melding, som på nettet (`findSimilarCourses`).
import { clipQuery, isSearchable } from '../../../../lib/courses/similarCoursesPanel';
import { supabase } from '../supabase';

export type SimilarCourse = {
  id: string;
  name: string;
  holeCount: number;
  par: number;
  teeCount: number;
  roundCount: number;
};

export async function fetchSimilarCourses(query: string): Promise<SimilarCourse[]> {
  if (!isSearchable(query)) return [];
  const { data, error } = await supabase.rpc('similar_courses', { p_query: clipQuery(query) });
  if (error) {
    console.error('[similarCourses] similar_courses feilet', error);
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

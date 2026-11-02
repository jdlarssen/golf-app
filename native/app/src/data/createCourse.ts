// native/app/src/data/createCourse.ts
// #2757: lagringen av en ny bane, samme RPC som nettets `createCourse`.
//
// `create_course_with_layout` (0224) kjører de tre insertene i én transaksjon, er
// `security definer`, bare for innloggede, og setter `created_by = auth.uid()`
// selv. Appen sender det den delte parseren ga, og ingenting annet.
//
// **Tom `data` er en feil (trap 2):** uten bane-id kan veiviseren ikke velge banen.
// **Ikke i sync-køen:** kallet er ikke idempotent, og en kø-retry ville laget to
// baner. Lagringen krever nett, som publiseringen av en runde (#1854).
import type { ParsedCourseForm } from '../../../../lib/courses/parseCourseForm';
import { supabase } from '../supabase';
import { isNetworkFailureMessage } from './timedFetch';

export type CreateCourseFailure = 'network' | 'not_authenticated' | 'db' | 'no_row';

export type CreateCourseResult =
  | { ok: true; courseId: string }
  | { ok: false; code: CreateCourseFailure };

export async function createCourse(parsed: ParsedCourseForm): Promise<CreateCourseResult> {
  // `id` er for redigering på nettet (`updateCourse`); en ny bane har ingen.
  const tees = parsed.teeBoxes.map((tee) => {
    const { id: _id, ...row } = tee;
    return row;
  });
  const { data, error } = await supabase.rpc('create_course_with_layout', {
    p_name: parsed.name,
    p_holes: parsed.holes,
    p_tees: tees,
    p_nine_holes: parsed.nineHoles,
  });
  if (error) {
    if (isNetworkFailureMessage(error.message)) return { ok: false, code: 'network' };
    console.error('[createCourse] create_course_with_layout feilet', error);
    return {
      ok: false,
      code: error.message.includes('not_authenticated') ? 'not_authenticated' : 'db',
    };
  }
  if (typeof data !== 'string' || data === '') {
    console.error('[createCourse] create_course_with_layout ga ingen bane-id');
    return { ok: false, code: 'no_row' };
  }
  return { ok: true, courseId: data };
}

import 'server-only';
import { cacheLife } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getAdminClient } from '@/lib/supabase/admin';
import { getRatingForGender } from '@/lib/games/teeRating';
import type { TeeBoxRatings } from '@/lib/games/teeRating';
import type { Database } from '@/lib/database.types';

/**
 * Public course pages (#1023, epic #1021 «Vindu ut»). All data for these
 * pages is read with a **cookie-free anon client** — never `getServerClient`
 * (needs a request-scoped cookie store, which `'use cache'` scopes forbid,
 * per the `getGameWithPlayers` cache doctrine) and never `getAdminClient`
 * for course/hole/tee data (RLS is the real authz layer, AGENTS.md rule 3;
 * `courses`/`course_holes`/`tee_boxes` are already world-readable per the
 * contract's verified RLS research, so anon is sufficient and safer).
 *
 * The ONE exception: resolving "is the creator an admin" requires reading
 * `users.is_admin`, and `users` SELECT is NOT world-readable — verified live
 * against staging with a plain anon-key curl (`users?select=id,is_admin`
 * returns `[]`, and the `courses?select=...,users:created_by(is_admin)`
 * embed resolves to `null`). The admin client is used ONLY for that single
 * column lookup, keyed by the small set of distinct `created_by` ids on the
 * page — it never touches game/score data and the result (a boolean per
 * user id) carries no information beyond what "is this course curated by an
 * admin" already implies.
 */

function getPublicAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export type PublicTeeRow = TeeBoxRatings & {
  archived_at: string | null;
};

export type EligibilityCourseRow = {
  creatorIsAdmin: boolean;
  holeCount: number;
  tees: PublicTeeRow[];
};

/**
 * Pure eligibility predicate (contract Design → "Kvalifisert bane"): a
 * course is publicly listed iff its creator is an admin AND it has ≥9 holes
 * AND at least one non-archived tee has a complete rating (slope + course
 * rating + par) for at least one gender.
 */
export function isPubliclyEligible(course: EligibilityCourseRow): boolean {
  if (!course.creatorIsAdmin) return false;
  if (course.holeCount < 9) return false;
  return course.tees.some(
    (tee) =>
      tee.archived_at === null &&
      (getRatingForGender(tee, 'mens') !== null ||
        getRatingForGender(tee, 'ladies') !== null ||
        getRatingForGender(tee, 'juniors') !== null),
  );
}

const TEE_COLUMNS =
  'id, name, length_meters, archived_at, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors';

type RawCourseRow = {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  course_holes: { hole_number: number }[];
  tee_boxes: (PublicTeeRow & { id: string; name: string; length_meters: number | null })[];
};

/**
 * Which `created_by` user ids are admins. Isolated so it's the only call
 * site touching the admin client (see module doc for why).
 */
async function fetchAdminUserIds(userIds: (string | null)[]): Promise<Set<string>> {
  const distinct = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (distinct.length === 0) return new Set();
  const { data, error } = await getAdminClient()
    .from('users')
    .select('id')
    .in('id', distinct)
    .eq('is_admin', true);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.id));
}

export type PublicCourseSummary = {
  id: string;
  name: string;
  slug: string;
  holeCount: number;
  teeCount: number;
};

/**
 * List all publicly eligible courses (id, name, slug, hole/tee counts) for
 * `/baner`. Cached for days — course rosters change ~never (contract:
 * "banedata er kvasi-statisk; revalidateTag-nett … ikke verdt kompleksiteten
 * i v1").
 */
export async function listPublicCourses(): Promise<PublicCourseSummary[]> {
  'use cache';
  cacheLife('days');

  const anon = getPublicAnonClient();
  const { data, error } = await anon
    .from('courses')
    .select('id, name, slug, created_by, course_holes(hole_number), tee_boxes(*)')
    .order('name', { ascending: true })
    .returns<RawCourseRow[]>();
  if (error) throw error;

  const adminIds = await fetchAdminUserIds((data ?? []).map((c) => c.created_by));

  return (data ?? [])
    .filter((c) =>
      isPubliclyEligible({
        creatorIsAdmin: c.created_by !== null && adminIds.has(c.created_by),
        holeCount: c.course_holes.length,
        tees: c.tee_boxes,
      }),
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      holeCount: c.course_holes.length,
      teeCount: c.tee_boxes.filter((t) => t.archived_at === null).length,
    }));
}

export type PublicCourseHole = {
  hole_number: number;
  par_mens: number | null;
  par_ladies: number | null;
  par_juniors: number | null;
  stroke_index: number;
};

export type PublicCourseTee = {
  id: string;
  name: string;
  length_meters: number | null;
  slope_mens: number | null;
  course_rating_mens: number | null;
  par_total_mens: number | null;
  slope_ladies: number | null;
  course_rating_ladies: number | null;
  par_total_ladies: number | null;
  slope_juniors: number | null;
  course_rating_juniors: number | null;
  par_total_juniors: number | null;
};

export type PublicCourseDetail = {
  id: string;
  name: string;
  slug: string;
  holes: PublicCourseHole[];
  tees: PublicCourseTee[];
};

/**
 * Fetch a single course by slug for `/baner/[slug]`. Returns `null` for an
 * unknown slug OR a slug whose course fails the eligibility predicate — the
 * caller `notFound()`s either way (contract: "Ukvalifisert → … `notFound()`
 * på slug (ingen tomme skall)").
 */
export async function getPublicCourseBySlug(
  slug: string,
): Promise<PublicCourseDetail | null> {
  'use cache';
  cacheLife('days');

  const anon = getPublicAnonClient();
  const { data, error } = await anon
    .from('courses')
    .select(
      `id, name, slug, created_by,
       course_holes(hole_number, par_mens, par_ladies, par_juniors, stroke_index),
       tee_boxes(${TEE_COLUMNS})`,
    )
    .eq('slug', slug)
    .maybeSingle<
      RawCourseRow & {
        course_holes: PublicCourseHole[];
      }
    >();
  if (error) throw error;
  if (!data) return null;

  const adminIds = await fetchAdminUserIds([data.created_by]);
  const eligible = isPubliclyEligible({
    creatorIsAdmin: data.created_by !== null && adminIds.has(data.created_by),
    holeCount: data.course_holes.length,
    tees: data.tee_boxes,
  });
  if (!eligible) return null;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    holes: [...data.course_holes].sort((a, b) => a.hole_number - b.hole_number),
    tees: data.tee_boxes
      .filter((t) => t.archived_at === null)
      .map((t) => ({
        id: t.id,
        name: t.name,
        length_meters: t.length_meters,
        slope_mens: t.slope_mens,
        course_rating_mens: t.course_rating_mens,
        par_total_mens: t.par_total_mens,
        slope_ladies: t.slope_ladies,
        course_rating_ladies: t.course_rating_ladies,
        par_total_ladies: t.par_total_ladies,
        slope_juniors: t.slope_juniors,
        course_rating_juniors: t.course_rating_juniors,
        par_total_juniors: t.par_total_juniors,
      })),
  };
}

/** Slugs of every publicly eligible course, for `generateStaticParams`. */
export async function listPublicCourseSlugs(): Promise<string[]> {
  const courses = await listPublicCourses();
  return courses.map((c) => c.slug);
}

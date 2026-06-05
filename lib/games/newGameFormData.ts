import 'server-only';
import { cache } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import type { CourseOption, PlayerOption } from '@/app/admin/games/new/GameForm';

type CourseRow = {
  id: string;
  name: string;
  tee_boxes: {
    id: string;
    name: string;
    slope_mens: number | null;
    course_rating_mens: number | null;
    par_total_mens: number | null;
    slope_ladies: number | null;
    course_rating_ladies: number | null;
    par_total_ladies: number | null;
    slope_juniors: number | null;
    course_rating_juniors: number | null;
    par_total_juniors: number | null;
    archived_at: string | null;
  }[];
};

type UserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  // Absent in the e-post-fri variant (includeEmail === false) — the column is
  // never selected, so other users' e-post never enters the RSC payload (#435).
  email?: string;
  profile_completed_at: string | null;
  gender: 'mens' | 'ladies' | null;
  level: 'junior' | 'normal' | 'senior';
};

/**
 * Loads the data the create/edit-game flows need: course/tee options and the
 * player roster. Wrapped in React's `cache` so two Suspense boundaries on the
 * same page can read it without a double-fetch.
 *
 * `includeEmail` (#435): the player picker only shows name/nickname + handicap,
 * so the e-post column is dead weight there — and worse, it leaks co-players'
 * e-postadresser into the page payload of any non-admin who opens the wizard.
 * The admin flow (`/admin/games/new`) keeps `true` (full roster); the non-admin
 * flows (`/opprett-spill`, `/games/[id]/rediger`) pass `false`, which drops the
 * `email` column from the query entirely. Keep this a primitive boolean (not an
 * options object) so `cache` dedupes by value — `/opprett-spill` calls this
 * twice in one request, and an object literal would miss the cache each time.
 */
export const getNewGameFormData = cache(async (includeEmail = true) => {
  const supabase = await getServerClient();
  const userColumns = includeEmail
    ? 'id, name, nickname, hcp_index, email, profile_completed_at, gender, level'
    : 'id, name, nickname, hcp_index, profile_completed_at, gender, level';
  const [coursesResult, usersResult] = await Promise.all([
    supabase
      .from('courses')
      .select(
        'id, name, tee_boxes(id, name, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors, archived_at)',
      )
      .order('name', { ascending: true })
      .returns<CourseRow[]>(),
    supabase
      .from('users')
      .select(userColumns)
      .order('profile_completed_at', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true, nullsFirst: true })
      .returns<UserRow[]>(),
  ]);

  if (coursesResult.error) throw coursesResult.error;
  if (usersResult.error) throw usersResult.error;

  const courses: CourseOption[] = (coursesResult.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    tee_boxes: (c.tee_boxes ?? [])
      .filter((t) => t.archived_at === null)
      .map((t) => ({
        id: t.id,
        name: t.name,
        has_mens:
          t.slope_mens !== null &&
          t.course_rating_mens !== null &&
          t.par_total_mens !== null,
        has_ladies:
          t.slope_ladies !== null &&
          t.course_rating_ladies !== null &&
          t.par_total_ladies !== null,
        has_juniors:
          t.slope_juniors !== null &&
          t.course_rating_juniors !== null &&
          t.par_total_juniors !== null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'no')),
  }));

  const players: PlayerOption[] = (usersResult.data ?? []).map((u) => {
    const base: PlayerOption = {
      id: u.id,
      name: u.name,
      nickname: u.nickname ?? null,
      hcp_index: Number(u.hcp_index),
      pending: u.profile_completed_at === null,
      gender: u.gender,
      level: u.level,
    };
    // Spread the e-post in only when requested, so the e-post-fri variant
    // omits the key entirely (not `email: undefined`) — nothing for a
    // non-admin's RSC payload to carry (#435).
    return includeEmail && u.email !== undefined
      ? { ...base, email: u.email }
      : base;
  });

  return { courses, players };
});

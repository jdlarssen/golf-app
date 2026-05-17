'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/');

  return { supabase, user };
}

export async function updateCourse(courseId: string, formData: FormData) {
  const { supabase } = await requireAdmin();

  const editPath = `/admin/courses/${courseId}/edit`;

  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect(`${editPath}?error=name_required`);

  const holes: { hole_number: number; par: number; stroke_index: number }[] =
    [];
  for (let i = 1; i <= 18; i++) {
    const par = Number(formData.get(`hole_${i}_par`));
    const si = Number(formData.get(`hole_${i}_si`));
    if (!Number.isInteger(par) || par < 3 || par > 6) {
      redirect(`${editPath}?error=bad_par`);
    }
    if (!Number.isInteger(si) || si < 1 || si > 18) {
      redirect(`${editPath}?error=bad_si`);
    }
    holes.push({ hole_number: i, par, stroke_index: si });
  }

  const siSet = new Set(holes.map((h) => h.stroke_index));
  if (siSet.size !== 18) redirect(`${editPath}?error=si_duplicate`);

  const teeBoxes: {
    id: string | null;
    name: string;
    slope: number;
    course_rating: number;
    par_total: number;
    length_meters: number | null;
    gender: 'mens' | 'ladies' | 'juniors';
  }[] = [];
  for (let i = 0; i < 5; i++) {
    const teeName = String(formData.get(`tee_${i}_name`) ?? '').trim();
    if (!teeName) continue;
    const slope = Number(formData.get(`tee_${i}_slope`));
    const cr = Number(formData.get(`tee_${i}_cr`));
    const parTotal = Number(formData.get(`tee_${i}_par_total`));
    if (!Number.isInteger(slope) || slope < 55 || slope > 155) {
      redirect(`${editPath}?error=bad_slope`);
    }
    if (!Number.isFinite(cr) || cr < 50 || cr > 80) {
      redirect(`${editPath}?error=bad_cr`);
    }
    if (!Number.isInteger(parTotal) || parTotal < 60 || parTotal > 80) {
      redirect(`${editPath}?error=bad_par_total`);
    }
    // length_meters is optional. Empty / non-integer / out of range → NULL.
    // The DB has a CHECK between 1000 and 12000; we mirror that here so we
    // never trip it with garbage from the form.
    const rawLength = String(formData.get(`tee_${i}_length_meters`) ?? '').trim();
    let lengthMeters: number | null = null;
    if (rawLength !== '') {
      const parsed = Number(rawLength);
      if (
        Number.isInteger(parsed) &&
        parsed >= 1000 &&
        parsed <= 12000
      ) {
        lengthMeters = parsed;
      }
    }
    const genderRaw = String(formData.get(`tee_${i}_gender`) ?? 'mens');
    const gender: 'mens' | 'ladies' | 'juniors' =
      genderRaw === 'ladies' || genderRaw === 'juniors' ? genderRaw : 'mens';
    const teeId = String(formData.get(`tee_${i}_id`) ?? '') || null;
    teeBoxes.push({
      id: teeId,
      name: teeName,
      slope,
      course_rating: cr,
      par_total: parTotal,
      length_meters: lengthMeters,
      gender,
    });
  }
  if (teeBoxes.length === 0) redirect(`${editPath}?error=tee_required`);

  const { data: existingTees, error: existingTeesError } = await supabase
    .from('tee_boxes')
    .select('id')
    .eq('course_id', courseId);
  if (existingTeesError) redirect(`${editPath}?error=db_load`);

  const existingIds = new Set((existingTees ?? []).map((t) => t.id));
  const formIds = new Set(teeBoxes.filter((t) => t.id).map((t) => t.id!));
  const toDelete = [...existingIds].filter((id) => !formIds.has(id));

  if (toDelete.length > 0) {
    // Block deletion if a tee is still referenced by games or by per-player
    // game_players.tee_box_id overrides — the FK would refuse the delete anyway,
    // but catching it here gives a friendly error instead of a 500.
    const [{ data: gameRefs }, { data: gamePlayerRefs }] = await Promise.all([
      supabase.from('games').select('id').in('tee_box_id', toDelete).limit(1),
      supabase
        .from('game_players')
        .select('game_id')
        .in('tee_box_id', toDelete)
        .limit(1),
    ]);
    if ((gameRefs?.length ?? 0) > 0 || (gamePlayerRefs?.length ?? 0) > 0) {
      redirect(`${editPath}?error=tee_in_use`);
    }
  }

  const { error: courseUpdateError } = await supabase
    .from('courses')
    .update({ name })
    .eq('id', courseId);
  if (courseUpdateError) redirect(`${editPath}?error=db_course`);

  // course_holes stays delete-and-reinsert: no FK from games/scores into
  // course_holes (scores use hole_number int), so safe to replace wholesale.
  const { error: deleteHolesError } = await supabase
    .from('course_holes')
    .delete()
    .eq('course_id', courseId);
  if (deleteHolesError) redirect(`${editPath}?error=db_holes`);

  const holesToInsert = holes.map((h) => ({ ...h, course_id: courseId }));
  const { error: insertHolesError } = await supabase
    .from('course_holes')
    .insert(holesToInsert);
  if (insertHolesError) redirect(`${editPath}?error=db_holes`);

  for (const tee of teeBoxes) {
    const row = {
      course_id: courseId,
      name: tee.name,
      slope: tee.slope,
      course_rating: tee.course_rating,
      par_total: tee.par_total,
      length_meters: tee.length_meters,
      gender: tee.gender,
    };
    if (tee.id) {
      const { error } = await supabase
        .from('tee_boxes')
        .update(row)
        .eq('id', tee.id);
      if (error) redirect(`${editPath}?error=db_tees`);
    } else {
      const { error } = await supabase.from('tee_boxes').insert(row);
      if (error) redirect(`${editPath}?error=db_tees`);
    }
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('tee_boxes')
      .delete()
      .in('id', toDelete);
    if (error) redirect(`${editPath}?error=db_tees`);
  }

  redirect(`/admin/courses?status=updated&name=${encodeURIComponent(name)}`);
}

export async function deleteCourse(courseId: string) {
  const { supabase } = await requireAdmin();

  // Guard: refuse to delete if any games reference this course. Avoids
  // surprising FK-violation errors and preserves history.
  const { data: gameUsage, error: gameUsageError } = await supabase
    .from('games')
    .select('id')
    .eq('course_id', courseId)
    .limit(1);
  if (gameUsageError) {
    redirect('/admin/courses?error=delete_failed');
  }
  if (gameUsage && gameUsage.length > 0) {
    redirect('/admin/courses?error=in_use');
  }

  // course_holes and tee_boxes cascade via FK on the courses table.
  const { error: deleteError } = await supabase
    .from('courses')
    .delete()
    .eq('id', courseId);
  if (deleteError) {
    redirect('/admin/courses?error=delete_failed');
  }

  redirect('/admin/courses?status=deleted');
}

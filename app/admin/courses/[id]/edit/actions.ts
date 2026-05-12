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
    name: string;
    slope: number;
    course_rating: number;
    par_total: number;
    length_meters: number | null;
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
    teeBoxes.push({
      name: teeName,
      slope,
      course_rating: cr,
      par_total: parTotal,
      length_meters: lengthMeters,
    });
  }
  if (teeBoxes.length === 0) redirect(`${editPath}?error=tee_required`);

  // Guard: if any existing tee_boxes for this course are referenced by games,
  // we can't safely replace them. Manual check rather than relying on the FK
  // (the schema does not currently cascade games -> tee_boxes).
  const { data: existingTees, error: existingTeesError } = await supabase
    .from('tee_boxes')
    .select('id')
    .eq('course_id', courseId);
  if (existingTeesError) redirect(`${editPath}?error=db_load`);

  const existingTeeIds = (existingTees ?? []).map((t) => t.id);
  if (existingTeeIds.length > 0) {
    const { data: gameUsage, error: gameUsageError } = await supabase
      .from('games')
      .select('id')
      .in('tee_box_id', existingTeeIds)
      .limit(1);
    if (gameUsageError) redirect(`${editPath}?error=db_load`);
    if (gameUsage && gameUsage.length > 0) {
      redirect(`${editPath}?error=tee_in_use`);
    }
  }

  // Replace-and-reinsert pattern. Simpler than diffing rows and good enough
  // until an admin actually needs to preserve tee-box ids across edits.
  const { error: courseUpdateError } = await supabase
    .from('courses')
    .update({ name })
    .eq('id', courseId);
  if (courseUpdateError) redirect(`${editPath}?error=db_course`);

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

  const { error: deleteTeesError } = await supabase
    .from('tee_boxes')
    .delete()
    .eq('course_id', courseId);
  if (deleteTeesError) redirect(`${editPath}?error=db_tees`);

  const teesToInsert = teeBoxes.map((t) => ({ ...t, course_id: courseId }));
  const { error: insertTeesError } = await supabase
    .from('tee_boxes')
    .insert(teesToInsert);
  if (insertTeesError) redirect(`${editPath}?error=db_tees`);

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

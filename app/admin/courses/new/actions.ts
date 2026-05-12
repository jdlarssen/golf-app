'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

export async function createCourse(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Defense in depth: re-check admin even though the layout guards the route.
  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/');

  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    redirect('/admin/courses/new?error=name_required');
  }

  // Parse 18 holes.
  const holes: { hole_number: number; par: number; stroke_index: number }[] =
    [];
  for (let i = 1; i <= 18; i++) {
    const par = Number(formData.get(`hole_${i}_par`));
    const si = Number(formData.get(`hole_${i}_si`));
    if (!Number.isInteger(par) || par < 3 || par > 6) {
      redirect('/admin/courses/new?error=bad_par');
    }
    if (!Number.isInteger(si) || si < 1 || si > 18) {
      redirect('/admin/courses/new?error=bad_si');
    }
    holes.push({ hole_number: i, par, stroke_index: si });
  }

  // SIs must be a permutation of 1..18 — the schema enforces uniqueness per
  // course but we'd rather show a friendly error than surface a DB constraint.
  const siSet = new Set(holes.map((h) => h.stroke_index));
  if (siSet.size !== 18) {
    redirect('/admin/courses/new?error=si_duplicate');
  }

  // Parse tee boxes. Rows with an empty name are skipped — the form sends
  // five slots but only the populated ones count.
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
      redirect('/admin/courses/new?error=bad_slope');
    }
    if (!Number.isFinite(cr) || cr < 50 || cr > 80) {
      redirect('/admin/courses/new?error=bad_cr');
    }
    if (!Number.isInteger(parTotal) || parTotal < 60 || parTotal > 80) {
      redirect('/admin/courses/new?error=bad_par_total');
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
  if (teeBoxes.length === 0) {
    redirect('/admin/courses/new?error=tee_required');
  }

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .insert({ name, created_by: user.id })
    .select('id')
    .single();

  if (courseError || !course) {
    redirect('/admin/courses/new?error=db_course');
  }

  const holesToInsert = holes.map((h) => ({ ...h, course_id: course.id }));
  const { error: holesError } = await supabase
    .from('course_holes')
    .insert(holesToInsert);
  if (holesError) {
    redirect('/admin/courses/new?error=db_holes');
  }

  const teesToInsert = teeBoxes.map((t) => ({ ...t, course_id: course.id }));
  const { error: teeError } = await supabase
    .from('tee_boxes')
    .insert(teesToInsert);
  if (teeError) {
    redirect('/admin/courses/new?error=db_tees');
  }

  redirect(
    `/admin/courses?status=created&name=${encodeURIComponent(name)}`,
  );
}

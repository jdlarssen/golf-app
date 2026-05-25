'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';
import { MAX_TEE_BOXES } from '@/app/admin/courses/constants';

type GenderRating = {
  slope: number | null;
  course_rating: number | null;
};

function parseGenderRating(
  formData: FormData,
  teeIndex: number,
  gender: 'mens' | 'ladies' | 'juniors',
): GenderRating {
  const slopeStr = String(formData.get(`tee_${teeIndex}_slope_${gender}`) ?? '').trim();
  const crStr = String(formData.get(`tee_${teeIndex}_cr_${gender}`) ?? '').trim();

  const slope = slopeStr === '' ? null : Number(slopeStr);
  const cr = crStr === '' ? null : Number(crStr);

  return {
    slope: slope !== null && Number.isInteger(slope) && slope >= 55 && slope <= 155 ? slope : null,
    course_rating: cr !== null && Number.isFinite(cr) && cr >= 50 && cr <= 80 ? cr : null,
  };
}

function isCompleteRating(r: GenderRating): boolean {
  return r.slope !== null && r.course_rating !== null;
}

// Distinguishes "left blank" from "partially filled" — we only complain about
// the latter, since admin can legitimately leave any gender empty.
function isPartiallyFilled(
  formData: FormData,
  teeIndex: number,
  gender: 'mens' | 'ladies' | 'juniors',
): boolean {
  const slopeStr = String(formData.get(`tee_${teeIndex}_slope_${gender}`) ?? '').trim();
  const crStr = String(formData.get(`tee_${teeIndex}_cr_${gender}`) ?? '').trim();
  const filled = [slopeStr, crStr].filter((s) => s !== '').length;
  return filled === 1;
}

export async function createCourse(formData: FormData) {
  const supabase = await getServerClient();
  // Defense in depth: re-gate at action-level too (the layout already gates,
  // but server-actions can be invoked directly via fetch).
  const role = await requireAdminOrTrustedCreator(supabase);

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

  // par_total per kjønn er antatt identisk på tvers av kjønn (sann for ~99%
  // av norske baner). Brukes per kjønn der slope+CR er fylt ut. Per-kjønn-
  // overstyring er Fase 2-utvidelse hvis det blir aktuelt.
  const parSum = holes.reduce((s, h) => s + h.par, 0);

  // Parse tee boxes. Rows with an empty name are skipped — the form sends up
  // to MAX_TEE_BOXES slots but only the populated ones count.
  const teeBoxes: {
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
  }[] = [];
  for (let i = 0; i < MAX_TEE_BOXES; i++) {
    const teeName = String(formData.get(`tee_${i}_name`) ?? '').trim();
    if (!teeName) continue;

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

    // Per-gender rating: slope + CR må enten begge være satt eller begge tomme.
    for (const g of ['mens', 'ladies', 'juniors'] as const) {
      if (isPartiallyFilled(formData, i, g)) {
        redirect('/admin/courses/new?error=tee_partial_rating');
      }
    }

    const mensRating = parseGenderRating(formData, i, 'mens');
    const ladiesRating = parseGenderRating(formData, i, 'ladies');
    const juniorsRating = parseGenderRating(formData, i, 'juniors');

    if (
      !isCompleteRating(mensRating) &&
      !isCompleteRating(ladiesRating) &&
      !isCompleteRating(juniorsRating)
    ) {
      redirect('/admin/courses/new?error=tee_no_rating');
    }

    teeBoxes.push({
      name: teeName,
      length_meters: lengthMeters,
      slope_mens: mensRating.slope,
      course_rating_mens: mensRating.course_rating,
      par_total_mens: isCompleteRating(mensRating) ? parSum : null,
      slope_ladies: ladiesRating.slope,
      course_rating_ladies: ladiesRating.course_rating,
      par_total_ladies: isCompleteRating(ladiesRating) ? parSum : null,
      slope_juniors: juniorsRating.slope,
      course_rating_juniors: juniorsRating.course_rating,
      par_total_juniors: isCompleteRating(juniorsRating) ? parSum : null,
    });
  }
  if (teeBoxes.length === 0) {
    redirect('/admin/courses/new?error=tee_required');
  }

  // Writes go through admin-client when caller is trusted-non-admin to
  // bypass RLS policies that require is_admin(). Trust is already verified
  // by requireAdminOrTrustedCreator above. Same #198 mulighet A pattern.
  const writeClient = role.isAdmin ? supabase : getAdminClient();

  const { data: course, error: courseError } = await writeClient
    .from('courses')
    .insert({ name, created_by: role.userId })
    .select('id')
    .single();

  if (courseError || !course) {
    redirect('/admin/courses/new?error=db_course');
  }

  const holesToInsert = holes.map((h) => ({ ...h, course_id: course.id }));
  const { error: holesError } = await writeClient
    .from('course_holes')
    .insert(holesToInsert);
  if (holesError) {
    redirect('/admin/courses/new?error=db_holes');
  }

  const teesToInsert = teeBoxes.map((t) => ({ ...t, course_id: course.id }));
  const { error: teeError } = await writeClient
    .from('tee_boxes')
    .insert(teesToInsert);
  if (teeError) {
    redirect('/admin/courses/new?error=db_tees');
  }

  redirect(
    `/admin/courses?status=created&name=${encodeURIComponent(name)}`,
  );
}

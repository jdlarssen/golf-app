'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
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
  const { supabase, user } = await requireAdmin();

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

  // par_total per kjønn deriveres fra hullene; antagelse: identisk hull-par
  // for alle kjønn (sann for ~99% av norske baner). Per-kjønn-overstyring er
  // Fase 2-utvidelse hvis det blir aktuelt.
  const parSum = holes.reduce((s, h) => s + h.par, 0);

  const teeBoxes: {
    id: string | null;
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

    // Per-gender rating: each set must be all-filled or all-empty.
    for (const g of ['mens', 'ladies', 'juniors'] as const) {
      if (isPartiallyFilled(formData, i, g)) {
        redirect(`${editPath}?error=tee_partial_rating`);
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
      redirect(`${editPath}?error=tee_no_rating`);
    }

    const teeId = String(formData.get(`tee_${i}_id`) ?? '') || null;
    teeBoxes.push({
      id: teeId,
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
  if (teeBoxes.length === 0) redirect(`${editPath}?error=tee_required`);

  // Eksisterende ikke-arkiverte tees. Arkiverte hopes over slik at
  // toDelete-utregningen ikke prøver å «slette» dem på nytt på hver lagring
  // (de er allerede ute av formen).
  const { data: existingTees, error: existingTeesError } = await supabase
    .from('tee_boxes')
    .select('id')
    .eq('course_id', courseId)
    .is('archived_at', null);
  if (existingTeesError) redirect(`${editPath}?error=db_load`);

  const existingIds = new Set((existingTees ?? []).map((t) => t.id));
  const formIds = new Set(teeBoxes.filter((t) => t.id).map((t) => t.id!));
  const toDelete = [...existingIds].filter((id) => !formIds.has(id));

  // For tees admin har fjernet fra formen: del i to grupper. Tees uten
  // spill-referanser hard-deletes; tees i bruk i et eller flere spill
  // soft-archives via `archived_at`. Beholder FK-integritet for historiske
  // spill samtidig som admin alltid får fjernet tee-en fra aktiv visning.
  let toHardDelete: string[] = [];
  let toArchive: string[] = [];
  if (toDelete.length > 0) {
    const { data: gameRefs, error: gameRefsError } = await supabase
      .from('games')
      .select('tee_box_id')
      .in('tee_box_id', toDelete);
    if (gameRefsError) redirect(`${editPath}?error=db_load`);
    const inUseIds = new Set(
      (gameRefs ?? [])
        .map((r) => r.tee_box_id)
        .filter((id): id is string => id !== null),
    );
    toArchive = toDelete.filter((id) => inUseIds.has(id));
    toHardDelete = toDelete.filter((id) => !inUseIds.has(id));
  }

  const { error: courseUpdateError } = await supabase
    .from('courses')
    .update({
      name,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
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
      length_meters: tee.length_meters,
      slope_mens: tee.slope_mens,
      course_rating_mens: tee.course_rating_mens,
      par_total_mens: tee.par_total_mens,
      slope_ladies: tee.slope_ladies,
      course_rating_ladies: tee.course_rating_ladies,
      par_total_ladies: tee.par_total_ladies,
      slope_juniors: tee.slope_juniors,
      course_rating_juniors: tee.course_rating_juniors,
      par_total_juniors: tee.par_total_juniors,
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

  if (toHardDelete.length > 0) {
    const { error } = await supabase
      .from('tee_boxes')
      .delete()
      .in('id', toHardDelete);
    if (error) redirect(`${editPath}?error=db_tees`);
  }
  if (toArchive.length > 0) {
    const { error } = await supabase
      .from('tee_boxes')
      .update({ archived_at: new Date().toISOString() })
      .in('id', toArchive);
    if (error) redirect(`${editPath}?error=db_tees`);
  }

  redirect(`/admin/courses?status=updated&name=${encodeURIComponent(name)}`);
}

export async function restoreTee(
  courseId: string,
  teeId: string,
  _formData?: FormData,
) {
  const { supabase, user } = await requireAdmin();
  const editPath = `/admin/courses/${courseId}/edit`;

  // Verify tee belongs to the right course — defends against forged POSTs
  // from outside the edit page.
  const { data: tee, error: loadError } = await supabase
    .from('tee_boxes')
    .select('id, course_id, archived_at')
    .eq('id', teeId)
    .maybeSingle();
  if (loadError || !tee) redirect(`${editPath}?error=tee_not_found`);
  if (tee.course_id !== courseId) redirect(`${editPath}?error=tee_not_found`);
  if (tee.archived_at === null) redirect(`${editPath}?error=tee_not_archived`);

  const { error: restoreError } = await supabase
    .from('tee_boxes')
    .update({ archived_at: null })
    .eq('id', teeId);
  if (restoreError) redirect(`${editPath}?error=db_tees`);

  // Restore is a course change → bump audit fields on courses, same pattern
  // as updateCourse.
  const { error: courseUpdateError } = await supabase
    .from('courses')
    .update({
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('id', courseId);
  if (courseUpdateError) redirect(`${editPath}?error=db_course`);

  redirect(`${editPath}?status=restored`);
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

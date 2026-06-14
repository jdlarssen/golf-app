'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';
import { MAX_TEE_BOXES } from '@/app/[locale]/admin/courses/constants';
import type { AppLocale } from '@/i18n/routing';
import { parseCourseHolesAndTees } from '@/lib/courses/parseCourseForm';

export async function updateCourse(courseId: string, formData: FormData) {
  const supabase = await getServerClient();
  const role = await requireAdminOrTrustedCreator(supabase);
  const locale = (await getLocale()) as AppLocale;

  const editPath = `/admin/courses/${courseId}/edit`;

  const fail = (code: string): never =>
    redirect({ href: `${editPath}?error=${code}`, locale });

  const { name, holes, teeBoxes } = parseCourseHolesAndTees(
    formData,
    MAX_TEE_BOXES,
    fail,
  );

  // Eksisterende ikke-arkiverte tees. Arkiverte hopes over slik at
  // toDelete-utregningen ikke prøver å «slette» dem på nytt på hver lagring
  // (de er allerede ute av formen).
  const { data: existingTees, error: existingTeesError } = await supabase
    .from('tee_boxes')
    .select('id')
    .eq('course_id', courseId)
    .is('archived_at', null);
  if (existingTeesError) {
    console.error('[updateCourse] existing tees read failed', existingTeesError);
    redirect({ href: `${editPath}?error=db_load`, locale });
  }

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
    if (gameRefsError) {
      console.error('[updateCourse] game refs read failed', gameRefsError);
      redirect({ href: `${editPath}?error=db_load`, locale });
    }
    const inUseIds = new Set(
      (gameRefs ?? [])
        .map((r) => r.tee_box_id)
        .filter((id): id is string => id !== null),
    );
    toArchive = toDelete.filter((id) => inUseIds.has(id));
    toHardDelete = toDelete.filter((id) => !inUseIds.has(id));
  }

  // Writes go through admin-client when caller is trusted-non-admin to
  // bypass RLS policies that require is_admin(). Single writeClient binding
  // per action so a mixed write-sequence can't accidentally split between
  // request-scoped + service-role.
  const writeClient = role.isAdmin ? supabase : getAdminClient();

  const { error: courseUpdateError } = await writeClient
    .from('courses')
    .update({
      name,
      updated_at: new Date().toISOString(),
      updated_by: role.userId,
    })
    .eq('id', courseId);
  if (courseUpdateError) {
    console.error('[updateCourse] course update failed', courseUpdateError);
    redirect({ href: `${editPath}?error=db_course`, locale });
  }

  // course_holes stays delete-and-reinsert: no FK from games/scores into
  // course_holes (scores use hole_number int), so safe to replace wholesale.
  const { error: deleteHolesError } = await writeClient
    .from('course_holes')
    .delete()
    .eq('course_id', courseId);
  if (deleteHolesError) {
    console.error('[updateCourse] holes delete failed', deleteHolesError);
    redirect({ href: `${editPath}?error=db_holes`, locale });
  }

  const holesToInsert = holes.map((h) => ({ ...h, course_id: courseId }));
  const { error: insertHolesError } = await writeClient
    .from('course_holes')
    .insert(holesToInsert);
  if (insertHolesError) {
    console.error('[updateCourse] holes insert failed', insertHolesError);
    redirect({ href: `${editPath}?error=db_holes`, locale });
  }

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
      const { error } = await writeClient
        .from('tee_boxes')
        .update(row)
        .eq('id', tee.id);
      if (error) {
        console.error('[updateCourse] tee update failed', error);
        redirect({ href: `${editPath}?error=db_tees`, locale });
      }
    } else {
      const { error } = await writeClient.from('tee_boxes').insert(row);
      if (error) {
        console.error('[updateCourse] tee insert failed', error);
        redirect({ href: `${editPath}?error=db_tees`, locale });
      }
    }
  }

  if (toHardDelete.length > 0) {
    const { error } = await writeClient
      .from('tee_boxes')
      .delete()
      .in('id', toHardDelete);
    if (error) {
      console.error('[updateCourse] tee hard-delete failed', error);
      redirect({ href: `${editPath}?error=db_tees`, locale });
    }
  }
  if (toArchive.length > 0) {
    const { error } = await writeClient
      .from('tee_boxes')
      .update({ archived_at: new Date().toISOString() })
      .in('id', toArchive);
    if (error) {
      console.error('[updateCourse] tee archive failed', error);
      redirect({ href: `${editPath}?error=db_tees`, locale });
    }
  }

  redirect({ href: `/admin/courses?status=updated&name=${encodeURIComponent(name)}`, locale });
}

export async function restoreTee(
  courseId: string,
  teeId: string,
  _formData?: FormData,
) {
  const supabase = await getServerClient();
  const role = await requireAdminOrTrustedCreator(supabase);
  const locale = (await getLocale()) as AppLocale;
  const editPath = `/admin/courses/${courseId}/edit`;

  // Verify tee belongs to the right course — defends against forged POSTs
  // from outside the edit page.
  const { data: tee, error: loadError } = await supabase
    .from('tee_boxes')
    .select('id, course_id, archived_at')
    .eq('id', teeId)
    .maybeSingle();
  if (loadError || !tee) redirect({ href: `${editPath}?error=tee_not_found`, locale });
  if (tee!.course_id !== courseId) redirect({ href: `${editPath}?error=tee_not_found`, locale });
  if (tee!.archived_at === null) redirect({ href: `${editPath}?error=tee_not_archived`, locale });

  // Writes bypass RLS via admin-client for trusted-non-admin (same pattern
  // as updateCourse).
  const writeClient = role.isAdmin ? supabase : getAdminClient();

  const { error: restoreError } = await writeClient
    .from('tee_boxes')
    .update({ archived_at: null })
    .eq('id', teeId);
  if (restoreError) {
    console.error('[restoreTee] tee restore failed', restoreError);
    redirect({ href: `${editPath}?error=db_tees`, locale });
  }

  // Restore is a course change → bump audit fields on courses, same pattern
  // as updateCourse.
  const { error: courseUpdateError } = await writeClient
    .from('courses')
    .update({
      updated_at: new Date().toISOString(),
      updated_by: role.userId,
    })
    .eq('id', courseId);
  if (courseUpdateError) {
    console.error('[restoreTee] course audit update failed', courseUpdateError);
    redirect({ href: `${editPath}?error=db_course`, locale });
  }

  // Invalidate route caches so CourseForm's tee-list fetch refetches fresh:
  // without this, the next render of the edit page may serve the cached
  // archived_at-IS-NULL response from before restore, which excluded this
  // tee — causing a subsequent Lagre to send a formData missing it, which
  // updateCourse then re-archives. Also invalidate the list-page since
  // tee_count + audit-kicker change for this course.
  revalidatePath(`/admin/courses/${courseId}/edit`);
  revalidatePath('/admin/courses');
  revalidatePath('/admin/games/new');

  redirect({ href: `${editPath}?status=restored`, locale });
}

export async function deleteCourse(courseId: string) {
  const supabase = await getServerClient();
  const role = await requireAdminOrTrustedCreator(supabase);
  const locale = (await getLocale()) as AppLocale;

  // Guard: refuse to delete if any games reference this course. Avoids
  // surprising FK-violation errors and preserves history.
  // Runs BEFORE ownership-check so trusted-non-owner of an in-use course
  // sees the informative «in_use» message rather than «not_owned».
  const { data: gameUsage, error: gameUsageError } = await supabase
    .from('games')
    .select('id')
    .eq('course_id', courseId)
    .limit(1);
  if (gameUsageError) {
    redirect({ href: '/admin/courses?error=delete_failed', locale });
  }
  if (gameUsage && gameUsage.length > 0) {
    redirect({ href: '/admin/courses?error=in_use', locale });
  }

  // Ownership-check for trusted-non-admin: they can only delete courses
  // they created themselves. Admin is unaffected (can delete anything).
  // Missing-course (NULL) is treated as not_owned — defense-in-depth
  // against forged DELETE-POSTs.
  if (!role.isAdmin) {
    const { data: course } = await supabase
      .from('courses')
      .select('created_by')
      .eq('id', courseId)
      .maybeSingle();
    if (!course || course.created_by !== role.userId) {
      redirect({ href: '/admin/courses?error=not_owned', locale });
    }
  }

  // Trust verified → switch to admin-client for the actual delete so the
  // is_admin()-RLS-policy doesn't block trusted-non-admin.
  const writeClient = role.isAdmin ? supabase : getAdminClient();

  // course_holes and tee_boxes cascade via FK on the courses table.
  const { error: deleteError } = await writeClient
    .from('courses')
    .delete()
    .eq('id', courseId);
  if (deleteError) {
    redirect({ href: '/admin/courses?error=delete_failed', locale });
  }

  redirect({ href: '/admin/courses?status=deleted', locale });
}

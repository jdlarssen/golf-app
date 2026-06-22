'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { MAX_TEE_BOXES } from '@/app/[locale]/admin/courses/constants';
import type { AppLocale } from '@/i18n/routing';
import { parseCourseHolesAndTees } from '@/lib/courses/parseCourseForm';

export async function updateCourse(courseId: string, formData: FormData) {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);
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

  // #846: all writes (course rename + holes replace + tee updates/inserts/
  // hard-deletes/archives) run in ONE transaction via the RPC, so a mid-sequence
  // failure can't leave the course inconsistent. Most importantly, the holes
  // delete+reinsert no longer has a window where the course has zero holes
  // (#642-class leaderboard crash) — the whole edit either lands or rolls back.
  // The tee diff (archive vs hard-delete, computed above from the games-FK
  // lookup) stays here in TS where it's tested; the RPC is a dumb atomic
  // executor. The RPC is SECURITY INVOKER, so RLS gates the write to admins.
  const { error: rpcError } = await supabase.rpc('update_course_with_layout', {
    p_course_id: courseId,
    p_name: name,
    p_updated_by: role.userId,
    p_holes: holes,
    // Tees with an id are updates; without, inserts. The RPC's jsonb_to_recordset
    // reads only the named columns, so passing the parsed rows as-is is safe
    // (a null `id` on an insert row is ignored).
    p_tee_updates: teeBoxes.filter((t) => t.id),
    p_tee_inserts: teeBoxes.filter((t) => !t.id),
    p_tee_hard_delete: toHardDelete,
    p_tee_archive: toArchive,
  });
  if (rpcError) {
    console.error('[updateCourse] update_course_with_layout failed', rpcError);
    redirect({ href: `${editPath}?error=db_course`, locale });
  }

  redirect({ href: `/admin/courses?status=updated&name=${encodeURIComponent(name)}`, locale });
}

export async function restoreTee(
  courseId: string,
  teeId: string,
  _formData?: FormData,
) {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);
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

  const { error: restoreError } = await supabase
    .from('tee_boxes')
    .update({ archived_at: null })
    .eq('id', teeId);
  if (restoreError) {
    console.error('[restoreTee] tee restore failed', restoreError);
    redirect({ href: `${editPath}?error=db_tees`, locale });
  }

  // Restore is a course change → bump audit fields on courses, same pattern
  // as updateCourse.
  const { error: courseUpdateError } = await supabase
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
  await requireAdmin(supabase);
  const locale = (await getLocale()) as AppLocale;

  // Guard: refuse to delete if any games reference this course. Avoids
  // surprising FK-violation errors and preserves history.
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

  // course_holes and tee_boxes cascade via FK on the courses table.
  const { error: deleteError } = await supabase
    .from('courses')
    .delete()
    .eq('id', courseId);
  if (deleteError) {
    redirect({ href: '/admin/courses?error=delete_failed', locale });
  }

  redirect({ href: '/admin/courses?status=deleted', locale });
}

'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { stampMembershipClosed } from '@/lib/clubs/stampMembershipClosed';
import { canRemoveClubMember, type ClubRole } from '@/lib/clubs/memberRemoval';

/**
 * removeMember — server action for the /klubber/[id]/fjern/[userId] confirm page.
 *
 * Deletes the target user's group_members row. Requires the caller to be an
 * owner/admin of the club. An owner is removed by an owner only
 * (`canRemoveClubMember`; the database holds the same rule, migration 0248).
 *
 * Last-owner guard: if the target is the sole owner, block and redirect back
 * with an error. Ownership transfer is issue #50.
 *
 * The delete uses the request-scoped client so the RLS delete policy validates
 * the caller's permission server-side (double-checked in code). A delete that
 * removes no row is a failure, not a success.
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export async function removeMember(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();
  if (!user) redirect({ href: '/login', locale });

  const groupId = String(formData.get('groupId') ?? '').trim();
  const targetUserId = String(formData.get('targetUserId') ?? '').trim();

  if (!groupId || !targetUserId) redirect({ href: '/klubber', locale });

  // Verify caller is admin/owner via admin client. Every guard read checks its
  // error: a failed read must not skip the role rule or the last-owner guard
  // (audit 2026-11-20).
  const failed = `/klubber/${groupId}/fjern/${targetUserId}?error=remove_failed`;
  const admin = getAdminClient();
  const [caller, target] = await Promise.all([
    admin
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', targetUserId)
      .maybeSingle(),
  ]);
  if (caller.error || target.error) {
    console.error('[removeMember] guard read failed', caller.error ?? target.error);
    redirect({ href: failed, locale });
  }

  const callerRole = caller.data?.role;
  if (callerRole !== 'owner' && callerRole !== 'admin') {
    redirect({ href: `/klubber/${groupId}/medlemmer`, locale });
  }

  const targetRow = target.data;
  if (targetRow && !canRemoveClubMember(callerRole, targetRow.role as ClubRole)) {
    redirect({ href: `/klubber/${groupId}/medlemmer`, locale });
  }

  // Last-owner guard: block when the target is the sole owner.
  if (targetRow?.role === 'owner') {
    const { count: ownerCount, error: ownerError } = await admin
      .from('group_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('role', 'owner');
    if (ownerError) {
      console.error('[removeMember] owner count failed', ownerError);
      redirect({ href: failed, locale });
    }

    if ((ownerCount ?? 0) <= 1) {
      redirect({
        href: `/klubber/${groupId}/fjern/${targetUserId}?error=sole_owner`,
        locale,
      });
    }
  }

  // The owner's «Etter 7 dager»: record when the membership ended, BEFORE the
  // delete, so a new join request waits 7 days. Only for someone who is a
  // member; a failed stamp stops the removal.
  if (targetRow && !(await stampMembershipClosed(groupId, targetUserId, user.id))) {
    redirect({ href: failed, locale });
  }

  // Delete via request-scoped client (RLS: "group_members delete admin or self").
  const { data: removed, error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', targetUserId)
    .select('user_id');

  if (error || !removed || removed.length === 0) {
    console.error('[removeMember]', error ?? 'delete removed 0 rows');
    redirect({
      href: `/klubber/${groupId}/fjern/${targetUserId}?error=remove_failed`,
      locale,
    });
  }

  revalidatePath(`/klubber/${groupId}`);
  revalidatePath(`/klubber/${groupId}/medlemmer`);
  redirect({ href: `/klubber/${groupId}/medlemmer`, locale });
}

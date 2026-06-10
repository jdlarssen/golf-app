'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * removeMember — server action for the /klubber/[id]/fjern/[userId] confirm page.
 *
 * Deletes the target user's group_members row. Requires the caller to be an
 * owner/admin of the club.
 *
 * Last-owner guard: if the target is the sole owner, block and redirect back
 * with an error. Ownership transfer is issue #50.
 *
 * The delete uses the request-scoped client so the RLS `is_group_admin(group_id)`
 * policy validates the caller's permission server-side (double-checked in code).
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export async function removeMember(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const groupId = String(formData.get('groupId') ?? '').trim();
  const targetUserId = String(formData.get('targetUserId') ?? '').trim();

  if (!groupId || !targetUserId) redirect('/klubber');

  // Verify caller is admin/owner via admin client.
  const admin = getAdminClient();
  const { data: callerRow } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle();

  const callerRole = callerRow?.role;
  if (callerRole !== 'owner' && callerRole !== 'admin') {
    redirect(`/klubber/${groupId}`);
  }

  // Last-owner guard: check if target is the sole owner.
  const { data: targetRow } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (targetRow?.role === 'owner') {
    const { count: ownerCount } = await admin
      .from('group_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('role', 'owner');

    if ((ownerCount ?? 0) <= 1) {
      redirect(
        `/klubber/${groupId}/fjern/${targetUserId}?error=sole_owner`,
      );
    }
  }

  // Delete via request-scoped client (RLS: is_group_admin(group_id)).
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', targetUserId);

  if (error) {
    console.error('[removeMember]', error);
    redirect(`/klubber/${groupId}/fjern/${targetUserId}?error=remove_failed`);
  }

  revalidatePath(`/klubber/${groupId}`);
  redirect(`/klubber/${groupId}`);
}

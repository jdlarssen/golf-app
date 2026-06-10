'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * leaveClub — server action for the /klubber/[id]/forlat confirm page.
 *
 * Self-deletes the caller's group_members row. Blocks if the caller is the
 * sole owner (a club must always have at least one owner; ownership transfer
 * is issue #50).
 *
 * Last-owner check uses the admin client (to count all owners, not just the
 * caller's row). The actual delete uses the request-scoped client so RLS
 * validates `user_id = auth.uid()`.
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export async function leaveClub(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const groupId = String(formData.get('groupId') ?? '').trim();
  if (!groupId) redirect('/klubber');

  // Last-owner guard: count owners via admin client.
  const admin = getAdminClient();
  const { count: ownerCount } = await admin
    .from('group_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('role', 'owner');

  // Check if the caller is an owner.
  const { data: myRow } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle();

  const isOwner = myRow?.role === 'owner';

  if (isOwner && (ownerCount ?? 0) <= 1) {
    redirect(`/klubber/${groupId}/forlat?error=sole_owner`);
  }

  // Self-delete via request-scoped client (RLS: user_id = auth.uid()).
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', user.id);

  if (error) {
    console.error('[leaveClub]', error);
    redirect(`/klubber/${groupId}/forlat?error=leave_failed`);
  }

  revalidatePath('/klubber');
  redirect('/klubber');
}

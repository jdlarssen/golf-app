'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { getAdminClient } from '@/lib/supabase/admin';

/** After a delete that removed nothing: is the caller's membership gone? */
async function membershipIsGone(groupId: string, userId: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[leaveClub] membership re-read failed', error);
    return false;
  }
  return data === null;
}

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
  const locale = await getLocale();
  if (!user) redirect({ href: '/login', locale });

  const groupId = String(formData.get('groupId') ?? '').trim();
  if (!groupId) redirect({ href: '/klubber', locale });

  // Last-owner guard: count owners via admin client. A failed read must not
  // read as «not the sole owner» and skip the guard (audit 2026-11-20).
  const admin = getAdminClient();
  const [owners, mine] = await Promise.all([
    admin
      .from('group_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('role', 'owner'),
    admin
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  if (owners.error || mine.error) {
    console.error('[leaveClub] guard read failed', owners.error ?? mine.error);
    redirect({ href: `/klubber/${groupId}/forlat?error=leave_failed`, locale });
  }

  const isOwner = mine.data?.role === 'owner';

  if (isOwner && (owners.count ?? 0) <= 1) {
    redirect({ href: `/klubber/${groupId}/forlat?error=sole_owner`, locale });
  }

  // Self-delete via request-scoped client (RLS: user_id = auth.uid()).
  // 0 rows is not «left» on trust (trap 2, audit 2026-11-20): the membership
  // is read again, and only a row that is gone counts as a leave (a double
  // tap, or a removal in between). A row still there, or a failed read, is
  // the error.
  let left = true;
  try {
    expectAffected(
      await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .select('user_id'),
      'leaveClub',
    );
  } catch (err) {
    console.error('[leaveClub]', err);
    left = await membershipIsGone(groupId, user.id);
  }
  if (!left) {
    redirect({ href: `/klubber/${groupId}/forlat?error=leave_failed`, locale });
  }

  revalidatePath('/klubber');
  redirect({ href: '/klubber', locale });
}

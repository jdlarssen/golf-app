'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';

const VALID_ROLES = ['owner', 'admin', 'member'] as const;
type ClubRole = (typeof VALID_ROLES)[number];

/**
 * setMemberRole — server action for the /klubber/[id]/rolle/[userId] confirm page.
 *
 * Calls the `set_club_member_role` SECURITY DEFINER RPC (migrasjon 0076).
 * Caller must be the group owner (enforced by both code gate + RPC).
 *
 * Error codes surfaced via ?error= query param:
 *   error=last_owner   — sole-owner demotion blocked
 *   error=not_member   — target is not a member
 *   error=not_auth     — caller is not the owner
 *   error=unknown      — unexpected DB error
 *
 * On success: best-effort notify the target, revalidate, redirect with ?role_changed=<role>.
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export async function setMemberRole(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const groupId = String(formData.get('groupId') ?? '').trim();
  const targetUserId = String(formData.get('targetUserId') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim();

  if (!groupId || !targetUserId) redirect('/klubber');

  // Validate role value — guard against tampered form data.
  if (!(VALID_ROLES as readonly string[]).includes(role)) {
    redirect(`/klubber/${groupId}/rolle/${targetUserId}?error=unknown`);
  }

  const { data, error } = await supabase.rpc('set_club_member_role', {
    p_group_id: groupId,
    p_user_id: targetUserId,
    p_role: role as ClubRole,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('last_owner')) {
      redirect(`/klubber/${groupId}/rolle/${targetUserId}?error=last_owner`);
    }
    if (msg.includes('not_member')) {
      redirect(`/klubber/${groupId}/rolle/${targetUserId}?error=not_member`);
    }
    if (msg.includes('not_authorized')) {
      redirect(`/klubber/${groupId}/rolle/${targetUserId}?error=not_auth`);
    }
    console.error('[setMemberRole]', error);
    redirect(`/klubber/${groupId}/rolle/${targetUserId}?error=unknown`);
  }

  // Best-effort notify the target about the role change.
  const admin = getAdminClient();
  const { data: group } = await admin
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .maybeSingle<{ name: string }>();

  if (group) {
    // Await so the notify completes before redirect() unwinds the action
    // (mirrors requestToJoin — a fire-and-forget promise can be cut off when
    // the serverless invocation ends). Best-effort: failures never block.
    await Promise.allSettled([
      notify({
        userId: targetUserId,
        kind: 'club_role_changed',
        payload: {
          group_id: groupId,
          group_name: group.name,
          new_role: (data ?? role) as ClubRole,
        },
      }).catch((err) => console.error('[setMemberRole] notify failed', err)),
    ]);
  }

  revalidatePath(`/klubber/${groupId}`);
  redirect(`/klubber/${groupId}?role_changed=${data ?? role}`);
}

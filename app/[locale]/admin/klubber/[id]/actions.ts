'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * updateClubTerms — server action for /admin/klubber/[id].
 *
 * Updates the club's member_cap and valid_until (avtale-rammer). Uses
 * getAdminClient() for the update (admin-client bypasses RLS), but gates
 * on is_admin in code first (defense-in-depth — the admin-client has no RLS
 * to back us up here, so we verify in the action layer).
 *
 * Error codes surface via ?error= query param:
 *   error=not_auth  — caller is not is_admin
 *   error=unknown   — unexpected DB error
 *
 * On success: revalidates + redirects with ?updated=1.
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export async function updateClubTerms(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Gate: verify is_admin in code (admin-client is used below, so RLS won't gate).
  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    redirect('/admin');
  }

  const groupId = String(formData.get('group_id') ?? '').trim();
  if (!groupId) redirect('/admin/klubber');

  const memberCapRaw = String(formData.get('member_cap') ?? '').trim();
  const varighetMode = String(formData.get('varighet_mode') ?? '').trim();
  const sluttdato = String(formData.get('sluttdato') ?? '').trim();

  const memberCap = memberCapRaw ? parseInt(memberCapRaw, 10) : null;
  const validUntil =
    varighetMode === 'dato' && sluttdato
      ? `${sluttdato}T23:59:59Z`
      : null;

  const admin = getAdminClient();
  const { error } = await admin
    .from('groups')
    .update({ member_cap: memberCap, valid_until: validUntil })
    .eq('id', groupId);

  if (error) {
    console.error('[updateClubTerms]', error);
    redirect(`/admin/klubber/${groupId}?error=unknown`);
  }

  revalidatePath(`/admin/klubber/${groupId}`);
  revalidatePath('/admin/klubber');
  redirect(`/admin/klubber/${groupId}?updated=1`);
}

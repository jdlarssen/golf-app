'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';

/**
 * createClubForAdmin — server action for /admin/klubber/ny.
 *
 * Calls the `admin_create_club` SECURITY DEFINER RPC (migrasjon 0076).
 * The RPC requires the caller to be is_admin; it creates the club and sets
 * the named owner as sole owner (admin is NOT added as a member).
 *
 * Error codes surface via ?error= query param:
 *   error=not_auth        — caller is not is_admin
 *   error=name_req        — club name was empty
 *   error=too_long        — club name > 60 characters
 *   error=email_req       — owner email was empty
 *   error=cap_invalid     — member_cap < 1
 *   error=owner_not_found — no Tørny user with that email (club NOT created)
 *   error=unknown         — unexpected DB error
 *
 * On success: revalidates /admin/klubber and redirects to the new club's
 * admin detail page.
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export async function createClubForAdmin(formData: FormData) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const name = String(formData.get('name') ?? '').trim();
  const ownerEmail = String(formData.get('owner_email') ?? '').trim();
  const memberCapRaw = String(formData.get('member_cap') ?? '').trim();
  const varighetMode = String(formData.get('varighet_mode') ?? '').trim();
  const sluttdato = String(formData.get('sluttdato') ?? '').trim();

  const memberCap = memberCapRaw ? parseInt(memberCapRaw, 10) : null;
  const validUntil =
    varighetMode === 'dato' && sluttdato
      ? `${sluttdato}T23:59:59Z`
      : null;

  const { data, error } = await supabase.rpc('admin_create_club', {
    p_name: name,
    p_owner_email: ownerEmail,
    p_member_cap: memberCap,
    p_valid_until: validUntil,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('not_authorized')) redirect('/admin/klubber/ny?error=not_auth');
    if (msg.includes('name_required')) redirect('/admin/klubber/ny?error=name_req');
    if (msg.includes('name_too_long')) redirect('/admin/klubber/ny?error=too_long');
    if (msg.includes('owner_email_required')) redirect('/admin/klubber/ny?error=email_req');
    if (msg.includes('member_cap_invalid')) redirect('/admin/klubber/ny?error=cap_invalid');
    if (msg.includes('owner_not_found')) {
      redirect(
        `/admin/klubber/ny?error=owner_not_found&email=${encodeURIComponent(ownerEmail)}`,
      );
    }
    console.error('[createClubForAdmin]', error);
    redirect('/admin/klubber/ny?error=unknown');
  }

  // data is the new club uuid
  revalidatePath('/admin/klubber');
  redirect(`/admin/klubber/${data}`);
}

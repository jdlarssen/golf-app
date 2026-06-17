'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
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
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

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
    // admin_create_club accepts NULL for "no cap" (groups.member_cap is nullable);
    // generated RPC arg type is non-null so we cast.
    p_member_cap: memberCap as number,
    // admin_create_club accepts NULL for "no expiry" (groups.valid_until is nullable);
    // generated RPC arg type is non-null so we cast.
    p_valid_until: validUntil as string,
  });

  if (error) {
    const msg = error.message ?? '';
    // Preserve all entered values across the validation-error redirect (#645)
    // so the user only re-fixes the offending field. Echoed via searchParams,
    // matching the codebase's existing ?email= round-trip pattern.
    const errorHref = (code: string) => {
      const qs = new URLSearchParams({ error: code });
      if (name) qs.set('name', name);
      if (ownerEmail) qs.set('email', ownerEmail);
      if (memberCapRaw) qs.set('member_cap', memberCapRaw);
      if (varighetMode) qs.set('varighet_mode', varighetMode);
      if (sluttdato) qs.set('sluttdato', sluttdato);
      return `/admin/klubber/ny?${qs.toString()}`;
    };
    if (msg.includes('not_authorized')) redirect({ href: errorHref('not_auth'), locale });
    if (msg.includes('name_required')) redirect({ href: errorHref('name_req'), locale });
    if (msg.includes('name_too_long')) redirect({ href: errorHref('too_long'), locale });
    if (msg.includes('owner_email_required')) redirect({ href: errorHref('email_req'), locale });
    if (msg.includes('member_cap_invalid')) redirect({ href: errorHref('cap_invalid'), locale });
    if (msg.includes('owner_not_found')) redirect({ href: errorHref('owner_not_found'), locale });
    console.error('[createClubForAdmin]', error);
    redirect({ href: errorHref('unknown'), locale });
  }

  // data is the new club uuid
  revalidatePath('/admin/klubber');
  redirect({ href: `/admin/klubber/${data}`, locale });
}

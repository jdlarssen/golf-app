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

  // Member cap and duration are no longer set at creation — admin sets them on
  // the detail page afterwards. admin_create_club treats both as nullable
  // ("no cap" / "no expiry"), but the generated RPC arg types are non-null, so
  // we pass NULL through an unknown-cast.
  const { data, error } = await supabase.rpc('admin_create_club', {
    p_name: name,
    p_owner_email: ownerEmail,
    p_member_cap: null as unknown as number,
    p_valid_until: null as unknown as string,
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
      return `/admin/klubber/ny?${qs.toString()}`;
    };
    if (msg.includes('not_authorized')) redirect({ href: errorHref('not_auth'), locale });
    if (msg.includes('name_required')) redirect({ href: errorHref('name_req'), locale });
    if (msg.includes('name_too_long')) redirect({ href: errorHref('too_long'), locale });
    if (msg.includes('owner_email_required')) redirect({ href: errorHref('email_req'), locale });
    if (msg.includes('owner_not_found')) redirect({ href: errorHref('owner_not_found'), locale });
    console.error('[createClubForAdmin]', error);
    redirect({ href: errorHref('unknown'), locale });
  }

  // data is the new club uuid
  revalidatePath('/admin/klubber');
  redirect({ href: `/admin/klubber/${data}`, locale });
}

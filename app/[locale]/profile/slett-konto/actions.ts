'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import {
  deleteOrAnonymizeUser,
  getDeleteBlockReason,
} from '@/lib/users/deleteAccount';
import type { AppLocale } from '@/i18n/routing';

export async function deleteOwnAccount() {
  const locale = (await getLocale()) as AppLocale;
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/login', locale });
    return; // unreachable — i18n redirect throws but isn't typed `never`
  }

  // #1012: admin-kontoen kan ikke slette seg selv; deltakelse i eller
  // arrangering av noe pågående blokkerer (delt regel med admin-flyten).
  const blockReason = await getDeleteBlockReason(user.id);
  if (blockReason === 'admin_account') {
    redirect({ href: '/profile/slett-konto?error=admin_account', locale });
  }
  if (blockReason === 'active_engagements') {
    redirect({ href: '/profile/slett-konto?error=active_games', locale });
  }

  // Aldri spilt → hard delete; ellers anonymisering (#1012): spillhistorikken
  // beholdes som «Slettet bruker», auth-raden soft-slettes (e-post frigjøres,
  // alle sesjoner trekkes av GoTrue).
  const result = await deleteOrAnonymizeUser(user.id, '[profile/slett-konto]');
  if (!result.ok) {
    redirect({ href: '/profile/slett-konto?error=delete_failed', locale });
  }

  // Session is now invalid — redirect to login
  redirect({ href: '/login?melding=konto_slettet', locale });
}

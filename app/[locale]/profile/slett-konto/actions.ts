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

  // #1012: admin-kontoen kan ikke slette seg selv; arrangering av noe
  // pågående blokkerer (delt regel med admin-flyten).
  //
  // #1903: switch uten default over hele utfallet. `null` er eneste vei videre
  // til sletting; en ny kode som ingen gren kjenner, stopper på tsc i stedet
  // for å falle stille gjennom til hard-delete-stien.
  const outcome = await getDeleteBlockReason(user.id);
  switch (outcome) {
    case null:
      break;
    case 'admin_account':
      redirect({ href: '/profile/slett-konto?error=admin_account', locale });
      return;
    case 'active_engagements':
      redirect({ href: '/profile/slett-konto?error=active_games', locale });
      return;
    // #1910: uten denne grenen slipper en klubbeier som aldri har spilt rett
    // gjennom på hard-delete-stien, der anonymize_user-vakta aldri er i spill.
    case 'sole_club_owner':
      redirect({ href: '/profile/slett-konto?error=sole_club_owner', locale });
      return;
    case 'check_failed':
      redirect({ href: '/profile/slett-konto?error=delete_failed', locale });
      return;
    default: {
      const unhandled: never = outcome;
      throw new Error(`unhandled delete check outcome: ${String(unhandled)}`);
    }
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

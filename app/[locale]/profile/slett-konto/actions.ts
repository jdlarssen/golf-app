'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import {
  deleteOrAnonymizeUser,
  getDeleteBlockReason,
} from '@/lib/users/deleteAccount';

// #1987: success RETURNS instead of redirecting, so the client form can wipe
// the browser's local base before it navigates to login. Every failure still
// redirects back here with `?error=`; called from the client, that redirect
// rejects the action promise and Next follows it. Those branches end in `redirect()`,
// which is typed `never`; `| void` stays only to keep the exported signature unchanged.
export async function deleteOwnAccount(): Promise<{ ok: true } | void> {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/login', locale });
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
    case 'active_engagements':
      redirect({ href: '/profile/slett-konto?error=active_games', locale });
    // #1910: uten denne grenen slipper en klubbeier som aldri har spilt rett
    // gjennom på hard-delete-stien, der anonymize_user-vakta aldri er i spill.
    case 'sole_club_owner':
      redirect({ href: '/profile/slett-konto?error=sole_club_owner', locale });
    case 'check_failed':
      redirect({ href: '/profile/slett-konto?error=delete_failed', locale });
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

  // Session is now invalid — DeleteAccountForm clears local data and
  // navigates to /login?melding=konto_slettet.
  return { ok: true as const };
}

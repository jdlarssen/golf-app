'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { inviteByEmail, inviteEmailProblem } from '@/lib/friends/friendActionsCore';
import type { AppLocale } from '@/i18n/routing';

// Skallet rundt venne-invitasjonen (#2256). Vernet (adressesjekkene, fullført
// profil, kvoten, dedup mot kontoer og åpne invitasjoner) og selve
// invitasjonen bor i `lib/friends/friendActionsCore.ts`, som appens
// `POST /api/friends/invite` også kaller. Her leses skjemaet og statusen blir
// en redirect, med de samme kodene som før.

export async function sendFriendInvite(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  // Adressen sjekkes før innloggingen, slik handlingen alltid har gjort.
  const problem = inviteEmailProblem(email);
  if (problem) {
    redirect({ href: `/profile?invite_error=${problem}`, locale });
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/login', locale });
    return; // unreachable — i18n redirect throws but isn't typed `never`
  }

  const { status } = await inviteByEmail(supabase, user.id, email);
  if (status === 'profile_incomplete') {
    redirect({ href: '/complete-profile', locale });
  }
  if (status !== 'invited') {
    redirect({ href: `/profile?invite_error=${status}`, locale });
  }

  const returnTo = String(formData.get('return') ?? '').trim();
  if (returnTo === 'venner') {
    const qs = new URLSearchParams({ status: 'invited', invite_email: email });
    redirect({ href: `/profile/venner?${qs.toString()}`, locale });
  }
  const qs = new URLSearchParams({ invite: 'sent', invite_email: email });
  redirect({ href: `/profile?${qs.toString()}`, locale });
}

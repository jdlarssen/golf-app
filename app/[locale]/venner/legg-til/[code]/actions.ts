'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { connectByFriendCode } from '@/lib/friends/friendActionsCore';

/**
 * connectFriend — «legg til meg»-lenkens server-action. Den innloggede som
 * åpner lenken kobles som venn med eieren (eieren inviterte ved å dele,
 * åpneren aksepterer ved å koble). Koblingen og varselet til eieren bor i
 * `connectByFriendCode`, som appens `POST /api/friends/link/[code]` også
 * kjører (#2627).
 */
export async function connectFriend(formData: FormData) {
  const locale = await getLocale();
  const code = String(formData.get('code') ?? '').trim();
  if (!code) {
    redirect({ href: '/profile/venner', locale });
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: `/login?next=/venner/legg-til/${code}`, locale });
  }

  const status = await connectByFriendCode(supabase, user.id, code);
  if (status === 'error') {
    redirect({ href: `/venner/legg-til/${code}?error=1`, locale });
  }

  redirect({
    href: `/profile/venner?status=${status === 'already_friends' ? 'already_friends' : 'accepted'}`,
    locale,
  });
}

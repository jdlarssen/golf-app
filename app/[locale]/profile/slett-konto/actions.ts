'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
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

  // Block if the user is in any active or scheduled game
  const { data: activeGames } = await supabase
    .from('game_players')
    .select('game_id, games!inner(status)')
    .eq('user_id', user.id)
    .in('games.status', ['active', 'scheduled']);

  if (activeGames && activeGames.length > 0) {
    redirect({ href: '/profile/slett-konto?error=active_games', locale });
  }

  // Delete via service-role. auth.users → public.users cascades via FK.
  try {
    const admin = getAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  } catch (err) {
    console.error('[profile/slett-konto] deleteOwnAccount failed', { userId: user.id, err });
    redirect({ href: '/profile/slett-konto?error=delete_failed', locale });
  }

  // Session is now invalid — redirect to login
  redirect({ href: '/login?melding=konto_slettet', locale });
}

'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function deleteOwnAccount() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Block if the user is in any active or scheduled game
  const { data: activeGames } = await supabase
    .from('game_players')
    .select('game_id, games!inner(status)')
    .eq('user_id', user.id)
    .in('games.status', ['active', 'scheduled']);

  if (activeGames && activeGames.length > 0) {
    redirect('/profile/slett-konto?error=active_games');
  }

  // Delete via service-role. auth.users → public.users cascades via FK.
  try {
    const admin = getAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
  } catch (err) {
    console.error('[profile/slett-konto] deleteOwnAccount failed', { userId: user.id, err });
    redirect('/profile/slett-konto?error=delete_failed');
  }

  // Session is now invalid — redirect to login
  redirect('/login?melding=konto_slettet');
}

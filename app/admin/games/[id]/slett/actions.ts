'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import type { GameStatus } from '@/lib/games/status';

async function requireAdmin() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/');

  return { supabase };
}

export async function deleteGame(formData: FormData) {
  const gameId = String(formData.get('gameId') ?? '');
  if (!gameId) redirect('/admin/games?error=not_found');

  const { supabase } = await requireAdmin();

  // Fetch the game name for the success-banner redirect. No status block —
  // admin must be able to delete games in any state (including 'active') so
  // they can recover from a test game or an abandoned round where players
  // never submitted scorecards (which makes the normal endGame path
  // unreachable).
  const { data: game } = await supabase
    .from('games')
    .select('id, name, status')
    .eq('id', gameId)
    .maybeSingle<{ id: string; name: string; status: GameStatus }>();

  if (!game) redirect('/admin/games?error=not_found');

  // Delete the game row. FK ON DELETE CASCADE handles:
  //   - game_players (on delete cascade, 0001)
  //   - scores       (on delete cascade, 0001)
  //   - invitations  (on delete cascade, 0001 — rows deleted, not nulled)
  const { error } = await supabase.from('games').delete().eq('id', gameId);

  if (error) {
    console.error('[admin/games] deleteGame failed', { gameId, error });
    redirect(`/admin/games/${gameId}/slett?error=delete_failed`);
  }

  const qs = new URLSearchParams({ status: 'deleted', name: game.name });
  redirect(`/admin/games?${qs.toString()}`);
}

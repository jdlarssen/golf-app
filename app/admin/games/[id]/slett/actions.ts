'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import type { GameStatus } from '@/lib/games/status';

export async function deleteGame(formData: FormData) {
  const gameId = String(formData.get('gameId') ?? '');
  if (!gameId) redirect('/admin/games?error=not_found');

  const supabase = await getServerClient();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). Replaces the
  // previously-inlined auth.getUser + users.is_admin check.
  await requireAdmin(supabase);

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

  revalidateTag(`game-${gameId}`, 'max');
  const qs = new URLSearchParams({ status: 'deleted', name: game.name });
  redirect(`/admin/games?${qs.toString()}`);
}

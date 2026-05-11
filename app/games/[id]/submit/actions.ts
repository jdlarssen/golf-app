'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';

/**
 * Mark the current user's scorecard as submitted.
 *
 * Idempotent: the `.is('submitted_at', null)` guard means a second call
 * after the first has succeeded is a no-op (it simply matches zero rows).
 * Also refuses to mark when the game is no longer active.
 */
export async function submitScorecard(gameId: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Refuse to submit if the game isn't active. Draft games shouldn't have
  // scores yet and finished games are read-only.
  const { data: game } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single<{ status: 'draft' | 'scheduled' | 'active' | 'finished' }>();

  if (!game || game.status !== 'active') {
    redirect(`/games/${gameId}/submit?error=not_active`);
  }

  const { error } = await supabase
    .from('game_players')
    .update({
      submitted_at: new Date().toISOString(),
      // A previous rejection clears once the player re-submits.
      rejection_reason: null,
    })
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .is('submitted_at', null);

  if (error) {
    redirect(`/games/${gameId}/submit?error=db`);
  }

  revalidatePath(`/games/${gameId}`);
  redirect(`/games/${gameId}?status=submitted`);
}

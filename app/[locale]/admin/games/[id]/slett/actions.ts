'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import type { GameStatus } from '@/lib/games/status';

export async function deleteGame(formData: FormData) {
  const gameId = String(formData.get('gameId') ?? '');
  if (!gameId) redirect('/admin/games?error=not_found');

  const supabase = await getServerClient();
  // #428: admin OR the game's creator. requireAdminOrCreator reads created_by
  // for non-admins, so a non-owner (or unauthenticated) is bounced to `/` here
  // before any delete can run.
  const ctx = await requireAdminOrCreator(supabase, gameId);

  // Fetch the game name (for the success banner) + status (for the creator
  // restriction below). No status block for admins — they must be able to
  // delete games in any state (test games, abandoned rounds where scorecards
  // were never submitted, which makes the normal endGame path unreachable).
  const { data: game } = await supabase
    .from('games')
    .select('id, name, status')
    .eq('id', gameId)
    .maybeSingle<{ id: string; name: string; status: GameStatus }>();

  // Only reachable for an admin — a non-admin whose game doesn't exist was
  // already bounced to `/` by the gate above.
  if (!game) redirect('/admin/games?error=not_found');

  // #428 (eier-beslutning): a creator may only delete a game that hasn't started
  // — draft/scheduled. Once it's active/finished, the round and its (shared)
  // leaderboard belong to every participant, so only an admin can remove it
  // (recovery). The /games/[id]/slett page already gates this; the action
  // self-gates too against a direct POST.
  if (!ctx.isAdmin && game.status !== 'draft' && game.status !== 'scheduled') {
    redirect(`/games/${gameId}?error=not_deletable`);
  }

  // Delete the game row. FK ON DELETE CASCADE handles game_players, scores and
  // invitations (0001). Cascade actions bypass child-table RLS, so a creator's
  // delete (allowed by the 0071 creator-delete policy on games) removes the
  // children regardless of their own RLS — same as the admin path.
  const { error } = await supabase.from('games').delete().eq('id', gameId);

  if (error) {
    console.error('[games] deleteGame failed', { gameId, error });
    redirect(
      ctx.isAdmin
        ? `/admin/games/${gameId}/slett?error=delete_failed`
        : `/games/${gameId}/slett?error=delete_failed`,
    );
  }

  revalidateTag(`game-${gameId}`, 'max');

  if (ctx.isAdmin) {
    const qs = new URLSearchParams({ status: 'deleted', name: game.name });
    redirect(`/admin/games?${qs.toString()}`);
  }

  // Creator: no «Mine spill»-hub yet (Fase 3), so land on home with a
  // confirmation banner (eier-beslutning).
  redirect(`/?deleted=${encodeURIComponent(game.name)}`);
}

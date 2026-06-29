'use server';

import { getServerClient } from '@/lib/supabase/server';
import { isReactionEmoji } from '@/lib/games/reactions/palette';
import { fetchGameReactions } from '@/lib/games/reactions/fetch';
import type { ReactionSummary } from '@/lib/games/reactions/aggregate';
import { expectAffected } from '@/lib/supabase/affectedRows';

/**
 * Toggle an emoji reaction on a leaderboard row (#943).
 *
 * Slack-style: one row per (game, reactor, target, emoji). Calling with an
 * emoji you already have on a target removes it; calling with one you don't
 * have adds it.
 *
 * RLS enforces:
 *  - INSERT: caller must be a non-withdrawn participant; target must be a
 *    participant in the same game; user_id must equal auth.uid().
 *  - DELETE: caller can only remove their own reactions.
 *
 * The action does NOT call revalidateTag or notify() — optimistic UI gives
 * the reactor immediate feedback, and other participants see the change via
 * the realtime subscription in ReactionsProvider.
 */
export async function toggleReaction(input: {
  gameId: string;
  targetUserId: string;
  emoji: string;
}): Promise<{ active: boolean }> {
  const { gameId, targetUserId, emoji } = input;

  if (!isReactionEmoji(emoji)) {
    throw new Error(`toggleReaction: "${emoji}" is not a valid palette emoji`);
  }

  const supabase = await getServerClient();
  const {
    data: { user: maybeUser },
  } = await supabase.auth.getUser();
  if (!maybeUser) {
    throw new Error('toggleReaction: not authenticated');
  }
  const userId = maybeUser.id;

  // Check whether the viewer already has this reaction on the target.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: selectError } = await (supabase as any)
    .from('reactions')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .eq('target_user_id', targetUserId)
    .eq('emoji', emoji)
    .maybeSingle();

  if (selectError) {
    throw new Error(`toggleReaction: select failed — ${selectError.message}`);
  }

  if (existing) {
    // Reaction exists → DELETE (toggle off).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deleteResult = await (supabase as any)
      .from('reactions')
      .delete()
      .eq('id', existing.id)
      .eq('user_id', userId) // belt-and-suspenders: only own rows
      .select('id');

    expectAffected(deleteResult, 'toggleReaction:delete');
    return { active: false };
  } else {
    // Reaction does not exist → INSERT (toggle on).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertResult = await (supabase as any)
      .from('reactions')
      .insert({
        game_id: gameId,
        user_id: userId,
        target_user_id: targetUserId,
        emoji,
      })
      .select('id');

    expectAffected(insertResult, 'toggleReaction:insert');
    return { active: true };
  }
}

/**
 * Re-read the full reaction summary for a game (#943). Called by
 * ReactionsProvider after a realtime INSERT/DELETE on `reactions` to reconcile
 * every viewer's leaderboard to the authoritative server state (debounced).
 * RLS scopes the read to participants.
 */
export async function getReactionsSummary(gameId: string): Promise<ReactionSummary> {
  const supabase = await getServerClient();
  const {
    data: { user: maybeUser },
  } = await supabase.auth.getUser();
  if (!maybeUser) return {};
  return fetchGameReactions(supabase, gameId, maybeUser.id);
}

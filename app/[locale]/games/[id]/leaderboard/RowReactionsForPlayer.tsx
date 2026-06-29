'use client';

import type { ReactionEmoji } from '@/lib/games/reactions/palette';
import { useReactionsContext } from './ReactionsProvider';
import { RowReactions } from './RowReactions';

/**
 * Per-row connector (#943). Drop one of these into each individual-player
 * leaderboard view, keyed by the row's `userId`. It reads the reactions context
 * and renders the controlled `RowReactions` strip with that target's slice.
 *
 * When no `ReactionsProvider` is mounted above (e.g. a format-view unit test, or
 * a non-reaction format), it renders nothing — so existing view tests and the
 * team/matchplay views are unaffected.
 */
export function RowReactionsForPlayer({ targetUserId }: { targetUserId: string }) {
  const ctx = useReactionsContext();
  if (!ctx) return null;

  const { counts, mine } = ctx.getRow(targetUserId);
  return (
    <RowReactions
      counts={counts}
      mine={mine}
      onToggle={(emoji: ReactionEmoji) => ctx.toggle(targetUserId, emoji)}
      disabled={ctx.disabled}
    />
  );
}

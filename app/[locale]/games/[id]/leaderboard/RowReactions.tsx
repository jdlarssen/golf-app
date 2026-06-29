'use client';

import { useTranslations } from 'next-intl';
import { REACTION_EMOJIS, type ReactionEmoji } from '@/lib/games/reactions/palette';

/** Maps each palette emoji to its i18n name key in `leaderboard.reactions`. */
const EMOJI_NAME_KEY: Record<ReactionEmoji, 'clap' | 'fire' | 'laugh' | 'strong' | 'golf' | 'birdie'> = {
  '👏': 'clap',
  '🔥': 'fire',
  '😂': 'laugh',
  '💪': 'strong',
  '⛳': 'golf',
  '🐦': 'birdie',
};

export interface RowReactionsProps {
  /** Per-emoji count (only emojis with count > 0 are present). */
  counts: Partial<Record<ReactionEmoji, number>>;
  /** Emojis the current viewer has already given to this target. */
  mine: readonly ReactionEmoji[];
  /** Toggle handler — the owning provider applies the optimistic update + write. */
  onToggle: (emoji: ReactionEmoji) => void;
  /** True when reactions should be disabled (offline, etc.). */
  disabled?: boolean;
}

/**
 * Emoji-reaction strip for a single leaderboard row (#943).
 *
 * Presentational/controlled: renders the 6-emoji palette and bubbles taps up via
 * `onToggle`. All state (counts, the viewer's own reactions, optimistic updates,
 * realtime reconciliation) lives in `ReactionsProvider` — this component is a
 * pure function of its props so live updates flow straight through.
 *
 * Each button shows the emoji + count (when > 0) and is marked active when the
 * viewer has given that reaction. Rendered per row by the individual-player
 * leaderboard views via `RowReactionsForPlayer`; NOT used by team-scramble or
 * matchplay views where a row does not map to a single player.
 */
export function RowReactions({ counts, mine, onToggle, disabled = false }: RowReactionsProps) {
  const t = useTranslations('leaderboard.reactions');

  return (
    <div className="flex flex-wrap items-center gap-1 pt-1" aria-label={t('groupLabel')}>
      {REACTION_EMOJIS.map((emoji) => {
        const isActive = mine.includes(emoji);
        const count = counts[emoji] ?? 0;
        const emojiName = t(EMOJI_NAME_KEY[emoji]);

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            disabled={disabled}
            aria-label={isActive ? t('toggleActive', { emoji: emojiName }) : t('toggle', { emoji: emojiName })}
            aria-pressed={isActive}
            className={[
              'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full',
              'border px-2 text-sm transition-colors duration-100',
              'disabled:cursor-not-allowed disabled:opacity-40',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              isActive
                ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20'
                : 'border-border bg-surface text-text hover:border-primary/40 hover:bg-primary-soft',
            ].join(' ')}
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 && (
              <span className="font-sans text-xs tabular-nums leading-none">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

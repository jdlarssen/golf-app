'use client';

import { useState } from 'react';
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

const BUTTON_BASE = [
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full',
  'border px-2 text-sm transition-colors duration-100',
  'disabled:cursor-not-allowed disabled:opacity-40',
  '',
].join(' ');

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
 * Emoji-reaction strip for a single leaderboard row (#943, redesigned #1293).
 *
 * Presentational/controlled: all state (counts, the viewer's own reactions,
 * optimistic updates, realtime reconciliation) lives in `ReactionsProvider` — this
 * component is a pure function of its props plus one bit of local presentation
 * state (`expanded`), so live updates flow straight through.
 *
 * Compact by default (#1293): only reactions with a count > 0 render as chips, and
 * the full 6-emoji palette hides behind a single "add reaction" trigger. Tapping a
 * chip toggles that reaction directly; tapping the trigger expands the palette
 * inline, and picking one collapses back to chips (WhatsApp/Slack mental model).
 *
 * Rendered per row by the individual-player leaderboard views via
 * `RowReactionsForPlayer`; NOT used by team-scramble or matchplay views where a
 * row does not map to a single player.
 */
export function RowReactions({ counts, mine, onToggle, disabled = false }: RowReactionsProps) {
  const t = useTranslations('leaderboard.reactions');
  const [expanded, setExpanded] = useState(false);

  // Disabled rows never open the palette — force the compact chip view.
  const showPalette = expanded && !disabled;

  function reactionButton(emoji: ReactionEmoji, onClick: () => void) {
    const isActive = mine.includes(emoji);
    const count = counts[emoji] ?? 0;
    const emojiName = t(EMOJI_NAME_KEY[emoji]);

    return (
      <button
        key={emoji}
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={isActive ? t('toggleActive', { emoji: emojiName }) : t('toggle', { emoji: emojiName })}
        aria-pressed={isActive}
        className={[
          BUTTON_BASE,
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
  }

  const chips = REACTION_EMOJIS.filter((emoji) => (counts[emoji] ?? 0) > 0);

  return (
    <div className="flex flex-wrap items-center gap-1 pt-1" aria-label={t('groupLabel')}>
      {showPalette
        ? // Expanded: the full palette. Picking one toggles it and collapses back.
          REACTION_EMOJIS.map((emoji) =>
            reactionButton(emoji, () => {
              onToggle(emoji);
              setExpanded(false);
            }),
          )
        : // Collapsed: only given reactions, each a direct toggle.
          chips.map((emoji) => reactionButton(emoji, () => onToggle(emoji)))}

      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        disabled={disabled}
        aria-label={showPalette ? t('close') : t('open')}
        aria-expanded={showPalette}
        className={[
          BUTTON_BASE,
          'border-border bg-surface text-text hover:border-primary/40 hover:bg-primary-soft',
        ].join(' ')}
      >
        {showPalette ? (
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M8 14a4 4 0 0 0 6 0" />
            <path d="M9 9h.01M14 9h.01" />
            <path d="M18.5 4.5v4M20.5 6.5h-4" />
          </svg>
        )}
      </button>
    </div>
  );
}

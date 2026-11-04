/**
 * Emoji palette for leaderboard reactions (#943).
 *
 * ⚠️  ONE RULE, TWO HOMES (AGENTS.md trap #4):
 * The list below MUST stay byte-for-byte identical to the CHECK constraint in
 * supabase/migrations/0119_game_reactions.sql:
 *
 *   constraint reactions_emoji_palette check (emoji in ('👏','🔥','😂','💪','⛳','🐦'))
 *
 * Change both in the same commit whenever the palette is updated.
 * The DB CHECK is the outer guard against hostile PATCH; this constant is the
 * inner guard at the server-action boundary.
 */

export const REACTION_EMOJIS = ['👏', '🔥', '😂', '💪', '⛳', '🐦'] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Maps each palette emoji to its i18n name key in `leaderboard.reactions`. */
export const EMOJI_NAME_KEY: Record<
  ReactionEmoji,
  'clap' | 'fire' | 'laugh' | 'strong' | 'golf' | 'birdie'
> = {
  '👏': 'clap',
  '🔥': 'fire',
  '😂': 'laugh',
  '💪': 'strong',
  '⛳': 'golf',
  '🐦': 'birdie',
};

/** Narrows an unknown string to `ReactionEmoji`. */
export function isReactionEmoji(s: string): s is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(s);
}

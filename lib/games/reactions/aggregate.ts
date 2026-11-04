import { REACTION_EMOJIS, isReactionEmoji, type ReactionEmoji } from './palette';

/** A single row as selected from the `reactions` table. */
export interface ReactionRow {
  target_user_id: string;
  emoji: string;
  user_id: string;
}

/**
 * Per-target aggregation returned by `aggregateReactions`.
 *
 * - `counts`: number of distinct users who gave each emoji (only emojis with
 *   count > 0 are included).
 * - `mine`: emojis the viewing user has given this target, ordered by
 *   REACTION_EMOJIS palette order.
 */
export type ReactionSummary = Record<
  string /* targetUserId */,
  {
    counts: Partial<Record<ReactionEmoji, number>>;
    mine: ReactionEmoji[];
  }
>;

/** How many given reactions a row shows, most given first. */
const SHOWN_REACTIONS = 3;

/** The reactions a player has been given, most given first, at most three. */
export function topReactions(
  counts: Partial<Record<ReactionEmoji, number>>,
): [ReactionEmoji, number][] {
  return (Object.entries(counts) as [ReactionEmoji, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SHOWN_REACTIONS);
}

/** Apply a viewer's own optimistic toggle to the summary (pure). */
export function applyToggle(
  summary: ReactionSummary,
  targetUserId: string,
  emoji: ReactionEmoji,
): ReactionSummary {
  const row = summary[targetUserId] ?? { counts: {}, mine: [] };
  const wasActive = row.mine.includes(emoji);
  const nextMine = wasActive
    ? row.mine.filter((e) => e !== emoji)
    : [...row.mine, emoji];
  const nextVal = (row.counts[emoji] ?? 0) + (wasActive ? -1 : 1);
  const nextCounts = { ...row.counts };
  if (nextVal > 0) nextCounts[emoji] = nextVal;
  else delete nextCounts[emoji];
  return { ...summary, [targetUserId]: { counts: nextCounts, mine: nextMine } };
}

/**
 * Aggregate an array of reaction rows into a per-target summary.
 *
 * Pure function — no I/O, no side effects. Rows whose emoji is not in the
 * palette are silently ignored (defensive: guards against future schema
 * migrations landing before a code deploy).
 *
 * @param rows      Raw rows from the `reactions` table (target_user_id, emoji, user_id).
 * @param myUserId  The current viewer's user id used to populate `mine`.
 */
export function aggregateReactions(
  rows: ReactionRow[],
  myUserId: string,
): ReactionSummary {
  const summary: ReactionSummary = {};

  for (const row of rows) {
    if (!isReactionEmoji(row.emoji)) continue;
    const emoji = row.emoji;
    const targetId = row.target_user_id;

    if (!summary[targetId]) {
      summary[targetId] = { counts: {}, mine: [] };
    }

    const entry = summary[targetId];
    entry.counts[emoji] = (entry.counts[emoji] ?? 0) + 1;

    if (row.user_id === myUserId && !entry.mine.includes(emoji)) {
      entry.mine.push(emoji);
    }
  }

  // Ensure `mine` arrays follow palette order for predictable rendering.
  for (const entry of Object.values(summary)) {
    entry.mine.sort(
      (a, b) => REACTION_EMOJIS.indexOf(a) - REACTION_EMOJIS.indexOf(b),
    );
  }

  return summary;
}

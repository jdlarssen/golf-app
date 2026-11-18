/**
 * recommendFormat — the format the helper on /spillformater suggests from
 * three answers: how many you are, how even you are, and what you want out of
 * the day (#2328).
 *
 * The table below only orders candidates. Whether a candidate can be played
 * with a count is `fitsPlayerCount`'s call, so a change to a format's limits
 * moves the suggestion without anything here changing. The rule, in order:
 *  1. the first candidate that fits every count in the bucket;
 *  2. else the first that fits at least one count (`fitsEveryCount: false`);
 *  3. else Stableford (`isFallback: true`) — only team spirit with 3 players.
 *     Stableford fits any count, so the fallback has `fitsEveryCount: true`.
 *
 * Pure logic, no server import: the native app can read it later.
 */

import type { GameMode } from '@/lib/scoring/modes/types';
import { fitsPlayerCount } from '@/lib/wizard/fitsPlayerCount';
import { TEAM_FORMAT_PLAYER_CAP } from '@/lib/games/teamFormatLimits';

export const PLAYER_COUNT_BUCKETS = ['2', '3', '4', '5-12', '13+'] as const;
export type CountBucket = (typeof PLAYER_COUNT_BUCKETS)[number];

export const LEVELS = ['even', 'uneven'] as const;
export type Level = (typeof LEVELS)[number];

export const GOALS = ['compete', 'team', 'stakes'] as const;
export type Goal = (typeof GOALS)[number];

export type FormatAnswers = { bucket: CountBucket; level: Level; goal: Goal };

export type FormatRecommendation = {
  mode: GameMode;
  /** The bucket's one count (2, 3 or 4), or `null` for 5–12 and 13+. */
  exactCount: number | null;
  fitsEveryCount: boolean;
  isFallback: boolean;
};

const BUCKET_RANGES: Record<CountBucket, { min: number; max: number }> = {
  '2': { min: 2, max: 2 },
  '3': { min: 3, max: 3 },
  '4': { min: 4, max: 4 },
  '5-12': { min: 5, max: 12 },
  // The same ceiling as the wizard's count picker.
  '13+': { min: 13, max: TEAM_FORMAT_PLAYER_CAP },
};

const CANDIDATES: Record<Goal, Record<Level, readonly GameMode[]>> = {
  compete: { even: ['singles_matchplay', 'solo_strokeplay'], uneven: ['stableford'] },
  team: { even: ['fourball_matchplay', 'best_ball'], uneven: ['texas_scramble', 'best_ball'] },
  stakes: { even: ['wolf', 'nassau'], uneven: ['bingo_bango_bongo'] },
};

const FALLBACK: GameMode = 'stableford';

/** Every count in the bucket, ascending. */
export function bucketCounts(bucket: CountBucket): number[] {
  const { min, max } = BUCKET_RANGES[bucket];
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

export function recommendFormat({ bucket, level, goal }: FormatAnswers): FormatRecommendation {
  const counts = bucketCounts(bucket);
  const exactCount = counts.length === 1 ? counts[0] : null;
  const candidates = CANDIDATES[goal][level];

  const fitsAll = candidates.find((mode) => counts.every((n) => fitsPlayerCount(mode, n)));
  if (fitsAll) return { mode: fitsAll, exactCount, fitsEveryCount: true, isFallback: false };

  const fitsSome = candidates.find((mode) => counts.some((n) => fitsPlayerCount(mode, n)));
  if (fitsSome) return { mode: fitsSome, exactCount, fitsEveryCount: false, isFallback: false };

  // Stableford fits every count from 1 up, so the fallback always fits.
  return { mode: FALLBACK, exactCount, fitsEveryCount: true, isFallback: true };
}

/** The bucket a count sits in, or `undefined` below 2 (no bucket asks for it). */
function bucketOf(count: number): CountBucket | undefined {
  return PLAYER_COUNT_BUCKETS.find((bucket) => {
    const { min, max } = BUCKET_RANGES[bucket];
    return count >= min && count <= max;
  });
}

/**
 * Candidates that only the wizard may fall back to, after `CANDIDATES` found
 * nothing that fits the exact count (#2462). They are not in the table above,
 * so /spillformater keeps answering as before: Texas scramble fits every odd
 * count from 5 where best ball does not.
 */
const EXACT_RESERVE: Partial<Record<Goal, Partial<Record<Level, readonly GameMode[]>>>> = {
  team: { even: ['texas_scramble'] },
};

export type CountRecommendation = FormatRecommendation & {
  /** The bucket's answer when this count cannot play it, else `null`. */
  displaced: GameMode | null;
};

/**
 * The same rule for the wizard, which knows the exact count (#2462). The
 * bucket's answer (`recommendFormat`) wins whenever the count can play it, so
 * /spillformater and the wizard never disagree about what both can answer. The
 * wizard's list hides formats that do not fit, so when the bucket's answer
 * does not fit the count the first candidate that does is chosen, then the
 * reserve above, then Stableford (`isFallback`). `displaced` names the format
 * the count ruled out, for the note under the card.
 */
export function recommendFormatForCount({
  count,
  level,
  goal,
}: {
  count: number;
  level: Level;
  goal: Goal;
}): CountRecommendation {
  const bucket = bucketOf(count);
  const answer = bucket ? recommendFormat({ bucket, level, goal }) : undefined;
  if (answer && fitsPlayerCount(answer.mode, count)) {
    return { ...answer, exactCount: count, fitsEveryCount: true, displaced: null };
  }

  const displaced = answer?.mode ?? null;
  const candidates = [...CANDIDATES[goal][level], ...(EXACT_RESERVE[goal]?.[level] ?? [])];
  const mode = candidates.find((m) => fitsPlayerCount(m, count));
  if (mode) {
    return { mode, exactCount: count, fitsEveryCount: true, isFallback: false, displaced };
  }
  return { mode: FALLBACK, exactCount: count, fitsEveryCount: true, isFallback: true, displaced };
}

import type { HoleSegment } from '@/lib/scoring';
import { holeNumbersForSegment } from './holeScope';

/**
 * The next hole a player should enter: the first hole of the segment without a
 * score, or `null` when every hole is filled (the next stop is «Lever
 * scorekort»). `filled` is the hole numbers that already have a score, as the
 * caller counts them (the Home card uses the team captain's rows, the live
 * board the player's own).
 *
 * #2253: the one home for the rule, lifted unchanged out of
 * `getActiveGameCardData` so the Home card and the board's strip cannot send a
 * player to different holes.
 */
export function nextUnfilledHole(
  segment: HoleSegment,
  filled: ReadonlySet<number>,
): number | null {
  const holeNumbers = holeNumbersForSegment(segment);
  if (filled.size >= holeNumbers.length) return null;
  for (const h of holeNumbers) {
    if (!filled.has(h)) return h;
  }
  return holeNumbers[0];
}

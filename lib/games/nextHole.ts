import type { HoleSegment } from '@/lib/scoring';
import { holeNumbersForSegment } from './holeScope';
import type { StartType } from './startType';

/**
 * The segment's holes in the order a player plays them (#2286). A first-tee
 * round is the segment in hole order. In a shotgun every group starts on its
 * own hole, and the database does not store which, so the start is read off
 * the holes already played: where the shortest forward run round the segment
 * that covers all of them begins (10, 11, 13, 14 → 10; 15–18 and 1 → 15). On a
 * tie the lowest hole wins. Before any hole is played the order starts on the
 * first hole, as today.
 */
export function playOrder(
  segment: HoleSegment,
  startType: StartType,
  filled: ReadonlySet<number>,
): number[] {
  const holes = holeNumbersForSegment(segment);
  if (startType !== 'shotgun') return holes;
  const n = holes.length;
  let start = 0;
  let shortest = Infinity;
  for (let i = 0; i < n; i++) {
    if (!filled.has(holes[i])) continue;
    let span = 0;
    for (let d = 0; d < n; d++) if (filled.has(holes[(i + d) % n])) span = d;
    if (span < shortest) {
      shortest = span;
      start = i;
    }
  }
  return [...holes.slice(start), ...holes.slice(0, start)];
}

/**
 * The next hole a player should enter: the first hole of the segment without a
 * score, or `null` when every hole is filled (the next stop is «Lever
 * scorekort»). `filled` is the hole numbers that already have a score, as the
 * caller counts them (the Home card uses the team captain's rows, the live
 * board the player's own).
 *
 * #2253: the one home for the rule, lifted unchanged out of
 * `getActiveGameCardData` so the Home card and the board's strip cannot send a
 * player to different holes. #2286: a shotgun round walks `playOrder`.
 */
export function nextUnfilledHole(
  segment: HoleSegment,
  filled: ReadonlySet<number>,
  startType: StartType = 'first_tee',
): number | null {
  const holeNumbers = playOrder(segment, startType, filled);
  if (filled.size >= holeNumbers.length) return null;
  for (const h of holeNumbers) {
    if (!filled.has(h)) return h;
  }
  return holeNumbers[0];
}

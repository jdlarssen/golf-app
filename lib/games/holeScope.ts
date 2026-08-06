import { holesForSegment, type HoleSegment } from '@/lib/scoring';

// Hole-number scope derived from `games.hole_segment` (#1441 splittet cup-dag).
// `holesForSegment` (lib/scoring, read-only from this layer) already filters an
// arbitrary hole list down to a segment's numbers — this module wraps it with
// a static 1-18 scaffold so app-layer consumers (delivery status, submit/
// approve reviews, hole navigation, scorecard) can ask "how many holes" and
// "which hole numbers" without re-deriving the front9/back9 boundary or
// reaching into lib/scoring themselves. 'full' behaves exactly like today
// (18 holes, numbered 1-18) — only front9/back9 games see a narrower scope.

const ALL_HOLE_NUMBERS: readonly { number: number }[] = Array.from(
  { length: 18 },
  (_, i) => ({ number: i + 1 }),
);

/** Ordered hole numbers in `segment`'s scope: [1..18], [1..9], or [10..18]. */
export function holeNumbersForSegment(segment: HoleSegment): number[] {
  return holesForSegment(ALL_HOLE_NUMBERS, segment).map((h) => h.number);
}

/** How many holes make up `segment` — 18 for 'full', 9 for front9/back9. */
export function holeCountForSegment(segment: HoleSegment): number {
  return holeNumbersForSegment(segment).length;
}

/** First hole number in `segment`'s scope — 1 for full/front9, 10 for back9. */
export function firstHoleForSegment(segment: HoleSegment): number {
  return holeNumbersForSegment(segment)[0];
}

/** Last hole number in `segment`'s scope — 9 for front9, 18 for full/back9. */
export function lastHoleForSegment(segment: HoleSegment): number {
  const nums = holeNumbersForSegment(segment);
  return nums[nums.length - 1];
}

/** True when `holeNumber` belongs to `segment`'s scope. */
export function isHoleInSegment(holeNumber: number, segment: HoleSegment): boolean {
  return holeNumbersForSegment(segment).includes(holeNumber);
}

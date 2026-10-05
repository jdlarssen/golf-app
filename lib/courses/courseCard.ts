import { isHoleInSegment } from '@/lib/games/holeScope';

/**
 * The course card on the public course page (#2277): out and in nines, the
 * par sum, the hardest and easiest hole, the extra par rows and the tee
 * order. Pure, so «Legg til bane» (#2278) shares it.
 */

type HoleNumber = { hole_number: number };

type HolePars = {
  par_mens: number | null;
  par_ladies: number | null;
  par_juniors: number | null;
};

/** Holes 1–9 and 10–18, each sorted by hole number. */
export function splitNines<T extends HoleNumber>(holes: T[]): { out: T[]; in: T[] } {
  const sorted = [...holes].sort((a, b) => a.hole_number - b.hole_number);
  return {
    out: sorted.filter((h) => isHoleInSegment(h.hole_number, 'front9')),
    in: sorted.filter((h) => isHoleInSegment(h.hole_number, 'back9')),
  };
}

/**
 * The par a tap on the course card's par cell moves to (#2278): 3 → 4 → 5 → 3.
 * Anything else, such as a stored 6 the server accepts, goes to 3.
 */
export function nextPar(value: string): 3 | 4 | 5 {
  if (value === '3') return 4;
  if (value === '4') return 5;
  return 3;
}

/** The card lists the missing indices up to this many; past it, only the count. */
export const MAX_LISTED_MISSING = 6;

/**
 * The line at the foot of «Legg til bane»'s card (#2278): the hint while no
 * index is typed, the missing numbers while one to six are missing, the count
 * from seven, and nothing once all 18 are there. `missing` comes from
 * `findStrokeIndexGaps`.
 */
export function indexStatusLine(
  values: readonly string[],
  missing: readonly number[],
): { kind: 'hint' } | { kind: 'list'; numbers: number[] } | { kind: 'count'; count: number } | null {
  if (values.every((v) => v.trim() === '')) return { kind: 'hint' };
  if (missing.length > MAX_LISTED_MISSING) return { kind: 'count', count: missing.length };
  if (missing.length > 0) return { kind: 'list', numbers: [...missing] };
  return null;
}

/**
 * The sum of the men's par. The column is NOT NULL in the DB; the type is
 * nullable, so a null counts 0.
 */
export function coursePar(holes: { par_mens: number | null }[]): number {
  return holes.reduce((sum, h) => sum + (h.par_mens ?? 0), 0);
}

/**
 * The holes with the lowest (hardest) and the highest (easiest) stroke index;
 * a tie keeps the lower hole number. `null` when there are no holes.
 */
export function hardestAndEasiest<T extends HoleNumber & { stroke_index: number }>(
  holes: T[],
): { hardest: T; easiest: T } | null {
  if (holes.length === 0) return null;
  const sorted = [...holes].sort((a, b) => a.hole_number - b.hole_number);
  let hardest = sorted[0];
  let easiest = sorted[0];
  for (const h of sorted) {
    if (h.stroke_index < hardest.stroke_index) hardest = h;
    if (h.stroke_index > easiest.stroke_index) easiest = h;
  }
  return { hardest, easiest };
}

/**
 * Which genders get their own par row: those whose par differs from the
 * men's on at least one hole. Norwegian courses rate every gender at the
 * same par on nearly every hole, so most cards show the one Par row.
 */
export function genderParRows(holes: HolePars[]): ('ladies' | 'juniors')[] {
  const differs = (gender: 'ladies' | 'juniors') =>
    holes.some((h) => {
      const par = gender === 'ladies' ? h.par_ladies : h.par_juniors;
      return par !== null && par !== h.par_mens;
    });
  return (['ladies', 'juniors'] as const).filter(differs);
}

/** Longest tee first, tees without a length last, then by name. */
export function sortTeesForCard<T extends { name: string; length_meters: number | null }>(
  tees: T[],
): T[] {
  return [...tees].sort((a, b) => {
    if (a.length_meters !== b.length_meters) {
      if (a.length_meters === null) return 1;
      if (b.length_meters === null) return -1;
      return b.length_meters - a.length_meters;
    }
    return a.name.localeCompare(b.name, 'nb');
  });
}

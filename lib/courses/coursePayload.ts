/**
 * Pure validation + parsing for course payloads (holes, tee boxes, per-gender
 * ratings). Extracted from the `createCourse` / `updateCourse` server actions so
 * the rules live in one tested place instead of being duplicated inline across
 * `admin/courses/new/actions.ts` and `admin/courses/[id]/edit/actions.ts`.
 *
 * No I/O — callers read FormData and pass plain strings/numbers in, then map the
 * results back to redirect error codes. Mirrors the pattern of
 * `lib/games/gamePayload.ts`.
 */

export type GenderRating = {
  slope: number | null;
  course_rating: number | null;
};

// Ranges mirror the DB CHECK constraints (0132) so we surface a friendly error
// instead of tripping a Postgres constraint. These are sanity bounds against
// typos, not WHS-conformance gates: the WHS slope ceiling is 155, but some
// courses publish older, un-capped ratings just above (Miklagard: 157), and
// course rating has no WHS upper cap at all (ladies from long tees exceed 80).
const SLOPE_MIN = 55;
const SLOPE_MAX = 165;
const CR_MIN = 50;
const CR_MAX = 90;
const PAR_MIN = 3;
const PAR_MAX = 6;
const SI_MIN = 1;
const SI_MAX = 18;
const LENGTH_MIN = 1000;
const LENGTH_MAX = 12000;

/**
 * Parse + clamp a per-gender rating from raw form strings. Empty or
 * out-of-range values become `null` per field — slope must be an integer in
 * 55–165, course rating a finite number in 50–90.
 */
export function parseGenderRating(slopeStr: string, crStr: string): GenderRating {
  const s = slopeStr.trim();
  const c = crStr.trim();

  const slope = s === '' ? null : Number(s);
  const cr = c === '' ? null : Number(c);

  return {
    slope:
      slope !== null && Number.isInteger(slope) && slope >= SLOPE_MIN && slope <= SLOPE_MAX
        ? slope
        : null,
    course_rating:
      cr !== null && Number.isFinite(cr) && cr >= CR_MIN && cr <= CR_MAX ? cr : null,
  };
}

/** A rating is usable only when both slope and course rating are present. */
export function isCompleteRating(r: GenderRating): boolean {
  return r.slope !== null && r.course_rating !== null;
}

/**
 * True when exactly one of slope/CR is filled — the only state we reject. Admin
 * may legitimately leave any gender entirely blank, so 0 filled is fine.
 */
export function isPartiallyFilledRating(slopeStr: string, crStr: string): boolean {
  const filled = [slopeStr.trim(), crStr.trim()].filter((x) => x !== '').length;
  return filled === 1;
}

/**
 * Parse optional tee length. Empty, non-integer, or out-of-range → `null`.
 * Mirrors the DB CHECK (1000–12000 meters).
 */
export function parseLengthMeters(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= LENGTH_MIN && n <= LENGTH_MAX ? n : null;
}

/** Par per hole must be an integer in 3–6. */
export function isValidPar(par: number): boolean {
  return Number.isInteger(par) && par >= PAR_MIN && par <= PAR_MAX;
}

/** Stroke index per hole must be an integer in 1–18. */
export function isValidStrokeIndex(si: number): boolean {
  return Number.isInteger(si) && si >= SI_MIN && si <= SI_MAX;
}

/**
 * Stroke indices across the holes must be unique. Combined with the per-hole
 * 1–18 check over exactly 18 holes, uniqueness implies a full permutation.
 */
export function allStrokeIndicesUnique(sis: number[]): boolean {
  return new Set(sis).size === sis.length;
}

/**
 * Client-side mirror of the server's SI rule (#2279): which numbers in 1–18 no
 * valid field covers, which valid numbers appear more than once, and which
 * holes (1-based) hold a typed value that is not a valid index. Each value goes
 * through `Number()` after trimming, as `parseCourseHolesAndTees` does, so
 * empty, non-integer and out-of-range fields count as absent. `missing` is empty
 * exactly when the server accepts the indices (locked in parseCourseForm.test).
 */
export function findStrokeIndexGaps(values: string[]): {
  missing: number[];
  duplicates: number[];
  invalid: number[];
} {
  const counts = new Map<number, number>();
  const invalid: number[] = [];
  values.forEach((raw, i) => {
    const s = raw.trim();
    if (s === '') return;
    const n = Number(s);
    if (!isValidStrokeIndex(n)) {
      invalid.push(i + 1);
      return;
    }
    counts.set(n, (counts.get(n) ?? 0) + 1);
  });
  const missing: number[] = [];
  const duplicates: number[] = [];
  for (let si = SI_MIN; si <= SI_MAX; si++) {
    const c = counts.get(si) ?? 0;
    if (c === 0) missing.push(si);
    if (c > 1) duplicates.push(si);
  }
  return { missing, duplicates, invalid };
}

/**
 * Client-side mirror of the server's tee-rating rule (#2279), in the server's
 * order: `'partial'` when a gender has only one of slope/CR, otherwise
 * `'missing'` when no gender has a complete, in-range set, otherwise `null`.
 */
export function teeRatingProblem(
  ratings: ReadonlyArray<{ slope: string; cr: string }>,
): 'partial' | 'missing' | null {
  if (ratings.some((r) => isPartiallyFilledRating(r.slope, r.cr))) return 'partial';
  if (!ratings.some((r) => isCompleteRating(parseGenderRating(r.slope, r.cr)))) return 'missing';
  return null;
}

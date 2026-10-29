/**
 * A 9-hole course played twice (#2484). It is typed in as one nine with two
 * index rows and stored as 18 holes: 10–18 copy the par of 1–9 and carry the
 * second round's index. The server (`parseCourseHolesAndTees`) and the form
 * (`CourseForm`) expand with the same function, so the 18-hole index rule
 * stays the one in `coursePayload.ts`. Generic over the form's strings and the
 * server's numbers.
 */

type NineHole<S> = {
  hole_number: number;
  stroke_index: S;
  par_mens: unknown;
  par_ladies: unknown;
  par_juniors: unknown;
};

const byHole = <T extends { hole_number: number }>(holes: T[]) =>
  [...holes].sort((a, b) => a.hole_number - b.hole_number);

/**
 * Holes 1–9 plus 10–18: each back hole is the front hole nine numbers on, with
 * the same par and the index from `secondRound` (in hole order 1–9).
 */
export function expandNineHoles<S, T extends NineHole<S>>(nine: T[], secondRound: S[]): T[] {
  if (nine.length !== 9 || secondRound.length !== 9) {
    throw new Error('expandNineHoles needs 9 holes and 9 second round indices');
  }
  const front = byHole(nine);
  return [
    ...front,
    ...front.map((h, i) => ({ ...h, hole_number: h.hole_number + 9, stroke_index: secondRound[i] })),
  ];
}

/**
 * The other way: holes 1–9 as they are, and the indices of 10–18 as the
 * second round. For an 18-hole course switched to nine holes, the par of
 * 10–18 is dropped.
 */
export function foldToNine<S, T extends NineHole<S>>(holes: T[]): { holes: T[]; secondRound: S[] } {
  const sorted = byHole(holes);
  return {
    holes: sorted.filter((h) => h.hole_number <= 9),
    secondRound: sorted.filter((h) => h.hole_number > 9).map((h) => h.stroke_index),
  };
}

/**
 * A scorecard with one index per hole (1–9): the first round gets the odd
 * numbers (2k − 1) and the second the even ones (2k).
 */
export function splitSingleIndices(values: number[]): { round1: number[]; round2: number[] } {
  return {
    round1: values.map((k) => 2 * k - 1),
    round2: values.map((k) => 2 * k),
  };
}

/**
 * When «Fordel» shows (#2484): the second row is empty and the first holds
 * nine whole numbers 1–9, each once — one index per hole off the scorecard.
 */
export function canSplitSingleIndices(round1: string[], round2: string[]): boolean {
  if (round1.length !== 9 || round2.some((v) => v.trim() !== '')) return false;
  const numbers = round1.map((v) => (v.trim() === '' ? NaN : Number(v.trim())));
  return (
    numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 9) &&
    new Set(numbers).size === 9
  );
}

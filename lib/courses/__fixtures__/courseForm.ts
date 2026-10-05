/**
 * Shared test fixtures for the course form (#2279): a real club stroke-index
 * order (no course has SI equal to the hole number on all 18) and a FormData
 * builder shaped like what CourseForm submits.
 */
export const REAL_SI = [7, 15, 3, 11, 1, 17, 5, 13, 9, 8, 16, 4, 12, 2, 18, 6, 14, 10] as const;

/** REAL_SI as the strings the form fields hold. */
export const REAL_SI_STRINGS: string[] = REAL_SI.map(String);

export type RatingInput = { slope: string; cr: string };
export const EMPTY_RATING: RatingInput = { slope: '', cr: '' };
const GENDERS = ['mens', 'ladies', 'juniors'] as const;

/** One course with 18 par-4 holes and a single tee box «Gul». */
export function buildCourseFormData(
  si: string[] = REAL_SI_STRINGS,
  ratings: RatingInput[] = [{ slope: '120', cr: '70.1' }, EMPTY_RATING, EMPTY_RATING],
): FormData {
  const fd = new FormData();
  fd.set('name', 'Testbane');
  for (let i = 1; i <= 18; i++) {
    fd.set(`hole_${i}_par_mens`, '4');
    fd.set(`hole_${i}_si`, si[i - 1]);
  }
  fd.set('tee_0_name', 'Gul');
  GENDERS.forEach((g, idx) => {
    fd.set(`tee_0_slope_${g}`, ratings[idx].slope);
    fd.set(`tee_0_cr_${g}`, ratings[idx].cr);
  });
  return fd;
}

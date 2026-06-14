/**
 * FormData → validated course payload (name, 18 holes, tee boxes). Extracted in
 * #611 from the near-identical parsing loops in `createCourse` and
 * `updateCourse`. Builds on the pure primitives in `coursePayload.ts`.
 *
 * Validation errors are reported via the `fail` callback, which must redirect
 * (i.e. never return) — each action redirects to its own base with `?error=`.
 * Every tee box carries an `id` (null for a fresh row); `createCourse` strips it
 * before inserting, `updateCourse` uses it to diff existing rows.
 */
import {
  parseGenderRating,
  isCompleteRating,
  isPartiallyFilledRating,
  parseLengthMeters,
  isValidPar,
  isValidStrokeIndex,
  allStrokeIndicesUnique,
} from './coursePayload';

export type ParsedHole = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

export type ParsedTeeBox = {
  id: string | null;
  name: string;
  length_meters: number | null;
  slope_mens: number | null;
  course_rating_mens: number | null;
  par_total_mens: number | null;
  slope_ladies: number | null;
  course_rating_ladies: number | null;
  par_total_ladies: number | null;
  slope_juniors: number | null;
  course_rating_juniors: number | null;
  par_total_juniors: number | null;
};

export type ParsedCourseForm = {
  name: string;
  holes: ParsedHole[];
  teeBoxes: ParsedTeeBox[];
};

export function parseCourseHolesAndTees(
  formData: FormData,
  maxTeeBoxes: number,
  fail: (code: string) => never,
): ParsedCourseForm {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    fail('name_required');
  }

  // Parse 18 holes.
  const holes: ParsedHole[] = [];
  for (let i = 1; i <= 18; i++) {
    const parMensRaw = formData.get(`hole_${i}_par_mens`);
    // Backward-compat: hvis ny `_mens`-feltet mangler (ingen formdata med
    // det nye navnet), fall tilbake til det gamle `hole_${i}_par`-navnet.
    // Hovedstien sender alltid `_mens` etter at CourseForm ble oppdatert.
    const parMens = Number(parMensRaw ?? formData.get(`hole_${i}_par`));
    // For damer og junior: når seksjonen er kollapset i form, sendes
    // hidden-mirror-input med samme verdi som par_mens. Hvis ingen verdi
    // finnes (eldre form-payload), fall tilbake til par_mens slik at
    // INSERT-en alltid får tre tall.
    const parLadiesRaw = formData.get(`hole_${i}_par_ladies`);
    const parLadies = parLadiesRaw === null ? parMens : Number(parLadiesRaw);
    const parJuniorsRaw = formData.get(`hole_${i}_par_juniors`);
    const parJuniors = parJuniorsRaw === null ? parMens : Number(parJuniorsRaw);
    const si = Number(formData.get(`hole_${i}_si`));

    for (const par of [parMens, parLadies, parJuniors]) {
      if (!isValidPar(par)) {
        fail('bad_par');
      }
    }
    if (!isValidStrokeIndex(si)) {
      fail('bad_si');
    }
    holes.push({
      hole_number: i,
      par_mens: parMens,
      par_ladies: parLadies,
      par_juniors: parJuniors,
      stroke_index: si,
    });
  }

  // SIs must be a permutation of 1..18 — the schema enforces uniqueness per
  // course but we'd rather show a friendly error than surface a DB constraint.
  if (!allStrokeIndicesUnique(holes.map((h) => h.stroke_index))) {
    fail('si_duplicate');
  }

  // par_total per kjønn deriveres fra hullene per kjønn — auto-sync med
  // course_holes-radene som blir insertet. Når et kjønn ikke har avvik
  // matcher dette tallet par_total_mens, så ingen migrasjons-impact.
  const parSumMens = holes.reduce((s, h) => s + h.par_mens, 0);
  const parSumLadies = holes.reduce((s, h) => s + h.par_ladies, 0);
  const parSumJuniors = holes.reduce((s, h) => s + h.par_juniors, 0);

  // Parse tee boxes. Rows with an empty name are skipped — the form sends up
  // to maxTeeBoxes slots but only the populated ones count.
  const teeBoxes: ParsedTeeBox[] = [];
  for (let i = 0; i < maxTeeBoxes; i++) {
    const teeName = String(formData.get(`tee_${i}_name`) ?? '').trim();
    if (!teeName) continue;

    // length_meters is optional. Empty / non-integer / out of range → NULL.
    // The DB has a CHECK between 1000 and 12000; parseLengthMeters mirrors it.
    const lengthMeters = parseLengthMeters(
      String(formData.get(`tee_${i}_length_meters`) ?? ''),
    );

    const ratingFor = (g: 'mens' | 'ladies' | 'juniors') =>
      parseGenderRating(
        String(formData.get(`tee_${i}_slope_${g}`) ?? ''),
        String(formData.get(`tee_${i}_cr_${g}`) ?? ''),
      );
    // Per-gender rating: slope + CR må enten begge være satt eller begge tomme.
    for (const g of ['mens', 'ladies', 'juniors'] as const) {
      if (
        isPartiallyFilledRating(
          String(formData.get(`tee_${i}_slope_${g}`) ?? ''),
          String(formData.get(`tee_${i}_cr_${g}`) ?? ''),
        )
      ) {
        fail('tee_partial_rating');
      }
    }

    const mensRating = ratingFor('mens');
    const ladiesRating = ratingFor('ladies');
    const juniorsRating = ratingFor('juniors');

    if (
      !isCompleteRating(mensRating) &&
      !isCompleteRating(ladiesRating) &&
      !isCompleteRating(juniorsRating)
    ) {
      fail('tee_no_rating');
    }

    const teeId = String(formData.get(`tee_${i}_id`) ?? '') || null;
    teeBoxes.push({
      id: teeId,
      name: teeName,
      length_meters: lengthMeters,
      slope_mens: mensRating.slope,
      course_rating_mens: mensRating.course_rating,
      par_total_mens: isCompleteRating(mensRating) ? parSumMens : null,
      slope_ladies: ladiesRating.slope,
      course_rating_ladies: ladiesRating.course_rating,
      par_total_ladies: isCompleteRating(ladiesRating) ? parSumLadies : null,
      slope_juniors: juniorsRating.slope,
      course_rating_juniors: juniorsRating.course_rating,
      par_total_juniors: isCompleteRating(juniorsRating) ? parSumJuniors : null,
    });
  }
  if (teeBoxes.length === 0) {
    fail('tee_required');
  }

  return { name, holes, teeBoxes };
}

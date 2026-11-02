// native/app/src/lib/courseDraft.ts
// #2757: banen arrangøren taster i appen, som tekst, til den er lagret.
//
// **Reglene er delt kode, ingen er speilet.** `courseDraftToFormData` setter
// nøyaktig feltene nettets `CourseForm` sender, og `parseCourseDraft` gir dem til
// den samme `parseCourseHolesAndTees` som serveraksjonen `createCourse` kaller.
// Skjermen spør samme parser om utkastet kan lagres (`courseDraftProblem`), så
// Lagre-knappen og lagringen kan ikke være uenige.
//
// **Det parseren svelger, stopper vi her.** Slope, CR og lengde utenfor grensene
// blir `null` i parseren, uten feil. På nettet stopper `min`/`max` på feltet dem
// før skjemaet sendes, men i appen finnes ingen slik sperre, så et tastet tall
// ville forsvunnet uten et ord. `outOfRange` spør de samme delte funksjonene
// (`parseGenderRating`, `parseLengthMeters`), så grensene har ett hjem:
// `TEE_BOUNDS`.
import { MAX_TEE_BOXES } from '../../../../lib/courses/constants';
import { nextPar } from '../../../../lib/courses/courseCard';
import {
  findStrokeIndexGaps,
  parseGenderRating,
  parseLengthMeters,
  teeRatingProblem,
} from '../../../../lib/courses/coursePayload';
import { splitSingleIndices } from '../../../../lib/courses/nineHoles';
import {
  parseCourseHolesAndTees,
  type ParsedCourseForm,
} from '../../../../lib/courses/parseCourseForm';
import { toggleColorTee, type TeeBoxData } from '../../../../lib/courses/teeChips';
import type { TeeColor } from '../../../../lib/courses/teeColors';
import { WizardFormData, asSharedFormData } from './wizardFormData';

export type HoleDraft = { par: string; index: string };

/** Felt som tekst, som på nettet. `length_meters` er valgfri (eierens svar 01.11). */
export type TeeDraft = TeeBoxData;

export type CourseDraft = {
  name: string;
  holeCount: 18 | 9;
  /** 18 hull, eller 9 når banen spilles to ganger. */
  holes: HoleDraft[];
  /** Indeksene i andre runde, i hullrekkefølge. Bare på 9 hull. */
  secondRound: string[];
  tees: TeeDraft[];
};

/** Nettets startverdi: par 4 på alle hull, ingen indeks, ingen tee. */
const DEFAULT_HOLE: HoleDraft = { par: '4', index: '' };

export function emptyCourseDraft(name = ''): CourseDraft {
  return {
    name,
    holeCount: 18,
    holes: Array.from({ length: 18 }, () => ({ ...DEFAULT_HOLE })),
    secondRound: [],
    tees: [],
  };
}

/**
 * 18 → 9 beholder hull 1–9 og gjør indeksene på 10–18 til andre runde. 9 → 18
 * lar tallene stå, nå på hvert sitt hull, med par fra 1–9. Samme bytte som
 * `changeHoleCount` på nettet, så et feiltrykk ikke kaster det som er tastet.
 */
export function setHoleCount(draft: CourseDraft, holeCount: 18 | 9): CourseDraft {
  if (holeCount === draft.holeCount) return draft;
  if (holeCount === 9) {
    return {
      ...draft,
      holeCount,
      holes: draft.holes.slice(0, 9),
      secondRound: draft.holes.slice(9).map((hole) => hole.index),
    };
  }
  return {
    ...draft,
    holeCount,
    holes: [
      ...draft.holes,
      ...draft.holes.map((hole, i) => ({ par: hole.par, index: draft.secondRound[i] ?? '' })),
    ],
    secondRound: [],
  };
}

/** Et trykk på par-cellen. */
export function setHolePar(draft: CourseDraft, hole: number): CourseDraft {
  return {
    ...draft,
    holes: draft.holes.map((h, i) => (i === hole ? { ...h, par: nextParValue(h.par) } : h)),
  };
}

export function setHoleIndex(draft: CourseDraft, hole: number, index: string): CourseDraft {
  return {
    ...draft,
    holes: draft.holes.map((h, i) => (i === hole ? { ...h, index } : h)),
  };
}

export function setSecondRoundIndex(draft: CourseDraft, hole: number, index: string): CourseDraft {
  return {
    ...draft,
    secondRound: draft.secondRound.map((value, i) => (i === hole ? index : value)),
  };
}

/** «Fordel»: én indeks per hull på kortet blir oddetall første runde og partall andre. */
export function splitNineIndices(draft: CourseDraft): CourseDraft {
  const { round1, round2 } = splitSingleIndices(draft.holes.map((h) => Number(h.index.trim())));
  return {
    ...draft,
    holes: draft.holes.map((h, i) => ({ ...h, index: String(round1[i]) })),
    secondRound: round2.map(String),
  };
}

/** Et trykk på en fargebrikke. Maks antall og navn bor i `teeChips`, som på nettet. */
export function addTeeChip(tees: TeeDraft[], color: TeeColor): TeeDraft[] {
  return toggleColorTee({ rows: tees, removed: [] }, color).rows;
}

/**
 * 3 → 4 → 5 → 6 → 3. Delt `nextPar` tar 3 → 4 → 5 og 6 → 3. Nettets kort stopper
 * på 5 (#2278), men regelen er 3–6 (`isValidPar`), og i appen er dette eneste
 * veien til en par 6.
 */
export function nextParValue(par: string): string {
  return par === '5' ? '6' : String(nextPar(par));
}

/**
 * Skal fokus flytte seg etter denne endringen? Ingen indeks starter på 2–9 og har
 * to siffer, så de er ferdige med én gang. Etter 1 kan det komme et siffer til.
 * En sletting (`next` er starten av det som sto) flytter aldri fokus.
 */
export function indexAdvances(previous: string, next: string): boolean {
  if (next === previous || previous.startsWith(next)) return false;
  return next.length >= 2 || /^[2-9]$/.test(next);
}

/** Komma er det telefonen gir på norsk; parseren leser `Number()`. */
const toDecimal = (value: string) => value.trim().replace(',', '.');

const GENDERS = ['mens', 'ladies', 'juniors'] as const;

/** Nøyaktig nettets feltnavn (`CourseForm`, `HoleGridEditor`, `TeeTableEditor`). */
export function courseDraftToFormData(draft: CourseDraft): WizardFormData {
  const form = new WizardFormData();
  form.set('name', draft.name);
  form.set('hole_count', draft.holeCount);
  draft.holes.forEach((hole, i) => {
    form.set(`hole_${i + 1}_par_mens`, hole.par);
    form.set(`hole_${i + 1}_si`, hole.index);
  });
  if (draft.holeCount === 9) {
    draft.secondRound.forEach((index, i) => form.set(`hole_${i + 1}_si2`, index));
  }
  draft.tees.forEach((tee, i) => {
    form.set(`tee_${i}_name`, tee.name);
    form.set(`tee_${i}_color`, tee.color);
    form.set(`tee_${i}_length_meters`, tee.length_meters);
    for (const gender of GENDERS) {
      form.set(`tee_${i}_slope_${gender}`, tee[`slope_${gender}`]);
      form.set(`tee_${i}_cr_${gender}`, toDecimal(tee[`course_rating_${gender}`]));
    }
  });
  return form;
}

/** Parserens feilkode (`parseCourseHolesAndTees` sin `fail`). */
export class CourseDraftError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CourseDraftError';
  }
}

/** Utkastet gjennom nettets parser. @throws {CourseDraftError} */
export function parseCourseDraft(draft: CourseDraft): ParsedCourseForm {
  return parseCourseHolesAndTees(asSharedFormData(courseDraftToFormData(draft)), MAX_TEE_BOXES, (code) => {
    throw new CourseDraftError(code);
  });
}

/** De 18 indeksene serveren ser: på 9 hull er andre runde hull 10–18. */
export function indexValues(draft: CourseDraft): string[] {
  const front = draft.holes.map((hole) => hole.index);
  return draft.holeCount === 9 ? [...front, ...draft.secondRound] : front;
}

export type CourseDraftProblem =
  | { code: 'name_required' }
  | { code: 'bad_par' }
  /** Et tastet tall utenfor 1–18, med hullene det står på. */
  | { code: 'si_invalid'; holes: number[] }
  | { code: 'si_duplicate'; numbers: number[] }
  | { code: 'si_missing'; count: number }
  | { code: 'tee_required' }
  | { code: 'tee_partial_rating'; name: string }
  | { code: 'tee_no_rating'; name: string }
  | { code: 'tee_out_of_range'; name: string; field: 'slope' | 'cr' | 'length' };

/** Linja på nettet (`SaveStatus`): ugyldige tall, så doble, så antallet som mangler. */
function indexProblem(draft: CourseDraft): CourseDraftProblem {
  const { missing, duplicates, invalid } = findStrokeIndexGaps(indexValues(draft));
  if (invalid.length > 0) {
    const holes = draft.holeCount === 9 ? invalid.map((n) => (n > 9 ? n - 9 : n)) : invalid;
    return { code: 'si_invalid', holes: [...new Set(holes)].sort((a, b) => a - b) };
  }
  if (duplicates.length > 0) return { code: 'si_duplicate', numbers: duplicates };
  return { code: 'si_missing', count: missing.length };
}

/** Det første tallet parseren ville gjort om til `null` uten å si fra. */
function outOfRange(tees: TeeDraft[]): CourseDraftProblem | null {
  for (const tee of tees) {
    for (const gender of GENDERS) {
      const slope = tee[`slope_${gender}`];
      const cr = toDecimal(tee[`course_rating_${gender}`]);
      if (slope.trim() !== '' && parseGenderRating(slope, '').slope === null) {
        return { code: 'tee_out_of_range', name: tee.name, field: 'slope' };
      }
      if (cr !== '' && parseGenderRating('', cr).course_rating === null) {
        return { code: 'tee_out_of_range', name: tee.name, field: 'cr' };
      }
    }
    if (tee.length_meters.trim() !== '' && parseLengthMeters(tee.length_meters) === null) {
      return { code: 'tee_out_of_range', name: tee.name, field: 'length' };
    }
  }
  return null;
}

/** Den første teen med et ufullstendig sett, med navnet (parseren gir bare koden). */
function teeProblem(tees: TeeDraft[]): CourseDraftProblem | null {
  for (const tee of tees) {
    const problem = teeRatingProblem(
      GENDERS.map((gender) => ({
        slope: tee[`slope_${gender}`],
        cr: toDecimal(tee[`course_rating_${gender}`]),
      })),
    );
    if (problem === 'partial') return { code: 'tee_partial_rating', name: tee.name };
    if (problem === 'missing') return { code: 'tee_no_rating', name: tee.name };
  }
  return null;
}

/**
 * Hva som stopper «Lagre bane», eller `null` når utkastet kan lagres. Parseren
 * avgjør; funksjonene under gir bare navnet og tallene til setningen.
 */
export function courseDraftProblem(draft: CourseDraft): CourseDraftProblem | null {
  try {
    parseCourseDraft(draft);
  } catch (error) {
    if (!(error instanceof CourseDraftError)) throw error;
    switch (error.code) {
      case 'name_required':
      case 'tee_required':
      case 'bad_par':
        return { code: error.code };
      case 'bad_si':
      case 'si_duplicate':
        return indexProblem(draft);
      case 'tee_partial_rating':
        return teeProblem(draft.tees);
      case 'tee_no_rating':
        return outOfRange(draft.tees) ?? teeProblem(draft.tees);
      default:
        throw error;
    }
  }
  return outOfRange(draft.tees);
}

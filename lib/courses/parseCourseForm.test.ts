import { describe, it, expect } from 'vitest';
import { parseCourseHolesAndTees } from './parseCourseForm';
import { findStrokeIndexGaps, teeRatingProblem } from './coursePayload';
import {
  REAL_SI_STRINGS as REAL_SI,
  EMPTY_RATING as EMPTY,
  buildCourseFormData as buildFormData,
  type RatingInput as Rating,
} from './__fixtures__/courseForm';

/** Returns the failure code, or null when the form parses. */
function parseError(fd: FormData): string | null {
  const fail = (code: string): never => {
    throw new Error(code);
  };
  try {
    parseCourseHolesAndTees(fd, 6, fail);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

describe('parseCourseHolesAndTees — server rule is unchanged (#2279)', () => {
  it('accepts a full valid form', () => {
    expect(parseError(buildFormData())).toBeNull();
  });

  it('rejects an empty stroke index with bad_si', () => {
    const si = REAL_SI.map((v, i) => (i === 4 ? '' : v));
    expect(parseError(buildFormData(si))).toBe('bad_si');
  });
});

// Felle 4: the client gate (CourseForm) and the server parser must agree on
// what is saveable. Each helper's verdict must match the parser's.
describe('client helpers agree with the server parser (#2279)', () => {
  const SI_CODES = ['bad_si', 'si_duplicate'];
  it.each<[string, string[]]>([
    ['valid', REAL_SI],
    ['one empty', REAL_SI.map((v, i) => (i === 0 ? '' : v))],
    ['duplicate', REAL_SI.map((v) => (v === '14' ? '7' : v))],
    ['19', REAL_SI.map((v) => (v === '18' ? '19' : v))],
    ['ascending 1..18', Array.from({ length: 18 }, (_, i) => String(i + 1))],
  ])('stroke indices: %s', (_label, si) => {
    const clientOk = findStrokeIndexGaps(si).missing.length === 0;
    const serverOk = !SI_CODES.includes(parseError(buildFormData(si)) ?? '');
    expect(clientOk).toBe(serverOk);
  });

  const TEE_CODES = ['tee_partial_rating', 'tee_no_rating'];
  it.each<[string, Rating[]]>([
    ['empty', [EMPTY, EMPTY, EMPTY]],
    ['partial', [{ slope: '120', cr: '' }, EMPTY, EMPTY]],
    ['full set', [{ slope: '120', cr: '70.1' }, EMPTY, EMPTY]],
    ['ladies only', [EMPTY, { slope: '125', cr: '72.4' }, EMPTY]],
    ['out of range', [{ slope: '200', cr: '70' }, EMPTY, EMPTY]],
  ])('tee ratings: %s', (_label, ratings) => {
    const clientOk = teeRatingProblem(ratings) === null;
    const serverOk = !TEE_CODES.includes(parseError(buildFormData(REAL_SI, ratings)) ?? '');
    expect(clientOk).toBe(serverOk);
  });
});

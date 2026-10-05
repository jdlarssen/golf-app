import { describe, it, expect } from 'vitest';
import { parseCourseHolesAndTees } from './parseCourseForm';
import { findStrokeIndexGaps, teeRatingProblem } from './coursePayload';

const REAL_SI = ['7', '15', '3', '11', '1', '17', '5', '13', '9', '8', '16', '4', '12', '2', '18', '6', '14', '10'];

type Rating = { slope: string; cr: string };
const EMPTY: Rating = { slope: '', cr: '' };
const GENDERS = ['mens', 'ladies', 'juniors'] as const;

function buildFormData(
  si: string[] = REAL_SI,
  ratings: Rating[] = [{ slope: '120', cr: '70.1' }, EMPTY, EMPTY],
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

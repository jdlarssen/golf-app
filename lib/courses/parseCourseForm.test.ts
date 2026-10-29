import { describe, it, expect } from 'vitest';
import { parseCourseHolesAndTees } from './parseCourseForm';
import { findStrokeIndexGaps, teeRatingProblem } from './coursePayload';
import {
  REAL_SI_STRINGS as REAL_SI,
  EMPTY_RATING as EMPTY,
  buildCourseFormData as buildFormData,
  buildNineHoleFormData,
  NINE_ROUND1,
  NINE_ROUND2,
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

/** The parsed tees, or the failure code thrown. */
function parseTees(fd: FormData) {
  return parseCourseHolesAndTees(fd, 6, (code: string): never => {
    throw new Error(code);
  }).teeBoxes;
}

describe('parseCourseHolesAndTees — the tee colour (#2486)', () => {
  it.each<[string, string | null, string | null]>([
    ['a palette key', 'yellow', 'yellow'],
    ['outside the palette', 'purple', null],
    ['no field', null, null],
  ])('%s', (_label, raw, expected) => {
    const fd = buildFormData();
    if (raw !== null) fd.set('tee_0_color', raw);
    expect(parseTees(fd)[0].color).toBe(expected);
  });
});

describe('parseCourseHolesAndTees — server rule is unchanged (#2279)', () => {
  it('accepts a full valid form', () => {
    expect(parseError(buildFormData())).toBeNull();
  });

  it('rejects an empty stroke index with bad_si', () => {
    const si = REAL_SI.map((v, i) => (i === 4 ? '' : v));
    expect(parseError(buildFormData(si))).toBe('bad_si');
  });
});

function parse(fd: FormData) {
  return parseCourseHolesAndTees(fd, 6, (code: string): never => {
    throw new Error(code);
  });
}

describe('parseCourseHolesAndTees — 9-hole course played twice (#2484)', () => {
  it('expands nine holes and two index rows to 18 holes', () => {
    const { holes, nineHoles, teeBoxes } = parse(buildNineHoleFormData());
    expect(nineHoles).toBe(true);
    expect(holes).toHaveLength(18);
    for (let i = 0; i < 9; i++) {
      expect(holes[i].hole_number).toBe(i + 1);
      expect(holes[i].stroke_index).toBe(Number(NINE_ROUND1[i]));
      expect(holes[i + 9].hole_number).toBe(i + 10);
      expect(holes[i + 9].stroke_index).toBe(Number(NINE_ROUND2[i]));
      expect(holes[i + 9].par_mens).toBe(holes[i].par_mens);
      expect(holes[i + 9].par_ladies).toBe(holes[i].par_ladies);
      expect(holes[i + 9].par_juniors).toBe(holes[i].par_juniors);
    }
    // Hole 12 is hole 3 again: the ladies' par 6 and the round 2 index.
    expect(holes[11]).toMatchObject({ hole_number: 12, par_mens: 5, par_ladies: 6, stroke_index: 18 });
    // The tee's par total is the 18-hole one: twice the nine.
    expect(teeBoxes[0].par_total_mens).toBe(72);
    expect(teeBoxes[0].par_total_ladies).toBeNull();
  });

  it('ignores holes 10–18 fields a forged 9-hole payload carries', () => {
    const fd = buildNineHoleFormData();
    fd.set('hole_12_par_mens', '3');
    fd.set('hole_12_si', '1');
    const { holes } = parse(fd);
    expect(holes[11]).toMatchObject({ par_mens: 5, stroke_index: 18 });
  });

  it('rejects a number that stands in both rows with si_duplicate', () => {
    const round2 = NINE_ROUND2.map((v, i) => (i === 0 ? NINE_ROUND1[0] : v));
    expect(parseError(buildNineHoleFormData(NINE_ROUND1, round2))).toBe('si_duplicate');
  });

  it('rejects an empty second row with bad_si', () => {
    expect(parseError(buildNineHoleFormData(NINE_ROUND1, Array(9).fill('')))).toBe('bad_si');
  });

  it('rejects a second row index outside 1–18 with bad_si', () => {
    const round2 = NINE_ROUND2.map((v, i) => (i === 2 ? '19' : v));
    expect(parseError(buildNineHoleFormData(NINE_ROUND1, round2))).toBe('bad_si');
  });

  it('reads 18 holes when hole_count is missing, as before', () => {
    const { holes, nineHoles } = parse(buildFormData());
    expect(nineHoles).toBe(false);
    expect(holes).toHaveLength(18);
  });

  it('reads 18 holes for hole_count=18', () => {
    const fd = buildFormData();
    fd.set('hole_count', '18');
    expect(parse(fd).nineHoles).toBe(false);
  });

  it.each(['', '10', 'nine', '27'])('rejects hole_count=%j with bad_hole_count', (value) => {
    const fd = buildFormData();
    fd.set('hole_count', value);
    expect(parseError(fd)).toBe('bad_hole_count');
  });

  // Felle 4: the form feeds findStrokeIndexGaps the two rows as 18 values.
  it.each<[string, string[], string[]]>([
    ['valid', NINE_ROUND1, NINE_ROUND2],
    ['same number in both rows', NINE_ROUND1, NINE_ROUND2.map((v, i) => (i === 0 ? '7' : v))],
    ['empty round 2', NINE_ROUND1, Array(9).fill('')],
    ['19 in round 2', NINE_ROUND1, NINE_ROUND2.map((v) => (v === '18' ? '19' : v))],
  ])('the client rule agrees with the server: %s', (_label, round1, round2) => {
    const clientOk = findStrokeIndexGaps([...round1, ...round2]).missing.length === 0;
    const serverOk = !['bad_si', 'si_duplicate'].includes(
      parseError(buildNineHoleFormData(round1, round2)) ?? '',
    );
    expect(clientOk).toBe(serverOk);
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

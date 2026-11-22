/**
 * Trap #4 agreement test (AGENTS.md): the par total has one rule, and the
 * course form's parser, the shared bounds and the tee_boxes par_total_* CHECKs
 * must say the same (audit 2026-11-20). The CHECKs said 60–80 until now, so a
 * par-3 course (18 × par 3 = 54) passed the parser and the DB refused it with
 * a generic error.
 *
 * The test reads the NEWEST migration that defines each constraint, so a later
 * migration that moves the CHECK without moving PAR_TOTAL_BOUNDS fails here.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { PAR_TOTAL_BOUNDS, isValidParTotal } from './coursePayload';
import { parseCourseHolesAndTees } from './parseCourseForm';
import { buildCourseFormData } from './__fixtures__/courseForm';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

/** Bounds of a CHECK in the newest migration that names it. */
function newestCheckBounds(constraintName: string): { min: number; max: number; file: string } {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse();
  // e.g. «constraint tee_boxes_par_total_mens_check check (par_total_mens between 54 and 108)»
  const re = new RegExp(
    `${constraintName}\\s+check\\s*\\(\\s*\\w+\\s+between\\s+(\\d+)\\s+and\\s+(\\d+)\\s*\\)`,
    'i',
  );
  for (const file of files) {
    const m = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8').match(re);
    if (m) return { min: Number(m[1]), max: Number(m[2]), file };
  }
  throw new Error(`No migration defines ${constraintName} as «check (col between a and b)»`);
}

/** One 18-hole course with the same par on every hole. */
function parseAllPar(par: string) {
  const fd = buildCourseFormData();
  for (let i = 1; i <= 18; i++) fd.set(`hole_${i}_par_mens`, par);
  return parseCourseHolesAndTees(fd, 6, (code: string): never => {
    throw new Error(code);
  });
}

describe('par total: one rule in parser and DB (trap #4)', () => {
  it('is 18 holes of par 3–6: 54–108', () => {
    expect(PAR_TOTAL_BOUNDS).toEqual({ min: 54, max: 108 });
  });

  it.each(['mens', 'ladies', 'juniors'])(
    'the newest tee_boxes_par_total_%s_check matches PAR_TOTAL_BOUNDS',
    (gender) => {
      const { min, max } = newestCheckBounds(`tee_boxes_par_total_${gender}_check`);
      expect({ min, max }).toEqual(PAR_TOTAL_BOUNDS);
    },
  );

  it('a par-3 course parses with par total 54', () => {
    const { teeBoxes } = parseAllPar('3');
    expect(teeBoxes[0].par_total_mens).toBe(54);
    expect(isValidParTotal(54)).toBe(true);
  });

  it('18 par-6 holes parse with par total 108, the upper bound', () => {
    expect(parseAllPar('6').teeBoxes[0].par_total_mens).toBe(108);
  });

  it('isValidParTotal refuses just outside and non-integers', () => {
    expect(isValidParTotal(53)).toBe(false);
    expect(isValidParTotal(109)).toBe(false);
    expect(isValidParTotal(72.5)).toBe(false);
  });
});

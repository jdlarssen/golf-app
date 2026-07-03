/**
 * Trap #4 agreement test (AGENTS.md): validator ↔ DB CHECK must stay in sync.
 *
 * tee_boxes.slope_{mens,ladies,juniors} and course_rating_{mens,ladies,juniors}
 * are constrained by CHECK in 0132_relax_tee_box_rating_bounds.sql:
 *   - slope         55–165
 *   - course_rating 50–90
 *
 * The same bounds live in lib/courses/coursePayload.ts as SLOPE_MIN/MAX +
 * CR_MIN/MAX. These are sanity bounds against typos, not WHS-conformance gates
 * (the WHS slope ceiling is 155, but some courses publish older ratings just
 * above, e.g. Miklagard 157; course rating has no WHS upper cap at all).
 *
 * This test asserts the bounds in the migration SQL match what the validator
 * enforces, so a future change to one without the other fails loudly.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { parseGenderRating } from './coursePayload';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../supabase/migrations/0132_relax_tee_box_rating_bounds.sql',
);

/** Extract the lower and upper bound from a CHECK constraint line in the migration. */
function extractCheckBounds(constraintName: string): { min: number; max: number } {
  const content = fs.readFileSync(MIGRATION_FILE, 'utf-8');
  // Matches e.g.:
  //   tee_boxes_slope_mens_check
  //     check (slope_mens is null or (slope_mens >= 55 and slope_mens <= 165))
  const re = new RegExp(
    `${constraintName}\\s+check\\s*\\([^)]*>=\\s*(\\d+(?:\\.\\d+)?)\\s+and[^)]*<=\\s*(\\d+(?:\\.\\d+)?)`,
    'i',
  );
  const m = content.match(re);
  if (!m) throw new Error(`Could not parse bounds for ${constraintName} in 0132`);
  return { min: Number(m[1]), max: Number(m[2]) };
}

describe('tee_boxes course_rating DB CHECK ↔ validator agreement (trap #4)', () => {
  it('DB lower bound matches validator: CR_MIN accepted, CR_MIN-0.1 rejected', () => {
    const { min } = extractCheckBounds('tee_boxes_course_rating_mens_check');
    expect(parseGenderRating('113', String(min)).course_rating).toBe(min);
    expect(parseGenderRating('113', String(min - 0.1)).course_rating).toBeNull();
  });

  it('DB upper bound matches validator: CR_MAX accepted, CR_MAX+0.1 rejected', () => {
    const { max } = extractCheckBounds('tee_boxes_course_rating_mens_check');
    expect(parseGenderRating('113', String(max)).course_rating).toBe(max);
    expect(parseGenderRating('113', String(max + 0.1)).course_rating).toBeNull();
  });

  it('accepts the real Miklagard ladies course rating (81.9)', () => {
    expect(parseGenderRating('113', '81.9').course_rating).toBe(81.9);
  });

  it('all three gender constraints share the same bounds', () => {
    const mens = extractCheckBounds('tee_boxes_course_rating_mens_check');
    expect(extractCheckBounds('tee_boxes_course_rating_ladies_check')).toEqual(mens);
    expect(extractCheckBounds('tee_boxes_course_rating_juniors_check')).toEqual(mens);
  });

  it('DB CHECK bounds are 50 and 90 (typo sanity range, not a WHS cap)', () => {
    const bounds = extractCheckBounds('tee_boxes_course_rating_mens_check');
    expect(bounds.min).toBe(50);
    expect(bounds.max).toBe(90);
  });
});

describe('tee_boxes slope DB CHECK ↔ validator agreement (trap #4)', () => {
  it('DB lower bound matches validator: SLOPE_MIN accepted, SLOPE_MIN-1 rejected', () => {
    const { min } = extractCheckBounds('tee_boxes_slope_mens_check');
    expect(parseGenderRating(String(min), '70').slope).toBe(min);
    expect(parseGenderRating(String(min - 1), '70').slope).toBeNull();
  });

  it('DB upper bound matches validator: SLOPE_MAX accepted, SLOPE_MAX+1 rejected', () => {
    const { max } = extractCheckBounds('tee_boxes_slope_mens_check');
    expect(parseGenderRating(String(max), '70').slope).toBe(max);
    expect(parseGenderRating(String(max + 1), '70').slope).toBeNull();
  });

  it('accepts the real Miklagard ladies slope (157)', () => {
    expect(parseGenderRating('157', '70').slope).toBe(157);
  });

  it('all three gender constraints share the same bounds', () => {
    const mens = extractCheckBounds('tee_boxes_slope_mens_check');
    expect(extractCheckBounds('tee_boxes_slope_ladies_check')).toEqual(mens);
    expect(extractCheckBounds('tee_boxes_slope_juniors_check')).toEqual(mens);
  });

  it('DB CHECK bounds are 55 and 165 (WHS 55–155 plus headroom for un-capped ratings)', () => {
    const bounds = extractCheckBounds('tee_boxes_slope_mens_check');
    expect(bounds.min).toBe(55);
    expect(bounds.max).toBe(165);
  });
});

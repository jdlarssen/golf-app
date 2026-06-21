/**
 * Trap #4 agreement test (AGENTS.md): validator ↔ DB CHECK must stay in sync.
 *
 * tee_boxes.course_rating_{mens,ladies,juniors} is constrained by CHECK in
 * 0112_tee_boxes_course_rating_check.sql (bounds: 50–80).
 *
 * The same bounds live in lib/courses/coursePayload.ts as CR_MIN=50/CR_MAX=80.
 *
 * This test asserts that the bounds in the migration SQL match what the
 * validator enforces, so a future change to one without the other fails loudly.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Re-export the bounds via a round-trip through the validator to get the
// actual values the module uses (rather than hard-coding them here).
// coursePayload.ts uses module-level consts — we extract them by running
// boundary values through parseGenderRating.
import { parseGenderRating } from './coursePayload';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../supabase/migrations/0112_tee_boxes_course_rating_check.sql',
);

/** Extract the lower and upper bound from a CHECK constraint line in the migration. */
function extractCheckBounds(constraintName: string): { min: number; max: number } {
  const content = fs.readFileSync(MIGRATION_FILE, 'utf-8');
  // Matches: check (course_rating_mens is null or (course_rating_mens >= 50 and course_rating_mens <= 80))
  const re = new RegExp(
    `${constraintName}\\s+check\\s*\\([^)]*>=\\s*(\\d+(?:\\.\\d+)?)\\s+and[^)]*<=\\s*(\\d+(?:\\.\\d+)?)`,
    'i',
  );
  const m = content.match(re);
  if (!m) throw new Error(`Could not parse bounds for ${constraintName} in 0112`);
  return { min: Number(m[1]), max: Number(m[2]) };
}

describe('tee_boxes course_rating DB CHECK ↔ coursePayload validator agreement (trap #4)', () => {
  it('DB CHECK lower bound (50) matches validator: CR_MIN is accepted, CR_MIN-0.1 is rejected', () => {
    const bounds = extractCheckBounds('tee_boxes_course_rating_mens_check');

    // Validator accepts the DB lower bound
    const atMin = parseGenderRating('113', String(bounds.min));
    expect(atMin.course_rating, `Expected CR=${bounds.min} to be accepted by validator`).toBe(
      bounds.min,
    );

    // Validator rejects one step below the DB lower bound
    const belowMin = parseGenderRating('113', String(bounds.min - 0.1));
    expect(belowMin.course_rating, `Expected CR=${bounds.min - 0.1} to be rejected by validator`).toBeNull();
  });

  it('DB CHECK upper bound (80) matches validator: CR_MAX is accepted, CR_MAX+0.1 is rejected', () => {
    const bounds = extractCheckBounds('tee_boxes_course_rating_mens_check');

    // Validator accepts the DB upper bound
    const atMax = parseGenderRating('113', String(bounds.max));
    expect(atMax.course_rating, `Expected CR=${bounds.max} to be accepted by validator`).toBe(
      bounds.max,
    );

    // Validator rejects one step above the DB upper bound
    const aboveMax = parseGenderRating('113', String(bounds.max + 0.1));
    expect(aboveMax.course_rating, `Expected CR=${bounds.max + 0.1} to be rejected by validator`).toBeNull();
  });

  it('all three gender constraints share the same bounds', () => {
    const mens = extractCheckBounds('tee_boxes_course_rating_mens_check');
    const ladies = extractCheckBounds('tee_boxes_course_rating_ladies_check');
    const juniors = extractCheckBounds('tee_boxes_course_rating_juniors_check');

    expect(ladies).toEqual(mens);
    expect(juniors).toEqual(mens);
  });

  it('DB CHECK bounds are 50 and 80 (canonical WHS course rating range)', () => {
    const bounds = extractCheckBounds('tee_boxes_course_rating_mens_check');
    expect(bounds.min).toBe(50);
    expect(bounds.max).toBe(80);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { START_TYPES, parseStartType } from './startType';

/**
 * Type A (#2258). The start type has two homes that must agree (trap 4): the
 * DB CHECK in 0200 and START_TYPES here. Same pattern as
 * lib/courses/teeRatingDbCheck.test.ts.
 */
describe('start type', () => {
  it('the DB CHECK lists exactly START_TYPES', () => {
    const sql = readFileSync(
      path.resolve(__dirname, '../../supabase/migrations/0200_games_start_type.sql'),
      'utf8',
    );
    const check = /check \(start_type in \(([^)]*)\)\)/.exec(sql);
    expect(check, 'CHECK games_start_type_valid').not.toBeNull();
    const values = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...START_TYPES]);
    expect(sql).toContain("default 'first_tee'");
  });

  it.each([
    ['shotgun', 'shotgun'],
    ['first_tee', 'first_tee'],
    ['', 'first_tee'],
    [null, 'first_tee'],
    ['on', 'first_tee'],
    ['SHOTGUN', 'first_tee'],
  ] as const)('parseStartType(%j) → %s', (raw, expected) => {
    expect(parseStartType(raw)).toBe(expected);
  });
});

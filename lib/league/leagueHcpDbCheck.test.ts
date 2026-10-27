/**
 * Trap #4 agreement test (AGENTS.md): the league handicap bounds (#2660) live
 * in the CHECKs of 0219_league_hcp_allowance.sql and in lib/league/types.ts,
 * which the create action's parser and the form's min/max read. This test
 * asserts the migration says what the constants say, so a change to one
 * without the other fails loudly. The parser's own accept/refuse at the bounds
 * is locked in actions.test.ts.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  LEAGUE_HCP_ALLOWANCE_MAX,
  LEAGUE_HCP_ALLOWANCE_MIN,
  LEAGUE_HCP_DEFAULTS,
  LEAGUE_HCP_MAX_STROKES_MAX,
  LEAGUE_HCP_MAX_STROKES_MIN,
} from './types';

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/0219_league_hcp_allowance.sql'),
  'utf-8',
);

/** «<name> check (… between <min> and <max>)» → the two numbers. */
function checkBounds(constraintName: string): { min: number; max: number } {
  const re = new RegExp(`${constraintName}\\s+check\\s*\\([^)]*between\\s+(\\d+)\\s+and\\s+(\\d+)\\)`, 'i');
  const m = MIGRATION.match(re);
  if (!m) throw new Error(`Could not parse bounds for ${constraintName} in 0219`);
  return { min: Number(m[1]), max: Number(m[2]) };
}

describe('league handicap DB CHECK ↔ lib/league/types.ts (trap #4, #2660)', () => {
  it('the share: leagues_hcp_allowance_pct_check', () => {
    expect(checkBounds('leagues_hcp_allowance_pct_check')).toEqual({
      min: LEAGUE_HCP_ALLOWANCE_MIN,
      max: LEAGUE_HCP_ALLOWANCE_MAX,
    });
  });

  it.each(['leagues_hcp_max_strokes_check', 'games_hcp_max_strokes_check'])('the cap: %s', (name) => {
    expect(checkBounds(name)).toEqual({
      min: LEAGUE_HCP_MAX_STROKES_MIN,
      max: LEAGUE_HCP_MAX_STROKES_MAX,
    });
  });

  it('every default lies within the bounds', () => {
    for (const { allowancePct, maxStrokes } of Object.values(LEAGUE_HCP_DEFAULTS)) {
      expect(allowancePct).toBeGreaterThanOrEqual(LEAGUE_HCP_ALLOWANCE_MIN);
      expect(allowancePct).toBeLessThanOrEqual(LEAGUE_HCP_ALLOWANCE_MAX);
      if (maxStrokes !== null) {
        expect(maxStrokes).toBeGreaterThanOrEqual(LEAGUE_HCP_MAX_STROKES_MIN);
        expect(maxStrokes).toBeLessThanOrEqual(LEAGUE_HCP_MAX_STROKES_MAX);
      }
    }
  });
});

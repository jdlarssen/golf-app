/**
 * Trap #4 agreement test (AGENTS.md): Bingo Bango Bongo is one flight. The
 * ceiling lives in START_COUNT_RANGES (the wizard, the publish validator, the
 * signup cap, the start guard and the app read it) and in the database function
 * bbb_max_players() (0249), which the roster and start triggers read. A change
 * to one without the other fails here.
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { MAX_FLIGHT_SIZE } from './flightScope';
import { START_COUNT_RANGES } from './startPlayerCount';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../supabase/migrations/0249_format_choice_write_rules.sql',
);

describe('bbb_max_players() ↔ START_COUNT_RANGES.bingo_bango_bongo.max (trap #4)', () => {
  it('the database ceiling is the constant', () => {
    const content = fs.readFileSync(MIGRATION_FILE, 'utf-8');
    const m = content.match(
      /function public\.bbb_max_players\(\)[\s\S]*?as \$\$\s*select\s+(\d+)\s*\$\$/i,
    );
    expect(m, 'could not find bbb_max_players() in 0249').not.toBeNull();
    expect(Number(m![1])).toBe(START_COUNT_RANGES.bingo_bango_bongo.max);
  });

  it('the ceiling is one flight', () => {
    expect(START_COUNT_RANGES.bingo_bango_bongo.max).toBe(MAX_FLIGHT_SIZE);
  });
});

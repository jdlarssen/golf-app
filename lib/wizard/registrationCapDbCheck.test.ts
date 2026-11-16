/**
 * Trap #4 agreement test (AGENTS.md): the organiser cap's bounds live in the DB
 * CHECK `games_registration_cap_check` (0239) and in REGISTRATION_CAP_MIN/MAX,
 * which the wizard's stepper and the save validators read. A change to one
 * without the other fails here.
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { REGISTRATION_CAP_MAX, REGISTRATION_CAP_MIN } from './fitsPlayerCount';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../supabase/migrations/0239_registration_cap_deadline_waitlist.sql',
);

describe('games.registration_cap DB CHECK ↔ REGISTRATION_CAP_MIN/MAX (trap #4)', () => {
  it('the CHECK bounds are the constants', () => {
    const content = fs.readFileSync(MIGRATION_FILE, 'utf-8');
    const m = content.match(
      /games_registration_cap_check\s+check\s*\(\s*registration_cap\s+between\s+(\d+)\s+and\s+(\d+)\s*\)/i,
    );
    expect(m, 'could not find games_registration_cap_check in 0239').not.toBeNull();
    expect(Number(m![1])).toBe(REGISTRATION_CAP_MIN);
    expect(Number(m![2])).toBe(REGISTRATION_CAP_MAX);
  });
});

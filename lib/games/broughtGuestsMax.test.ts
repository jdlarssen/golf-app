import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BROUGHT_GUESTS_MAX } from './broughtGuests';

/**
 * Trap #4 agreement test (AGENTS.md): how many guests a player may bring
 * («Ta med en gjest», #2607) lives in two places — guard_brought_guest in the
 * database and BROUGHT_GUESTS_MAX, which the page and the action read. The
 * function's newest definition in supabase/migrations is what CI's migrations
 * gate applies and what staging and prod run; this test reads its limit there
 * and fails when one side changes without the other.
 */

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');

function newestGuardSource(): { file: string; body: string } {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files.reverse()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf-8');
    const start = sql.search(/create or replace function public\.guard_brought_guest\(\)/i);
    if (start === -1) continue;
    const end = sql.indexOf('$function$;', start);
    return { file, body: sql.slice(start, end) };
  }
  throw new Error('guard_brought_guest is not defined in any migration');
}

describe('guard_brought_guest ↔ BROUGHT_GUESTS_MAX (trap #4)', () => {
  it('the trigger refuses at the same count the app stops at', () => {
    const { file, body } = newestGuardSource();
    const m = body.match(/if v_live >= (\d+) then\s+raise exception 'brought_guest_limit'/);
    expect(m, `limit check not found in ${file}`).not.toBeNull();
    expect(Number(m![1])).toBe(BROUGHT_GUESTS_MAX);
  });
});

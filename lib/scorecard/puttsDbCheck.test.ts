/**
 * Trap #4 agreement test (AGENTS.md, #2222): the putts cap lives in
 * `puttEntry.ts` (read by the web chips, the backfill action and the app's
 * score rail) and in the DB CHECK on `scores.putts`. Change one without the
 * other and this goes red.
 */
import { describe, it, expect } from 'vitest';
import { lastMigrationMatch } from '@/lib/__tests__/migrationCheck';
import { MAX_PUTTS, MIN_PUTTS } from './puttEntry';

describe('scores.putts CHECK ↔ MIN_PUTTS / MAX_PUTTS (#2222)', () => {
  it('the last migration bounding putts uses the same numbers', () => {
    const { match } = lastMigrationMatch(
      /putts\s+is\s+null\s+or\s+putts\s+between\s+(\d+)\s+and\s+(\d+)/i,
    );
    expect(Number(match[1])).toBe(MIN_PUTTS);
    expect(Number(match[2])).toBe(MAX_PUTTS);
  });
});

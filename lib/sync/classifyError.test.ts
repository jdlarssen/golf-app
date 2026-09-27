import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isLockedCardError,
  isPermanentSyncError,
  syncRetryDecision,
  MAX_PERMANENT_ATTEMPTS,
  REFUSED_WRITE_ERROR,
} from './classifyError';

/** The exception text a migration raises, read from the file itself (trap 4). */
function migrationMessage(file: string, marker: RegExp): string {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations', file),
    'utf8',
  );
  const match = sql.match(marker);
  if (!match) throw new Error(`no message matching ${marker} in ${file}`);
  return match[1];
}

// 0148: the finished-game trigger. 0109 has two messages; the regex pins the
// future-clock one, not the backwards one.
const FINISHED_GAME_GUARD = migrationMessage(
  '0148_putts_backfill.sql',
  /'(On a finished game only putts may be changed[^']*)'/,
);
const FUTURE_CLOCK_GUARD = migrationMessage(
  '0109_guard_scores_client_updated_at.sql',
  /'(client_updated_at too far in the future[^']*)'/,
);

// #2211: a write refused because the card is locked (submitted / withdrawn /
// round over) is permanent and settles as a locked refusal.
describe('locked-card refusals', () => {
  it.each([
    [FINISHED_GAME_GUARD, true, true],
    ['new row violates row-level security policy for table "scores"', true, true],
    [REFUSED_WRITE_ERROR, true, true],
    // Deliberately NOT permanent: it heals once real time catches up with the
    // stamp; quarantine would turn a delay into a lost stroke.
    [FUTURE_CLOCK_GUARD, false, false],
    ['duplicate key value violates unique constraint "scores_pkey"', true, false],
  ])('%j → permanent=%s, locked=%s', (message, permanent, locked) => {
    // permanent=true also proves no transient marker matched: those win first.
    expect(isPermanentSyncError(message)).toBe(permanent);
    expect(isLockedCardError(message)).toBe(locked);
  });
});

describe('isPermanentSyncError', () => {
  it.each([
    // Network / offline — observed across browsers. NEVER permanent: these
    // resolve the moment connectivity returns, and giving up would lose a
    // genuinely-entered stroke.
    ['TypeError: Load failed', false], // Safari offline
    ['TypeError: Failed to fetch', false], // Chrome offline
    ['NetworkError when attempting to fetch resource.', false], // Firefox offline
    ['network request failed', false],
    // Auth expiry — transient: succeeds after re-login. Checked before the
    // generic 4xx patterns even though it is technically a 401.
    ['JWT expired', false],
    ['401: Unauthorized', false],
    ['Auth session missing or expired', false],
    // Rate limit — transient backoff, not permanent.
    ['rate limit exceeded (429)', false],
    ['too many requests', false],
    // Request timeout / abort — lost signal, must retry.
    ['Request timed out', false],
    ['The operation timed out', false],
    ['AbortError: The operation was aborted', false],
    // Digit-collision guard: a transient message whose number coincidentally
    // contains "400" must NOT be mistaken for an HTTP 400 (#668 invariant).
    ['Request timed out after 1400ms', false],
    ['stalled at 31400ms', false],
    // Unknown / empty — safe default is NOT permanent (rather loop than lose).
    [null, false],
    [undefined, false],
    ['', false],
    ['something weird happened', false],
    // Explicitly permanent — RLS reject, constraint, malformed payload.
    ['new row violates row-level security policy for table "scores"', true],
    ['permission denied for table scores', true],
    ['403: Forbidden', true],
    ['null value in column "strokes" violates not-null constraint', true],
    ['invalid input syntax for type integer', true],
    ['400: Bad Request', true],
    ['422: Unprocessable Entity', true],
  ])('classifies %j as permanent=%s', (input, expected) => {
    expect(isPermanentSyncError(input)).toBe(expected);
  });
});

describe('syncRetryDecision', () => {
  it('retries a permanent error while under the attempt cap', () => {
    for (let attemptCount = 0; attemptCount < MAX_PERMANENT_ATTEMPTS - 1; attemptCount++) {
      expect(
        syncRetryDecision({
          attemptCount,
          errorMessage: 'permission denied for table scores',
        }),
      ).toBe('retry');
    }
  });

  it('abandons a permanent error once the cap is reached', () => {
    // attemptCount = MAX-1 means this failure is attempt #MAX → abandon.
    expect(
      syncRetryDecision({
        attemptCount: MAX_PERMANENT_ATTEMPTS - 1,
        errorMessage: 'permission denied for table scores',
      }),
    ).toBe('abandon');
    expect(
      syncRetryDecision({
        attemptCount: MAX_PERMANENT_ATTEMPTS + 50,
        errorMessage: '403: Forbidden',
      }),
    ).toBe('abandon');
  });

  it('NEVER abandons a transient error, no matter how many attempts', () => {
    for (const errorMessage of [
      'TypeError: Load failed',
      'JWT expired',
      'rate limit exceeded (429)',
      null,
      'something weird happened',
    ]) {
      expect(
        syncRetryDecision({ attemptCount: 9999, errorMessage }),
      ).toBe('retry');
    }
  });

  it('honors a custom maxPermanentAttempts', () => {
    expect(
      syncRetryDecision({
        attemptCount: 1,
        errorMessage: 'permission denied',
        maxPermanentAttempts: 2,
      }),
    ).toBe('abandon');
  });
});

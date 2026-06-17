import { describe, it, expect } from 'vitest';
import {
  isPermanentSyncError,
  syncRetryDecision,
  MAX_PERMANENT_ATTEMPTS,
} from './classifyError';

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

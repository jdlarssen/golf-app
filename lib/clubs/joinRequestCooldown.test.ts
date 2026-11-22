import { describe, it, expect } from 'vitest';
import { JOIN_REQUEST_COOLDOWN_DAYS, joinRequestWaitUntil } from './joinRequestCooldown';

/**
 * Type A: the owner's «Etter 7 dager» (review 2026-11-20). A new club request
 * is allowed no earlier than 7 days after the previous request or membership
 * ended.
 */
describe('joinRequestWaitUntil', () => {
  const CLOSED = '2026-11-20T15:00:00.000Z';
  const ALLOWED = '2026-11-27T15:00:00.000Z';
  const OLD_REQUEST = '2026-10-01T10:00:00.000Z';

  it('the wait is 7 days', () => {
    expect(JOIN_REQUEST_COOLDOWN_DAYS).toBe(7);
  });

  it.each([
    ['just after the close', '2026-11-20T15:00:01.000Z', ALLOWED],
    ['one millisecond before 7 days', '2026-11-27T14:59:59.999Z', ALLOWED],
    ['exactly 7 days', ALLOWED, null],
    ['8 days later', '2026-11-28T15:00:00.000Z', null],
  ])('rejected, %s → %s', (_label, now, expected) => {
    const row = { status: 'rejected', decided_at: CLOSED, created_at: OLD_REQUEST };
    expect(joinRequestWaitUntil(row, new Date(now))?.toISOString() ?? null).toBe(expected);
  });

  it('a leave/removal stamp counts from decided_at, not created_at', () => {
    const row = { status: 'withdrawn', decided_at: CLOSED, created_at: OLD_REQUEST };
    expect(joinRequestWaitUntil(row, new Date('2026-11-21T00:00:00.000Z'))?.toISOString()).toBe(ALLOWED);
  });

  // The requester's own withdrawal cannot set decided_at (0107): the 7 days
  // run from the last request, so withdraw-and-ask-again cannot loop.
  it.each([
    ['inside the window', '2026-11-27T14:59:59.999Z', ALLOWED],
    ['outside the window', ALLOWED, null],
  ])('self-withdrawn without decided_at, %s → %s', (_label, now, expected) => {
    const row = { status: 'withdrawn', decided_at: null, created_at: CLOSED };
    expect(joinRequestWaitUntil(row, new Date(now))?.toISOString() ?? null).toBe(expected);
  });

  it.each([
    ['no row', null],
    ['an approved row without a stamp', { status: 'approved', decided_at: null, created_at: CLOSED }],
    ['an unreadable timestamp', { status: 'rejected', decided_at: 'not a date', created_at: CLOSED }],
  ])('%s → may ask now', (_label, row) => {
    expect(joinRequestWaitUntil(row, new Date(CLOSED))).toBeNull();
  });
});

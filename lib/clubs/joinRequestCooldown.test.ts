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

  it('the wait is 7 days', () => {
    expect(JOIN_REQUEST_COOLDOWN_DAYS).toBe(7);
  });

  it.each([
    ['just after the close', '2026-11-20T15:00:01.000Z', ALLOWED],
    ['one millisecond before 7 days', '2026-11-27T14:59:59.999Z', ALLOWED],
    ['exactly 7 days', ALLOWED, null],
    ['8 days later', '2026-11-28T15:00:00.000Z', null],
  ])('rejected, %s → %s', (_label, now, expected) => {
    expect(joinRequestWaitUntil({ decided_at: CLOSED }, new Date(now))?.toISOString() ?? null).toBe(expected);
  });

  // 0255 stamps decided_at on the requester's own withdrawal, so the rule
  // reads decided_at only; a withdrawal from before 0255 has none.
  it.each([
    ['inside the window', '2026-11-27T14:59:59.999Z', ALLOWED],
    ['outside the window', ALLOWED, null],
  ])('withdrawn (self, leave or removal), %s → %s', (_label, now, expected) => {
    expect(joinRequestWaitUntil({ decided_at: CLOSED }, new Date(now))?.toISOString() ?? null).toBe(expected);
  });

  it.each([
    ['no row', null],
    ['a row without a close time (withdrawn before 0255)', { decided_at: null }],
    ['an unreadable timestamp', { decided_at: 'not a date' }],
  ])('%s → may ask now', (_label, row) => {
    expect(joinRequestWaitUntil(row, new Date(CLOSED))).toBeNull();
  });
});

// Force a non-Oslo host TZ so the Oslo-pinning is actually exercised (the
// helper must not read the host's local calendar day). UTC is the CI default.
process.env.TZ = 'UTC';

import { describe, expect, it } from 'vitest';
import {
  INVITE_TTL_DAYS,
  inviteExpiresAtFromNow,
  inviteExpiryTier,
  isInviteExpired,
} from './inviteExpiry';

// A fixed "now": 2026-07-10 12:00Z → Oslo (summer +02) → 2026-07-10 14:00.
const NOW = Date.parse('2026-07-10T12:00:00.000Z');

describe('inviteExpiryTier (#1179)', () => {
  it('same Oslo day → today', () => {
    // Later the same Oslo calendar day.
    expect(inviteExpiryTier('2026-07-10T20:00:00.000Z', NOW)).toEqual({
      kind: 'today',
    });
  });

  it('next Oslo day → tomorrow', () => {
    expect(inviteExpiryTier('2026-07-11T09:00:00.000Z', NOW)).toEqual({
      kind: 'tomorrow',
    });
  });

  it('several days out → days with the calendar-day count', () => {
    // 2026-07-17 is 7 Oslo days after 2026-07-10.
    expect(inviteExpiryTier('2026-07-17T09:00:00.000Z', NOW)).toEqual({
      kind: 'days',
      days: 7,
    });
  });

  it('two days out → days:2 (never falls back to tomorrow)', () => {
    expect(inviteExpiryTier('2026-07-12T09:00:00.000Z', NOW)).toEqual({
      kind: 'days',
      days: 2,
    });
  });

  it('a past instant floors to today, never «om 0 dager»', () => {
    expect(inviteExpiryTier('2026-07-09T09:00:00.000Z', NOW)).toEqual({
      kind: 'today',
    });
  });

  it('is Oslo-pinned: a 23:30Z instant counts as the next Oslo day', () => {
    // 2026-07-10 23:30Z is 2026-07-11 01:30 in Oslo → tomorrow, not today,
    // even though under UTC it is still the 10th.
    expect(inviteExpiryTier('2026-07-10T23:30:00.000Z', NOW)).toEqual({
      kind: 'tomorrow',
    });
  });

  it('unparseable timestamp → null', () => {
    expect(inviteExpiryTier('not-a-date', NOW)).toBeNull();
  });
});

describe('inviteExpiresAtFromNow (#1381)', () => {
  it('stamps exactly INVITE_TTL_DAYS ahead of the given instant', () => {
    const iso = inviteExpiresAtFromNow(NOW);
    expect(Date.parse(iso) - NOW).toBe(INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  });
});

describe('isInviteExpired (#1381)', () => {
  it('a deadline in the future is not expired', () => {
    expect(isInviteExpired('2026-07-11T12:00:00.000Z', NOW)).toBe(false);
  });

  it('a passed deadline is expired', () => {
    expect(isInviteExpired('2026-07-09T12:00:00.000Z', NOW)).toBe(true);
  });

  it('the exact deadline instant counts as expired (mirrors expires_at > now())', () => {
    // The DB gate in email_is_invited treats `expires_at > now()` as open, so
    // equality must fall on the expired side or the badge would disagree with
    // what the login door does.
    expect(isInviteExpired('2026-07-10T12:00:00.000Z', NOW)).toBe(true);
  });

  it('a fresh stamp is never expired', () => {
    expect(isInviteExpired(inviteExpiresAtFromNow(NOW), NOW)).toBe(false);
  });

  it('unparseable timestamp reads as not expired (no false alarm)', () => {
    expect(isInviteExpired('not-a-date', NOW)).toBe(false);
  });
});

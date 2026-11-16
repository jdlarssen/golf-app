import { describe, expect, it } from 'vitest';
import { isSignupClosed, signupClosure } from './signupClosed';

const NOW = new Date('2026-10-02T16:00:00Z');
const HOUR = 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

describe('isSignupClosed / signupClosure (#2482)', () => {
  it('no deadline and not closed by hand → open', () => {
    const game = { signups_closed_at: null, signup_deadline: null };
    expect(isSignupClosed(game, NOW)).toBe(false);
    expect(signupClosure(game, NOW)).toBeNull();
  });

  it('deadline ahead → open', () => {
    const game = { signups_closed_at: null, signup_deadline: iso(HOUR) };
    expect(isSignupClosed(game, NOW)).toBe(false);
    expect(signupClosure(game, NOW)).toBeNull();
  });

  it('deadline passed → closed by the deadline, at the deadline', () => {
    const game = { signups_closed_at: null, signup_deadline: iso(-HOUR) };
    expect(isSignupClosed(game, NOW)).toBe(true);
    expect(signupClosure(game, NOW)).toEqual({ reason: 'deadline', at: iso(-HOUR) });
  });

  it('the deadline instant itself is closed (the database uses now() >= deadline)', () => {
    const game = { signups_closed_at: null, signup_deadline: NOW.toISOString() };
    expect(signupClosure(game, NOW)).toEqual({ reason: 'deadline', at: NOW.toISOString() });
  });

  it('closed by hand → manual, also with a deadline ahead', () => {
    expect(signupClosure({ signups_closed_at: iso(-HOUR), signup_deadline: null }, NOW)).toEqual({
      reason: 'manual',
      at: iso(-HOUR),
    });
    expect(
      signupClosure({ signups_closed_at: iso(-HOUR), signup_deadline: iso(HOUR) }, NOW),
    ).toEqual({ reason: 'manual', at: iso(-HOUR) });
  });

  it('both passed → whichever came first', () => {
    expect(
      signupClosure({ signups_closed_at: iso(-2 * HOUR), signup_deadline: iso(-HOUR) }, NOW),
    ).toEqual({ reason: 'manual', at: iso(-2 * HOUR) });
    expect(
      signupClosure({ signups_closed_at: iso(-HOUR), signup_deadline: iso(-2 * HOUR) }, NOW),
    ).toEqual({ reason: 'deadline', at: iso(-2 * HOUR) });
  });

  it('missing fields (an older reader) count as not set', () => {
    expect(isSignupClosed({}, NOW)).toBe(false);
    expect(isSignupClosed({ signups_closed_at: iso(-HOUR) }, NOW)).toBe(true);
  });

  it('defaults to the current clock', () => {
    expect(isSignupClosed({ signups_closed_at: null, signup_deadline: iso(-HOUR) })).toBe(true);
  });
});

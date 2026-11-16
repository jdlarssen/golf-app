import { describe, expect, it } from 'vitest';
import { parseSignupSettings, signupDeadlineAfterTeeOff } from './gamePayload';

// Type A (#2482): what «Plasser og frist» stores, from the form fields.

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const OPEN = { registrationMode: 'open' as const, gameMode: 'solo_strokeplay' as const, modeConfig: null };

describe('parseSignupSettings', () => {
  it('open with cap, deadline and list → all three, the deadline as ISO (Oslo summer time)', () => {
    expect(
      parseSignupSettings(
        form({ registration_cap: '16', signup_deadline: '2026-10-02T18:00', waitlist_enabled: '1' }),
        OPEN,
      ),
    ).toEqual({ registration_cap: 16, signup_deadline: '2026-10-02T16:00:00.000Z', waitlist_enabled: true });
  });

  it('empty fields → no cap and no deadline; the list switch is kept as posted', () => {
    // #2482 F3: a round saved without a cap keeps the switch, so it is still
    // on when a cap is added in «Rediger».
    expect(parseSignupSettings(form({ waitlist_enabled: '1' }), OPEN)).toEqual({
      registration_cap: null,
      signup_deadline: null,
      waitlist_enabled: true,
    });
    expect(parseSignupSettings(form({}), OPEN)).toMatchObject({ waitlist_enabled: false });
  });

  it('a format cap alone is enough for the list', () => {
    expect(
      parseSignupSettings(form({ waitlist_enabled: '1' }), { ...OPEN, gameMode: 'wolf' }).valueOf(),
    ).toMatchObject({ registration_cap: null, waitlist_enabled: true });
  });

  it('manual approval keeps cap and deadline but never the list', () => {
    expect(
      parseSignupSettings(form({ registration_cap: '8', waitlist_enabled: '1' }), {
        ...OPEN,
        registrationMode: 'manual_approval',
      }),
    ).toEqual({ registration_cap: 8, signup_deadline: null, waitlist_enabled: false });
  });

  it('invite only stores none of them, whatever the form says', () => {
    expect(
      parseSignupSettings(
        form({ registration_cap: '16', signup_deadline: '2026-10-02T18:00', waitlist_enabled: '1' }),
        { ...OPEN, registrationMode: 'invite_only' },
      ),
    ).toEqual({ registration_cap: null, signup_deadline: null, waitlist_enabled: false });
  });

  it('matchplay: the deadline only (U11)', () => {
    expect(
      parseSignupSettings(
        form({ registration_cap: '4', signup_deadline: '2026-10-02T18:00', waitlist_enabled: '1' }),
        { ...OPEN, gameMode: 'singles_matchplay', modeConfig: { team_size: 1 } },
      ),
    ).toEqual({ registration_cap: null, signup_deadline: '2026-10-02T16:00:00.000Z', waitlist_enabled: false });
  });

  it.each([['1'], ['201'], ['abc'], ['2.5']])('cap %s → bad_registration_cap', (cap) => {
    expect(parseSignupSettings(form({ registration_cap: cap }), OPEN)).toEqual({
      errorCode: 'bad_registration_cap',
    });
  });

  it('a cap above the format cap → bad_registration_cap (Wolf takes 5)', () => {
    expect(parseSignupSettings(form({ registration_cap: '6' }), { ...OPEN, gameMode: 'wolf' })).toEqual({
      errorCode: 'bad_registration_cap',
    });
  });

  it('a deadline that is not a datetime → bad_signup_deadline', () => {
    expect(parseSignupSettings(form({ signup_deadline: 'fredag' }), OPEN)).toEqual({
      errorCode: 'bad_signup_deadline',
    });
  });
});

describe('signupDeadlineAfterTeeOff (U13)', () => {
  it('after → true; before, equal or either missing → false', () => {
    expect(signupDeadlineAfterTeeOff('2026-10-03T08:00:00Z', '2026-10-03T07:00:00Z')).toBe(true);
    expect(signupDeadlineAfterTeeOff('2026-10-02T16:00:00Z', '2026-10-03T07:00:00Z')).toBe(false);
    expect(signupDeadlineAfterTeeOff('2026-10-03T07:00:00Z', '2026-10-03T07:00:00Z')).toBe(false);
    expect(signupDeadlineAfterTeeOff(null, '2026-10-03T07:00:00Z')).toBe(false);
    expect(signupDeadlineAfterTeeOff('2026-10-03T08:00:00Z', null)).toBe(false);
  });
});

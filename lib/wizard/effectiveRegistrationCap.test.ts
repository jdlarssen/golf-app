import { describe, expect, it } from 'vitest';
import {
  effectiveRegistrationCap,
  organizerCapBounds,
  REGISTRATION_CAP_MAX,
  REGISTRATION_CAP_MIN,
  registrationPlayerCap,
} from './fitsPlayerCount';

/**
 * #2482: the cap self-registration enforces is the lower of the format's cap
 * (`registrationPlayerCap`) and the organiser's (`games.registration_cap`).
 */
describe('effectiveRegistrationCap', () => {
  it('no format cap and no organiser cap → null', () => {
    expect(registrationPlayerCap('solo_strokeplay', null)).toBeNull();
    expect(effectiveRegistrationCap('solo_strokeplay', null, null)).toBeNull();
  });

  it('only the format caps → the format cap', () => {
    expect(effectiveRegistrationCap('wolf', null, null)).toBe(registrationPlayerCap('wolf', null));
    expect(effectiveRegistrationCap('texas_scramble', { team_size: 4 }, null)).toBe(
      registrationPlayerCap('texas_scramble', { team_size: 4 }),
    );
  });

  it('only the organiser caps → the organiser cap', () => {
    expect(effectiveRegistrationCap('solo_strokeplay', null, 3)).toBe(3);
    expect(effectiveRegistrationCap('stableford', {}, 16)).toBe(16);
  });

  it('both → the lower one wins', () => {
    const formatCap = registrationPlayerCap('texas_scramble', { team_size: 4 })!;
    expect(effectiveRegistrationCap('texas_scramble', { team_size: 4 }, 12)).toBe(12);
    expect(effectiveRegistrationCap('texas_scramble', { team_size: 4 }, formatCap + 50)).toBe(
      formatCap,
    );
    expect(effectiveRegistrationCap('wolf', null, 3)).toBe(3);
  });

  it('matchplay fills per side, so the organiser cap does not apply (U11)', () => {
    expect(effectiveRegistrationCap('singles_matchplay', { team_size: 1 }, 2)).toBeNull();
    expect(effectiveRegistrationCap('fourball_matchplay', { team_size: 2 }, 3)).toBeNull();
  });

  it('undefined organiser cap reads as none', () => {
    expect(effectiveRegistrationCap('solo_strokeplay', null, undefined)).toBeNull();
  });
});

describe('organizerCapBounds — the − and + on «Antall plasser»', () => {
  it('a format without a cap goes from 2 to 200', () => {
    expect(organizerCapBounds('solo_strokeplay', null)).toEqual({
      min: REGISTRATION_CAP_MIN,
      max: REGISTRATION_CAP_MAX,
    });
  });

  it('a format with a cap stops at the format cap', () => {
    const formatCap = registrationPlayerCap('wolf', null)!;
    expect(organizerCapBounds('wolf', null)).toEqual({ min: 2, max: formatCap });
  });

  it('matchplay has no organiser cap', () => {
    expect(organizerCapBounds('singles_matchplay', { team_size: 1 })).toBeNull();
  });
});

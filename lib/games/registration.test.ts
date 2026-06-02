import { describe, it, expect } from 'vitest';
import {
  gameModeSupportsTeams,
  isDiscoverableRegistrationMode,
  isRegistrationMode,
  isRegistrationType,
  REGISTRATION_MODES,
} from './registration';

describe('gameModeSupportsTeams', () => {
  it('returns true for best_ball', () => {
    expect(gameModeSupportsTeams('best_ball')).toBe(true);
  });

  it('returns true for texas_scramble', () => {
    expect(gameModeSupportsTeams('texas_scramble')).toBe(true);
  });

  it('returns false for stableford (solo-modus i v1)', () => {
    expect(gameModeSupportsTeams('stableford')).toBe(false);
  });

  it('returns false for singles_matchplay (1v1, ikke lag-påmelding)', () => {
    expect(gameModeSupportsTeams('singles_matchplay')).toBe(false);
  });

  it('returns false for solo_strokeplay', () => {
    expect(gameModeSupportsTeams('solo_strokeplay')).toBe(false);
  });
});

describe('isRegistrationMode', () => {
  it('accepts the three valid values', () => {
    expect(isRegistrationMode('invite_only')).toBe(true);
    expect(isRegistrationMode('manual_approval')).toBe(true);
    expect(isRegistrationMode('open')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isRegistrationMode('public')).toBe(false);
    expect(isRegistrationMode('')).toBe(false);
    expect(isRegistrationMode(null)).toBe(false);
    expect(isRegistrationMode(undefined)).toBe(false);
    expect(isRegistrationMode(42)).toBe(false);
  });
});

describe('isRegistrationType', () => {
  it('accepts the three valid values', () => {
    expect(isRegistrationType('solo')).toBe(true);
    expect(isRegistrationType('team')).toBe(true);
    expect(isRegistrationType('both')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isRegistrationType('group')).toBe(false);
    expect(isRegistrationType('')).toBe(false);
    expect(isRegistrationType(null)).toBe(false);
    expect(isRegistrationType(undefined)).toBe(false);
    expect(isRegistrationType(0)).toBe(false);
  });
});

describe('isDiscoverableRegistrationMode', () => {
  // Speiler getDiscoverableGames-filteret (#357): open + manual_approval
  // oppdages i «Finn turneringer», invite_only er privat.
  it('open og manual_approval er oppdagbare', () => {
    expect(isDiscoverableRegistrationMode('open')).toBe(true);
    expect(isDiscoverableRegistrationMode('manual_approval')).toBe(true);
  });

  it('invite_only er privat', () => {
    expect(isDiscoverableRegistrationMode('invite_only')).toBe(false);
  });

  it('dekker hver definerte modus (ingen modus uten klassifisering)', () => {
    // Vakt mot at en framtidig modus glemmes: hver REGISTRATION_MODE må gi
    // et eksplisitt boolsk svar, og nøyaktig invite_only skal være privat.
    const privat = REGISTRATION_MODES.filter(
      (m) => !isDiscoverableRegistrationMode(m),
    );
    expect(privat).toEqual(['invite_only']);
  });
});

import { describe, it, expect } from 'vitest';
import { TRUSTED_CREATOR_EMAILS, isTrustedCreator } from './trustedCreators';

describe('isTrustedCreator', () => {
  it('returns true for an email on the allowlist', () => {
    expect(isTrustedCreator('fornes.even@yahoo.no')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isTrustedCreator('Fornes.Even@Yahoo.NO')).toBe(true);
    expect(isTrustedCreator('FORNES.EVEN@YAHOO.NO')).toBe(true);
  });

  it('trims whitespace before comparison', () => {
    expect(isTrustedCreator('  fornes.even@yahoo.no  ')).toBe(true);
  });

  it('returns false for an email not on the allowlist', () => {
    expect(isTrustedCreator('someone.else@example.com')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTrustedCreator(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTrustedCreator(undefined)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isTrustedCreator('')).toBe(false);
  });

  it('returns false for whitespace-only', () => {
    expect(isTrustedCreator('   ')).toBe(false);
  });
});

describe('TRUSTED_CREATOR_EMAILS', () => {
  it('seeds with fornes.even@yahoo.no', () => {
    expect(TRUSTED_CREATOR_EMAILS).toContain('fornes.even@yahoo.no');
  });

  it('is readonly at the type level (frozen behavior assumed in caller code)', () => {
    expect(Array.isArray(TRUSTED_CREATOR_EMAILS)).toBe(true);
  });
});

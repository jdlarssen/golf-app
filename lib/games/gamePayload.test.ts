import { describe, it, expect } from 'vitest';
import { parseOsloDateTimeLocal } from './gamePayload';

describe('parseOsloDateTimeLocal', () => {
  it('parses summer (CEST/+02:00) wall-clock to UTC', () => {
    // 2026-06-15 09:00 Oslo = 07:00 UTC
    expect(parseOsloDateTimeLocal('2026-06-15T09:00')).toBe(
      '2026-06-15T07:00:00.000Z',
    );
  });

  it('parses winter (CET/+01:00) wall-clock to UTC', () => {
    // 2026-12-15 09:00 Oslo = 08:00 UTC
    expect(parseOsloDateTimeLocal('2026-12-15T09:00')).toBe(
      '2026-12-15T08:00:00.000Z',
    );
  });

  it('throws on a malformed string', () => {
    expect(() => parseOsloDateTimeLocal('not a date')).toThrow();
  });
});

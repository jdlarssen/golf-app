import { describe, it, expect } from 'vitest';
import { effectiveDate, effectiveYear } from './effectiveDate';

describe('effectiveDate', () => {
  it('prefers the scheduled tee-off over the end time', () => {
    const date = effectiveDate({
      scheduled_tee_off_at: '2026-07-04T08:00:00Z',
      ended_at: '2026-07-04T13:30:00Z',
    });
    expect(date?.toISOString()).toBe('2026-07-04T08:00:00.000Z');
  });

  it('falls back to the end time when no tee-off was scheduled', () => {
    const date = effectiveDate({
      scheduled_tee_off_at: null,
      ended_at: '2026-07-04T13:30:00Z',
    });
    expect(date?.toISOString()).toBe('2026-07-04T13:30:00.000Z');
  });

  it('returns null when the round has neither timestamp', () => {
    expect(effectiveDate({ scheduled_tee_off_at: null, ended_at: null })).toBeNull();
  });

  it('returns null for an unparseable timestamp rather than an Invalid Date', () => {
    expect(
      effectiveDate({ scheduled_tee_off_at: 'ikke en dato', ended_at: null }),
    ).toBeNull();
  });
});

describe('effectiveYear', () => {
  it('reads the year on the Oslo calendar, not UTC', () => {
    // 31.12.2025 kl. 23:30 UTC er allerede 1. januar 2026 i Oslo.
    expect(
      effectiveYear({
        scheduled_tee_off_at: '2025-12-31T23:30:00Z',
        ended_at: null,
      }),
    ).toBe(2026);
  });

  it('keeps a summer round in its own year (Oslo is UTC+2 then)', () => {
    expect(
      effectiveYear({ scheduled_tee_off_at: '2026-07-04T08:00:00Z', ended_at: null }),
    ).toBe(2026);
  });

  it('buckets on the tee-off, so a round that ends after midnight keeps its day', () => {
    expect(
      effectiveYear({
        scheduled_tee_off_at: '2026-12-31T16:00:00Z',
        ended_at: '2027-01-01T00:30:00Z',
      }),
    ).toBe(2026);
  });

  it('returns null for an undatable round', () => {
    expect(effectiveYear({ scheduled_tee_off_at: null, ended_at: null })).toBeNull();
  });
});

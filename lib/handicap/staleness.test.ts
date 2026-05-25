import { describe, it, expect } from 'vitest';
import {
  HANDICAP_STALENESS_MS,
  HANDICAP_STALENESS_WEEKS,
  isHandicapStale,
} from './staleness';

const NOW = new Date('2026-05-25T12:00:00Z');

describe('HANDICAP_STALENESS_WEEKS', () => {
  it('is 4 weeks', () => {
    expect(HANDICAP_STALENESS_WEEKS).toBe(4);
  });

  it('translates to the right millisecond span', () => {
    expect(HANDICAP_STALENESS_MS).toBe(4 * 7 * 24 * 60 * 60 * 1000);
  });
});

describe('isHandicapStale', () => {
  it('returns true when updatedAt is null', () => {
    expect(isHandicapStale(null, NOW)).toBe(true);
  });

  it('returns true when updatedAt is undefined', () => {
    expect(isHandicapStale(undefined, NOW)).toBe(true);
  });

  it('returns true at the exact boundary (= HANDICAP_STALENESS_MS old)', () => {
    const updated = new Date(NOW.getTime() - HANDICAP_STALENESS_MS);
    expect(isHandicapStale(updated, NOW)).toBe(true);
  });

  it('returns false just before the boundary (1ms younger than the cutoff)', () => {
    const updated = new Date(NOW.getTime() - HANDICAP_STALENESS_MS + 1);
    expect(isHandicapStale(updated, NOW)).toBe(false);
  });

  it('returns false for a freshly updated handicap', () => {
    expect(isHandicapStale(NOW, NOW)).toBe(false);
  });

  it('returns true for a handicap updated far in the past', () => {
    const updated = new Date('2024-01-01T00:00:00Z');
    expect(isHandicapStale(updated, NOW)).toBe(true);
  });

  it('accepts an ISO string the way Supabase returns it', () => {
    const updated = new Date(NOW.getTime() - HANDICAP_STALENESS_MS - 1000);
    expect(isHandicapStale(updated.toISOString(), NOW)).toBe(true);
  });

  it('accepts a fresh ISO string', () => {
    const updated = new Date(NOW.getTime() - 1000);
    expect(isHandicapStale(updated.toISOString(), NOW)).toBe(false);
  });
});

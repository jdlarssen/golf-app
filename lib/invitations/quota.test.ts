import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTimeUntil } from './quota';

describe('formatTimeUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "snart" when the target is now or past', () => {
    expect(formatTimeUntil(new Date('2026-05-11T10:00:00Z'))).toBe('snart');
    expect(formatTimeUntil(new Date('2026-05-11T09:00:00Z'))).toBe('snart');
  });

  it('returns minutes when under 1 hour away', () => {
    expect(formatTimeUntil(new Date('2026-05-11T10:30:00Z'))).toBe('30 min');
    expect(formatTimeUntil(new Date('2026-05-11T10:01:00Z'))).toBe('1 min');
  });

  it('returns hours (floored) when 1 hour or more away', () => {
    expect(formatTimeUntil(new Date('2026-05-11T15:00:00Z'))).toBe('5 t');
    expect(formatTimeUntil(new Date('2026-05-11T11:00:00Z'))).toBe('1 t');
    // 5h 59min still rounds down to 5 hours
    expect(formatTimeUntil(new Date('2026-05-11T15:59:00Z'))).toBe('5 t');
  });

  it('ceils minutes (so 30s remaining shows as 1 min, not 0)', () => {
    expect(formatTimeUntil(new Date('2026-05-11T10:00:30Z'))).toBe('1 min');
  });
});

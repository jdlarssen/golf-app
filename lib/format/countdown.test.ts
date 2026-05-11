import { describe, it, expect } from 'vitest';
import { formatCountdown } from './countdown';

describe('formatCountdown', () => {
  it('returns "Starter snart" when tee-off has passed', () => {
    expect(formatCountdown(-1000)).toBe('Starter snart');
    expect(formatCountdown(0)).toBe('Starter snart');
  });

  it('returns seconds when under 1 minute', () => {
    expect(formatCountdown(45 * 1000)).toBe('Starter om 45 s');
  });

  it('returns 59 s just under the minute boundary', () => {
    expect(formatCountdown(59 * 1000)).toBe('Starter om 59 s');
  });

  it('crosses into the minutes bucket at exactly 60_000 ms', () => {
    expect(formatCountdown(60_000)).toBe('Starter om 1 min');
  });

  it('returns minutes when 1–60 minutes', () => {
    expect(formatCountdown(45 * 60 * 1000)).toBe('Starter om 45 min');
  });

  it('crosses into the hours bucket at exactly 3_600_000 ms', () => {
    expect(formatCountdown(3_600_000)).toBe('Starter om 1 t 0 min');
  });

  it('returns hours and minutes when 1–24 hours', () => {
    const twoH14m = (2 * 60 + 14) * 60 * 1000;
    expect(formatCountdown(twoH14m)).toBe('Starter om 2 t 14 min');
  });

  it('returns days when more than 24 hours', () => {
    expect(formatCountdown(4 * 24 * 60 * 60 * 1000)).toBe('Starter om 4 dager');
  });

  it('uses singular "1 dag" not "1 dager"', () => {
    expect(formatCountdown(36 * 60 * 60 * 1000)).toBe('Starter om 1 dag');
  });

  it('crosses into the days bucket at exactly 86_400_000 ms', () => {
    expect(formatCountdown(86_400_000)).toBe('Starter om 1 dag');
  });
});

import { describe, it, expect } from 'vitest';
import { formatTeeOffDate, formatTeeOffTime, expectedFirstScoreTime } from './teeOff';

const TEE_OFF = new Date('2026-05-12T14:24:00+02:00');

describe('formatTeeOffTime', () => {
  it('returns HH:MM in 24h Norwegian format', () => {
    expect(formatTeeOffTime(TEE_OFF)).toBe('14:24');
  });
});

describe('formatTeeOffDate', () => {
  it('returns short Norwegian date with day-of-week, date and month', () => {
    // 2026-05-12 is a Tuesday → "tir. 12. mai"
    expect(formatTeeOffDate(TEE_OFF)).toBe('tir. 12. mai');
  });
  it('formats a Saturday correctly', () => {
    // 2026-05-16 is a Saturday → "lør. 16. mai"
    const sat = new Date('2026-05-16T10:00:00+02:00');
    expect(formatTeeOffDate(sat)).toBe('lør. 16. mai');
  });
});

describe('expectedFirstScoreTime', () => {
  it('rounds tee-off + 30 min up to nearest 5 minutes', () => {
    // 14:24 + 30 = 14:54 → rounded UP to 14:55
    expect(expectedFirstScoreTime(TEE_OFF)).toBe('14:55');
  });
  it('handles exact 5-minute boundaries cleanly', () => {
    const exact = new Date('2026-05-12T14:00:00+02:00');
    // 14:00 + 30 = 14:30 (already on boundary)
    expect(expectedFirstScoreTime(exact)).toBe('14:30');
  });
  it('rolls over the hour when rounding pushes past :60', () => {
    // 14:26 + 30 = 14:56 → rounded UP to 15:00
    const nearHourBoundary = new Date('2026-05-12T14:26:00+02:00');
    expect(expectedFirstScoreTime(nearHourBoundary)).toBe('15:00');
  });
  it('rolls into the next day when tee-off is near midnight', () => {
    // 23:55 + 30 = 00:25 next day → already on boundary
    const lateNight = new Date('2026-05-12T23:55:00+02:00');
    expect(expectedFirstScoreTime(lateNight)).toBe('00:25');
  });
});

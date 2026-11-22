// Type A: the day shown next to the clock on a «Siste 14 dager» row.
import { describe, expect, it } from 'vitest';
import { ledgerDayLabel } from './ActivityLedger';

const NOW = new Date('2026-11-20T12:00:00.000Z').getTime(); // fre 20. nov 13:00 Oslo

describe('ledgerDayLabel', () => {
  it('is null for an entry from today (Oslo day)', () => {
    expect(ledgerDayLabel('2026-11-20T08:00:00.000Z', 'no', NOW)).toBeNull();
    // 23:30 Oslo on the 19th is yesterday, 00:30 on the 20th is today.
    expect(ledgerDayLabel('2026-11-19T23:30:00.000Z', 'no', NOW)).toBeNull();
  });
  it('says «i går» for the day before, also late in the evening', () => {
    expect(ledgerDayLabel('2026-11-19T20:00:00.000Z', 'no', NOW)).toBe('i går');
    expect(ledgerDayLabel('2026-11-19T20:00:00.000Z', 'en', NOW)).toBe('yesterday');
  });
  it('gives the date for older entries, never only a clock time', () => {
    expect(ledgerDayLabel('2026-11-11T13:05:00.000Z', 'no', NOW)).toMatch(/^11\.? nov/);
  });
  it('is null for an unparseable stamp', () => {
    expect(ledgerDayLabel('nope', 'no', NOW)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { formatShortDateNb, formatShortDateNbWithYear } from './date';

describe('formatShortDateNb', () => {
  it('renders day and short month without year', () => {
    // 2026-05-14 lokal tid
    const d = new Date(2026, 4, 14);
    expect(formatShortDateNb(d)).toBe('14. mai');
  });

  it('uses single-digit day without leading zero', () => {
    const d = new Date(2026, 7, 3); // 3. aug
    expect(formatShortDateNb(d)).toBe('3. aug');
  });

  it('uses Norwegian month abbreviation without trailing dot', () => {
    const d = new Date(2026, 11, 24); // 24. des
    expect(formatShortDateNb(d)).toBe('24. des');
  });

  it('accepts ISO string', () => {
    expect(formatShortDateNb('2026-05-14T12:00:00Z')).toMatch(/^(13|14)\. mai$/);
  });
});

describe('formatShortDateNbWithYear', () => {
  it('appends 4-digit year', () => {
    const d = new Date(2026, 4, 14);
    expect(formatShortDateNbWithYear(d)).toBe('14. mai 2026');
  });

  it('accepts ISO string', () => {
    // Bruk en dag-i-midten-av-måneden for å unngå TZ-grenser
    expect(formatShortDateNbWithYear('2026-08-15T12:00:00Z')).toMatch(
      /^15\. aug 2026$/,
    );
  });
});

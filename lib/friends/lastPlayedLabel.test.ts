import { describe, it, expect } from 'vitest';
import no from '@/messages/no.json';
import en from '@/messages/en.json';
import { lastPlayedLabel, type LastPlayedText } from './lastPlayedLabel';

/**
 * Type A (#2267): «sist spilt» on the web's friends page, in Oslo days. The
 * server runs in UTC, so a round at 23:30 UTC in summer belongs to the next
 * Oslo day. The texts come from the message catalogs, as the page passes them.
 */

function text(catalog: typeof no): LastPlayedText {
  const f = catalog.friends;
  return {
    today: f.lastPlayedToday,
    yesterday: f.lastPlayedYesterday,
    weekday: (weekday) => f.lastPlayedWeekday.replace('{weekday}', weekday),
  };
}

// Wednesday 15 July 2026, 10:00 in Oslo (UTC+2).
const NOW = new Date('2026-07-15T08:00:00Z');

describe('lastPlayedLabel', () => {
  it.each([
    { label: 'same Oslo day', iso: '2026-07-15T05:00:00Z', no: 'i dag', en: 'today' },
    { label: '23:30 UTC the night before is today in Oslo', iso: '2026-07-14T22:30:00Z', no: 'i dag', en: 'today' },
    { label: 'the day before', iso: '2026-07-14T12:00:00Z', no: 'i går', en: 'yesterday' },
    { label: 'two days back', iso: '2026-07-13T12:00:00Z', no: 'sist mandag', en: 'last Monday' },
    { label: 'six days back', iso: '2026-07-09T12:00:00Z', no: 'sist torsdag', en: 'last Thursday' },
    { label: 'a week back is a date', iso: '2026-07-08T12:00:00Z', no: '8. jul', en: '8 Jul' },
    { label: 'another Oslo year carries the year', iso: '2025-12-31T12:00:00Z', no: '31. des 2025', en: '31 Dec 2025' },
    { label: 'a date ahead is a date', iso: '2026-07-20T12:00:00Z', no: '20. jul', en: '20 Jul' },
  ])('$label', ({ iso, no: nb, en: english }) => {
    expect(lastPlayedLabel(iso, NOW, 'no', text(no))).toBe(nb);
    expect(lastPlayedLabel(iso, NOW, 'en', text(en))).toBe(english);
  });

  it('counts New Year by the Oslo calendar, not UTC', () => {
    // 23:30 UTC on 31 Dec is 00:30 on 1 Jan in Oslo: same year as «now».
    const now = new Date('2026-01-01T11:00:00Z');
    expect(lastPlayedLabel('2025-12-31T23:30:00Z', now, 'no', text(no))).toBe('i dag');
  });
});

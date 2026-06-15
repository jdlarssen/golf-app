// Force UTC as host timezone so tests are environment-independent (same as
// teeOff.test.ts — the formatTeeOff* helpers pin to Europe/Oslo internally).
process.env.TZ = 'UTC';

import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  intlLocaleTag,
  formatTeeOffTimeLocale,
  formatTeeOffDateLocale,
  formatShortDateWithYearLocale,
  formatShortDateLocale,
  formatRelativeLocale,
  formatCountdownLocale,
  formatTeeOffLineLocale,
  shortMonthLocale,
  formatShortUTCDayMonthLocale,
  formatShortOsloDayMonthLocale,
} from './format';
import {
  formatTeeOffTime,
  formatTeeOffDate,
} from '@/lib/format/teeOff';
import { formatShortDateNb, formatShortDateNbWithYear } from '@/lib/format/date';
import { formatRelativeNb } from '@/lib/format/relativeTimeNb';
import { formatCountdown } from '@/lib/format/countdown';

// 2026-05-08 14:30 UTC — formatted in UTC throughout so tests are
// timezone-independent.
const WHEN = new Date(Date.UTC(2026, 4, 8, 14, 30));
const UTC = { timeZone: 'UTC' } as const;

describe('intlLocaleTag', () => {
  it.each([
    ['no', 'nb-NO'],
    ['en', 'en-GB'],
  ] as const)('%s -> %s', (locale, tag) => {
    expect(intlLocaleTag(locale)).toBe(tag);
  });
});

describe('formatDate', () => {
  it('renders Norwegian long dates exactly like the old inline nb-NO calls', () => {
    expect(
      formatDate(WHEN, 'no', { day: 'numeric', month: 'long', year: 'numeric', ...UTC }),
    ).toBe('8. mai 2026');
  });

  it('renders English with European day-first order (en-GB)', () => {
    expect(
      formatDate(WHEN, 'en', { day: 'numeric', month: 'long', year: 'numeric', ...UTC }),
    ).toBe('8 May 2026');
  });

  it('accepts ISO strings, matching the old new Date(iso).toLocale* pattern', () => {
    expect(
      formatDate('2026-05-08T14:30:00Z', 'no', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...UTC,
      }),
    ).toBe(
      new Date('2026-05-08T14:30:00Z').toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...UTC,
      }),
    );
  });
});

describe('formatTime', () => {
  it('Norwegian 24h clock', () => {
    expect(
      formatTime(WHEN, 'no', { hour: '2-digit', minute: '2-digit', ...UTC }),
    ).toBe('14:30');
  });
});

describe('formatDateTime', () => {
  it('matches the old toLocaleString nb-NO output byte for byte', () => {
    const options = {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      ...UTC,
    } as const;
    expect(formatDateTime(WHEN, 'no', options)).toBe(
      WHEN.toLocaleString('nb-NO', options),
    );
  });
});

describe('formatNumber', () => {
  it('Norwegian decimal comma, matching the old inline toLocaleString', () => {
    expect(formatNumber(12.4, 'no', { maximumFractionDigits: 1 })).toBe(
      (12.4).toLocaleString('nb-NO', { maximumFractionDigits: 1 }),
    );
  });

  it('English decimal point', () => {
    expect(formatNumber(12.4, 'en', { maximumFractionDigits: 1 })).toBe('12.4');
  });

  it('group separators per locale', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234');
    expect(formatNumber(1234, 'no')).toBe((1234).toLocaleString('nb-NO'));
  });
});

// ---------------------------------------------------------------------------
// Locale-aware tee-off / countdown helpers (#554)
// ---------------------------------------------------------------------------

// 2026-05-12 14:24 Oslo (CEST, +02:00) = 2026-05-12T12:24:00Z
const TEE_OFF = new Date('2026-05-12T14:24:00+02:00');

// Representative dates for parametrized tee-off date tests
const TEE_OFF_CASES: Array<[Date, string, string]> = [
  // [date, expected-no, expected-en]
  [TEE_OFF, 'tir. 12. mai', 'Tue 12 May'],
  // Saturday 2026-05-16 10:00 Oslo
  [new Date('2026-05-16T10:00:00+02:00'), 'lør. 16. mai', 'Sat 16 May'],
  // Thursday 2026-05-14 via UTC midnight boundary
  [new Date('2026-05-14T12:00:00Z'), 'tor. 14. mai', 'Thu 14 May'],
  // Oslo-winter: Wednesday 2026-01-14 via UTC midnight boundary
  [new Date('2026-01-13T23:30:00Z'), 'ons. 14. jan', 'Wed 14 Jan'],
];

describe('formatTeeOffTimeLocale', () => {
  it("'no' output is byte-identical to legacy formatTeeOffTime", () => {
    expect(formatTeeOffTimeLocale(TEE_OFF, 'no')).toBe(formatTeeOffTime(TEE_OFF));
  });

  it.each([
    [new Date('2026-05-12T12:24:00Z'), '14:24'],
    [new Date('2026-05-14T12:00:00Z'), '14:00'], // UTC noon → Oslo 14:00 summer
    [new Date('2026-01-14T12:00:00Z'), '13:00'], // UTC noon → Oslo 13:00 winter
  ])('en: %s → %s', (date, expected) => {
    expect(formatTeeOffTimeLocale(date, 'en')).toBe(expected);
  });
});

describe('formatTeeOffDateLocale', () => {
  it.each(TEE_OFF_CASES)(
    "'no' output === legacy formatTeeOffDate (%s)",
    (date) => {
      expect(formatTeeOffDateLocale(date, 'no')).toBe(formatTeeOffDate(date));
    },
  );

  it.each(TEE_OFF_CASES)(
    'en: %s → %s',
    (date, _no, expectedEn) => {
      expect(formatTeeOffDateLocale(date, 'en')).toBe(expectedEn);
    },
  );
});

describe('formatShortDateWithYearLocale', () => {
  const D = new Date(2026, 4, 14); // local TZ — mirrors legacy helper
  it("'no' output is byte-identical to legacy formatShortDateNbWithYear", () => {
    expect(formatShortDateWithYearLocale(D, 'no')).toBe(
      formatShortDateNbWithYear(D),
    );
  });

  it('en output has day-month-year in readable form', () => {
    const result = formatShortDateWithYearLocale(D, 'en');
    // Should contain '2026' and 'May' and '14'
    expect(result).toMatch(/14/);
    expect(result).toMatch(/May/);
    expect(result).toMatch(/2026/);
  });

  it('accepts ISO string for no locale', () => {
    expect(formatShortDateWithYearLocale('2026-08-15T12:00:00Z', 'no')).toBe(
      formatShortDateNbWithYear('2026-08-15T12:00:00Z'),
    );
  });
});

describe('formatCountdownLocale', () => {
  const CASES: Array<[number]> = [
    [-1000],
    [0],
    [45_000],
    [60_000],
    [45 * 60_000],
    [3_600_000],
    [(2 * 60 + 14) * 60_000],
    [4 * 24 * 60 * 60_000],
    [36 * 60 * 60_000],
  ];

  it.each(CASES)(
    "'no' output is byte-identical to legacy formatCountdown (%s ms)",
    (ms) => {
      expect(formatCountdownLocale(ms, 'no')).toBe(formatCountdown(ms));
    },
  );

  it('en: ≤0 → "Starting soon"', () => {
    expect(formatCountdownLocale(0, 'en')).toBe('Starting soon');
    expect(formatCountdownLocale(-1000, 'en')).toBe('Starting soon');
  });

  it('en: seconds bucket', () => {
    expect(formatCountdownLocale(45_000, 'en')).toBe('Starting in 45s');
  });

  it('en: minutes bucket', () => {
    expect(formatCountdownLocale(45 * 60_000, 'en')).toBe('Starting in 45 min');
  });

  it('en: hours+minutes bucket', () => {
    expect(formatCountdownLocale((2 * 60 + 14) * 60_000, 'en')).toBe(
      'Starting in 2h 14 min',
    );
  });

  it('en: days bucket — plural', () => {
    expect(formatCountdownLocale(4 * 24 * 60 * 60_000, 'en')).toBe(
      'Starting in 4 days',
    );
  });

  it('en: days bucket — singular', () => {
    expect(formatCountdownLocale(36 * 60 * 60_000, 'en')).toBe(
      'Starting in 1 day',
    );
  });
});

// ---------------------------------------------------------------------------
// formatTeeOffLineLocale (#561 Fase 2b)
// ---------------------------------------------------------------------------
// NOTE: process.env.TZ = 'UTC' is set at the top of this file. The input
// strings are datetime-local (no timezone), so new Date('2026-05-15T09:05')
// is parsed as UTC midnight + offset in local time — under TZ=UTC that means
// the date fields (getDate, getMonth, etc.) read back exactly as written.
// ---------------------------------------------------------------------------

describe('formatTeeOffLineLocale', () => {
  // 'no' path parametrized over all 12 months + padding edge
  it.each([
    ['2026-01-15T09:05', 'no', '15. januar 2026 kl. 09:05'],
    ['2026-02-15T09:05', 'no', '15. februar 2026 kl. 09:05'],
    ['2026-03-15T09:05', 'no', '15. mars 2026 kl. 09:05'],
    ['2026-04-15T09:05', 'no', '15. april 2026 kl. 09:05'],
    ['2026-05-15T09:05', 'no', '15. mai 2026 kl. 09:05'],
    ['2026-06-15T09:05', 'no', '15. juni 2026 kl. 09:05'],
    ['2026-07-15T09:05', 'no', '15. juli 2026 kl. 09:05'],
    ['2026-08-15T09:05', 'no', '15. august 2026 kl. 09:05'],
    ['2026-09-15T09:05', 'no', '15. september 2026 kl. 09:05'],
    ['2026-10-15T09:05', 'no', '15. oktober 2026 kl. 09:05'],
    ['2026-11-15T09:05', 'no', '15. november 2026 kl. 09:05'],
    ['2026-12-15T09:05', 'no', '15. desember 2026 kl. 09:05'],
    // zero-padding edge: hours 09, minutes 05
    ['2026-05-03T09:05', 'no', '3. mai 2026 kl. 09:05'],
    // midnight padding
    ['2026-05-03T00:00', 'no', '3. mai 2026 kl. 00:00'],
  ] as const)(
    "'no' %s → %s",
    (value, locale, expected) => {
      expect(formatTeeOffLineLocale(value, locale)).toBe(expected);
    },
  );

  // 'en' sanity checks
  it.each([
    ['2026-05-15T12:30', 'en', '15 May 2026, 12:30'],
    ['2026-10-03T09:05', 'en', '3 October 2026, 09:05'],
    ['2026-01-01T00:00', 'en', '1 January 2026, 00:00'],
    ['2026-12-31T23:59', 'en', '31 December 2026, 23:59'],
  ] as const)(
    "'en' %s → %s",
    (value, locale, expected) => {
      expect(formatTeeOffLineLocale(value, locale)).toBe(expected);
    },
  );

  it('empty string returns null', () => {
    expect(formatTeeOffLineLocale('', 'no')).toBeNull();
    expect(formatTeeOffLineLocale('', 'en')).toBeNull();
  });

  it('whitespace-only string returns null', () => {
    expect(formatTeeOffLineLocale('   ', 'no')).toBeNull();
  });

  it('unparseable non-empty string returns the value unchanged', () => {
    expect(formatTeeOffLineLocale('ikke-en-dato', 'no')).toBe('ikke-en-dato');
    expect(formatTeeOffLineLocale('not-a-date', 'en')).toBe('not-a-date');
  });
});

// ---------------------------------------------------------------------------
// formatShortDateLocale (#563 Fase 2c chunk 1)
// ---------------------------------------------------------------------------
// process.env.TZ = 'UTC' at top of file — local-TZ reads on Date#getDate etc.
// mirror the legacy helper under UTC.

describe('formatShortDateLocale', () => {
  const SHORT_DATE_CASES: Array<[string | Date]> = [
    [new Date(2026, 4, 14)],   // May 14 (local)
    [new Date(2026, 0, 1)],    // Jan 1
    [new Date(2026, 11, 31)],  // Dec 31
    ['2026-08-15T12:00:00Z'],  // ISO string
    [new Date(2026, 5, 3)],    // Jun 3 (single-digit day)
  ];

  it.each(SHORT_DATE_CASES)(
    "'no' output is byte-identical to legacy formatShortDateNb (%s)",
    (input) => {
      expect(formatShortDateLocale(input, 'no')).toBe(formatShortDateNb(input));
    },
  );

  it.each([
    [new Date(2026, 4, 14), '14 May'],
    [new Date(2026, 0, 1), '1 Jan'],
    [new Date(2026, 11, 31), '31 Dec'],
    [new Date(2026, 5, 3), '3 Jun'],
  ] as const)('en: %s → %s', (date, expected) => {
    expect(formatShortDateLocale(date, 'en')).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// formatRelativeLocale (#563 Fase 2c chunk 1)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// shortMonthLocale + formatShortUTCDayMonthLocale (#566 Fase 2d chunk 1)
// ---------------------------------------------------------------------------

/** The legacy hand-rolled Norwegian month-abbreviation array used in
 * LigaRoundRow and CreateLigaForm (and replicated as NO_MONTHS_SHORT in
 * format.ts). Tests assert byte-identical output for 'no'. */
const LEGACY_NO_MONTHS_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des',
] as const;

describe('shortMonthLocale', () => {
  it.each(
    LEGACY_NO_MONTHS_SHORT.map((abbr, idx) => [idx, abbr] as const),
  )(
    "'no' month %i is byte-identical to legacy array ('%s')",
    (monthIndex, expected) => {
      expect(shortMonthLocale(monthIndex, 'no')).toBe(expected);
    },
  );

  // en-GB Intl abbreviations (verified against Node's ICU data).
  // Note: September is 'Sept' (4 chars) in en-GB, not 'Sep'.
  it.each([
    [0, 'Jan'],
    [1, 'Feb'],
    [2, 'Mar'],
    [3, 'Apr'],
    [4, 'May'],
    [5, 'Jun'],
    [6, 'Jul'],
    [7, 'Aug'],
    [8, 'Sept'],
    [9, 'Oct'],
    [10, 'Nov'],
    [11, 'Dec'],
  ] as const)('en: month %i → %s', (monthIndex, expected) => {
    expect(shortMonthLocale(monthIndex, 'en')).toBe(expected);
  });
});

describe('formatShortUTCDayMonthLocale', () => {
  // Reference ISO strings pinned to known UTC day/month combos.
  const CASES_NO: Array<[string, string]> = LEGACY_NO_MONTHS_SHORT.map((abbr, idx) => {
    // Use the 12th of each month (avoids month-boundary confusion).
    const month = String(idx + 1).padStart(2, '0');
    return [`2026-${month}-12T14:30:00Z`, `12. ${abbr}`];
  });

  it.each(CASES_NO)(
    "'no' %s → byte-identical to legacy hand-rolled output ('%s')",
    (iso, expected) => {
      expect(formatShortUTCDayMonthLocale(iso, 'no')).toBe(expected);
    },
  );

  // Single-digit day: 5th of May → "5. mai"
  it("'no' single-digit day: '2026-05-05T00:00:00Z' → '5. mai'", () => {
    expect(formatShortUTCDayMonthLocale('2026-05-05T00:00:00Z', 'no')).toBe('5. mai');
  });

  it.each([
    ['2026-05-12T14:30:00Z', '12 May'],
    ['2026-01-01T00:00:00Z', '1 Jan'],
    ['2026-12-31T23:59:00Z', '31 Dec'],
    ['2026-06-03T12:00:00Z', '3 Jun'],
  ] as const)("'en' %s → %s", (iso, expected) => {
    expect(formatShortUTCDayMonthLocale(iso, 'en')).toBe(expected);
  });
});

describe('formatShortOsloDayMonthLocale (#648)', () => {
  it("'no' formats day/month in Oslo time, not UTC", () => {
    // 22:30 UTC on May 12 = 00:30 Oslo on May 13 (CEST). The UTC sibling would
    // say «12. mai»; the Oslo variant must roll over to «13. mai».
    expect(formatShortOsloDayMonthLocale('2026-05-12T22:30:00Z', 'no')).toBe('13. mai');
    // Mid-day instant stays on the same date.
    expect(formatShortOsloDayMonthLocale('2026-05-12T10:00:00Z', 'no')).toBe('12. mai');
  });

  it("'en' formats day/month in Oslo time", () => {
    expect(formatShortOsloDayMonthLocale('2026-05-12T22:30:00Z', 'en')).toBe('13 May');
    expect(formatShortOsloDayMonthLocale('2026-06-03T10:00:00Z', 'en')).toBe('3 Jun');
  });
});

describe('formatRelativeLocale', () => {
  // Pin a base time so deltas are reproducible.
  const BASE_ISO = '2026-05-14T12:00:00Z';
  const BASE_MS = new Date(BASE_ISO).getTime();

  // Representative thresholds covering all 6 tiers of the 30-day ladder.
  const RELATIVE_CASES: Array<[string, number]> = [
    // just now / nå: 0 seconds
    [BASE_ISO, BASE_MS],
    // ~30 seconds ago
    [new Date(BASE_MS - 30_000).toISOString(), BASE_MS],
    // ~5 minutes ago
    [new Date(BASE_MS - 5 * 60_000).toISOString(), BASE_MS],
    // ~2 hours ago
    [new Date(BASE_MS - 2 * 60 * 60_000).toISOString(), BASE_MS],
    // ~3 days ago (yesterday boundary)
    [new Date(BASE_MS - 3 * 24 * 60 * 60_000).toISOString(), BASE_MS],
    // ~2 weeks ago
    [new Date(BASE_MS - 14 * 24 * 60 * 60_000).toISOString(), BASE_MS],
    // ~6 weeks ago (month tier)
    [new Date(BASE_MS - 42 * 24 * 60 * 60_000).toISOString(), BASE_MS],
  ];

  it.each(RELATIVE_CASES)(
    "'no' output is byte-identical to legacy formatRelativeNb (%s)",
    (iso, nowMs) => {
      expect(formatRelativeLocale(iso, 'no', nowMs)).toBe(
        formatRelativeNb(iso, nowMs),
      );
    },
  );

  // English spot-checks — same tier boundaries, idiomatic English.
  it('en: just now (0 ms diff)', () => {
    expect(formatRelativeLocale(BASE_ISO, 'en', BASE_MS)).toMatch(/now|second/i);
  });

  it('en: minutes ago', () => {
    const iso = new Date(BASE_MS - 5 * 60_000).toISOString();
    const result = formatRelativeLocale(iso, 'en', BASE_MS);
    expect(result).toMatch(/minut/i);
  });

  it('en: hours ago', () => {
    const iso = new Date(BASE_MS - 2 * 60 * 60_000).toISOString();
    const result = formatRelativeLocale(iso, 'en', BASE_MS);
    expect(result).toMatch(/hour/i);
  });

  it('en: days ago', () => {
    const iso = new Date(BASE_MS - 3 * 24 * 60 * 60_000).toISOString();
    const result = formatRelativeLocale(iso, 'en', BASE_MS);
    expect(result).toMatch(/day|yesterday/i);
  });

  it('en: weeks ago', () => {
    const iso = new Date(BASE_MS - 14 * 24 * 60 * 60_000).toISOString();
    const result = formatRelativeLocale(iso, 'en', BASE_MS);
    expect(result).toMatch(/week/i);
  });

  it('en: months ago', () => {
    const iso = new Date(BASE_MS - 42 * 24 * 60 * 60_000).toISOString();
    const result = formatRelativeLocale(iso, 'en', BASE_MS);
    expect(result).toMatch(/month/i);
  });

  it('negative diff (future timestamp) treated as 0', () => {
    const futureIso = new Date(BASE_MS + 5000).toISOString();
    // Both locales should return "just now" / "nå nettopp" equivalents
    const noResult = formatRelativeLocale(futureIso, 'no', BASE_MS);
    const enResult = formatRelativeLocale(futureIso, 'en', BASE_MS);
    expect(noResult).toBe(formatRelativeNb(futureIso, BASE_MS));
    expect(enResult).toMatch(/now|second/i);
  });
});

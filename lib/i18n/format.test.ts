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
  formatCountdownLocale,
  formatTeeOffLineLocale,
} from './format';
import {
  formatTeeOffTime,
  formatTeeOffDate,
} from '@/lib/format/teeOff';
import { formatShortDateNbWithYear } from '@/lib/format/date';
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

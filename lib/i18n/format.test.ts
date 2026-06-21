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
  countdownParts,
  formatTeeOffLineLocale,
  shortMonthLocale,
  formatShortUTCDayMonthLocale,
  formatShortOsloDayMonthLocale,
  formatShortOsloDateWithYearLocale,
  formatMonthLongLocale,
  formatHHMMOslo,
} from './format';
import type { AppLocale } from '@/i18n/routing';
import {
  formatTeeOffTime,
  formatTeeOffDate,
} from '@/lib/format/teeOff';
import { formatShortDateNb, formatShortDateNbWithYear } from '@/lib/format/date';
import { formatRelativeNb } from '@/lib/format/relativeTimeNb';
import { formatCountdown } from '@/lib/format/countdown';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';

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

// A locale beyond the shipped no/en, cast to AppLocale. Proves the date
// helpers' else-branches follow the active locale (intlLocaleTag) rather than
// pinning English — the N-locale criterion from routing.ts (#845/#61).
const SV = 'sv' as AppLocale;

describe('N-locale safety (probe locale beyond no/en)', () => {
  it('formatTeeOffDateLocale renders Swedish weekday + month, not English', () => {
    expect(formatTeeOffDateLocale(WHEN, SV)).toBe('fre 8 maj');
    expect(formatTeeOffDateLocale(WHEN, SV)).not.toBe(
      formatTeeOffDateLocale(WHEN, 'en'),
    );
  });

  it('shortMonthLocale renders the Swedish abbreviation', () => {
    expect(shortMonthLocale(4, SV)).toBe('maj');
    expect(shortMonthLocale(4, SV)).not.toBe(shortMonthLocale(4, 'en'));
  });

  it('formatMonthLongLocale renders the Swedish long month', () => {
    expect(formatMonthLongLocale(WHEN, SV)).toBe(
      new Intl.DateTimeFormat('sv', { month: 'long', year: 'numeric' }).format(WHEN),
    );
    expect(formatMonthLongLocale(WHEN, SV)).not.toBe(
      formatMonthLongLocale(WHEN, 'en'),
    );
  });

  it('formatShortUTCDayMonthLocale renders the Swedish month', () => {
    const iso = '2026-05-12T10:00:00Z';
    expect(formatShortUTCDayMonthLocale(iso, SV)).toBe('12 maj');
    expect(formatShortUTCDayMonthLocale(iso, SV)).not.toBe(
      formatShortUTCDayMonthLocale(iso, 'en'),
    );
  });

  it('formatShortOsloDayMonthLocale renders the Swedish month', () => {
    expect(formatShortOsloDayMonthLocale(WHEN, SV)).toContain('maj');
    expect(formatShortOsloDayMonthLocale(WHEN, SV)).not.toBe(
      formatShortOsloDayMonthLocale(WHEN, 'en'),
    );
  });

  it('formatShortOsloDateWithYearLocale uses the locale month, not literal en', () => {
    expect(formatShortOsloDateWithYearLocale(WHEN, SV)).toContain('maj');
    expect(formatShortOsloDateWithYearLocale(WHEN, SV)).not.toBe(
      formatShortOsloDateWithYearLocale(WHEN, 'en'),
    );
  });

  it('formatRelativeLocale renders Swedish relative time', () => {
    const now = WHEN.getTime();
    const fiveMinAgo = new Date(now - 5 * 60_000).toISOString();
    expect(formatRelativeLocale(fiveMinAgo, SV, now)).toBe('för 5 minuter sedan');
    expect(formatRelativeLocale(fiveMinAgo, SV, now)).not.toBe(
      formatRelativeLocale(fiveMinAgo, 'en', now),
    );
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

  it('renders the tee-off time in Oslo wall-clock when timeZone is set (#637)', () => {
    // 08:00 UTC = 10:00 Oslo (CEST). The admin protocol omitted timeZone, so on
    // a UTC server it showed «08:00»; pinning to Europe/Oslo gives «10:00».
    const teeOff = '2026-06-15T08:00:00Z';
    const out = formatDateTime(teeOff, 'no', {
      timeZone: 'Europe/Oslo',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(out).toContain('10:00');
    expect(out).not.toContain('08:00');
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

describe('countdownParts', () => {
  it.each([
    [-1000, { kind: 'soon' }],
    [0, { kind: 'soon' }],
    [45_000, { kind: 'seconds', n: 45 }],
    [59_000, { kind: 'seconds', n: 59 }],
    [60_000, { kind: 'minutes', n: 1 }],
    [45 * 60_000, { kind: 'minutes', n: 45 }],
    [3_600_000, { kind: 'hoursMinutes', h: 1, m: 0 }],
    [(2 * 60 + 14) * 60_000, { kind: 'hoursMinutes', h: 2, m: 14 }],
    [36 * 60 * 60_000, { kind: 'days', n: 1 }],
    [4 * 24 * 60 * 60_000, { kind: 'days', n: 4 }],
  ] as const)('classifies %s ms', (ms, expected) => {
    expect(countdownParts(ms)).toEqual(expected);
  });
});

// Renders the countdown via the message catalog (the production path) and
// proves the `no` strings are byte-identical to the legacy formatCountdown
// helper, while `en` renders idiomatic English — no hardcoded prose in the TS.
describe('countdown catalog render', () => {
  const NS = 'game.waitingRoom.countdown';
  const noT = createTranslator({
    locale: 'no',
    messages: noMessages,
    namespace: NS,
    timeZone: 'Europe/Oslo',
  });
  const enT = createTranslator({
    locale: 'en',
    messages: enMessages,
    namespace: NS,
    timeZone: 'Europe/Oslo',
  });

  function render(t: typeof noT, ms: number): string {
    const p = countdownParts(ms);
    switch (p.kind) {
      case 'soon':
        return t('soon');
      case 'seconds':
        return t('seconds', { n: p.n });
      case 'minutes':
        return t('minutes', { n: p.n });
      case 'hoursMinutes':
        return t('hoursMinutes', { h: p.h, m: p.m });
      case 'days':
        return t('days', { n: p.n });
    }
  }

  it.each([
    [-1000],
    [0],
    [45_000],
    [60_000],
    [45 * 60_000],
    [3_600_000],
    [(2 * 60 + 14) * 60_000],
    [4 * 24 * 60 * 60_000],
    [36 * 60 * 60_000],
    [86_400_000],
  ])('no render == legacy formatCountdown (%s ms)', (ms) => {
    expect(render(noT, ms)).toBe(formatCountdown(ms));
  });

  it('en renders idiomatic English', () => {
    expect(render(enT, 0)).toBe('Starting soon');
    expect(render(enT, 45_000)).toBe('Starting in 45s');
    expect(render(enT, 45 * 60_000)).toBe('Starting in 45 min');
    expect(render(enT, (2 * 60 + 14) * 60_000)).toBe('Starting in 2h 14 min');
    expect(render(enT, 36 * 60 * 60_000)).toBe('Starting in 1 day');
    expect(render(enT, 4 * 24 * 60 * 60_000)).toBe('Starting in 4 days');
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

  it('accepts a Date input as well as an ISO string (#637/#646)', () => {
    // The Klubbhuset greeting passes `new Date()` directly; admin surfaces pass
    // ISO strings. Both must read the Oslo wall-clock date.
    expect(formatShortOsloDayMonthLocale(new Date('2026-06-14T23:32:00Z'), 'no')).toBe(
      '15. jun',
    );
    expect(formatShortOsloDayMonthLocale(new Date('2026-06-14T23:32:00Z'), 'en')).toBe(
      '15 Jun',
    );
  });

  it('rolls to the Oslo date in the ~22:00–24:00 window (#646 regression)', () => {
    // 2026-06-14T23:32:00Z === 01:32 Oslo on 15 Jun. The UTC-reading legacy
    // helper would say «14. jun»; the Oslo variant must say «15. jun».
    expect(formatShortOsloDayMonthLocale('2026-06-14T23:32:00Z', 'no')).toBe('15. jun');
  });
});

describe('formatHHMMOslo (#646)', () => {
  it('renders 24h HH:MM in Oslo time (summer, CEST +02:00)', () => {
    // 08:00 UTC = 10:00 Oslo. The activity log read UTC before the fix.
    expect(formatHHMMOslo('2026-06-15T08:00:00Z')).toBe('10:00');
  });

  it('renders 24h HH:MM in Oslo time (winter, CET +01:00)', () => {
    expect(formatHHMMOslo('2026-01-15T08:00:00Z')).toBe('09:00');
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(formatHHMMOslo(new Date('2026-06-15T08:00:00Z'))).toBe('10:00');
  });

  it('reads the Oslo wall-clock just past UTC midnight', () => {
    // 23:32 UTC = 01:32 Oslo next day.
    expect(formatHHMMOslo('2026-06-14T23:32:00Z')).toBe('01:32');
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

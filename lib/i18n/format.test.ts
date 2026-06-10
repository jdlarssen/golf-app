import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  intlLocaleTag,
} from './format';

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

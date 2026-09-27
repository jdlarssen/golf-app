import { describe, it, expect } from 'vitest';
import type { AppLocale } from '@/i18n/routing';
import { formatPoints } from './formatPoints';

describe('formatPoints', () => {
  it.each<[number, AppLocale, string]>([
    [0, 'no', '0'],
    [1, 'no', '1'],
    [0.5, 'no', '0,5'],
    [2.5, 'no', '2,5'],
    [12, 'no', '12'],
    // #2240: English UI got the Norwegian comma before the locale was passed in.
    [2.5, 'en', '2.5'],
    [12, 'en', '12'],
  ])('%d (%s) → %s', (input, locale, expected) => {
    expect(formatPoints(input, locale)).toBe(expected);
  });
});

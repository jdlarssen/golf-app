import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';
import enMessages from '@/messages/en.json';
import noMessages from '@/messages/no.json';
import { mergeMessages } from '@/lib/i18n/messages';
import { CLAIM_DISTANCE_MIN_M } from '@/lib/games/sideContest';
import { formatDistance, stepDistance } from './sideContestText';

// #2283 (part D3) — Type A: the distance steps and the number format, and a
// guard that every message of the row and sheet formats in both catalogs (an
// ICU slip, such as an apostrophe before a brace, would otherwise show up as a
// raw key on the hole).

describe('stepDistance', () => {
  it('goes in half metres, and + from an empty field is the first step', () => {
    expect(stepDistance(null, 1)).toBe(0.5);
    expect(stepDistance(0.5, 1)).toBe(1);
    expect(stepDistance(2.5, -1)).toBe(2);
    expect(stepDistance(11.5, 1)).toBe(12);
  });

  it('− from an empty field does nothing', () => {
    expect(stepDistance(null, -1)).toBeNull();
  });

  it('stays on the 0,1–99,9 grid and does not drift', () => {
    // 0,5 − 0,5 would be 0, which the rpc refuses.
    expect(stepDistance(0.5, -1)).toBeNull();
    expect(stepDistance(0.3, -1)).toBeNull();
    expect(stepDistance(99.9, 1)).toBeNull();
    expect(stepDistance(99, 1)).toBe(99.5);
    expect(stepDistance(99.5, 1)).toBeNull();
    // A run of taps on an off-grid start rounds to one decimal.
    expect(stepDistance(0.1 + 0.2, 1)).toBe(0.8);
    expect(stepDistance(1, -1)).toBe(0.5);
    expect(stepDistance(0.5, -1) ?? CLAIM_DISTANCE_MIN_M).toBeGreaterThanOrEqual(CLAIM_DISTANCE_MIN_M);
  });
});

describe('formatDistance', () => {
  it('has one decimal and the locale’s separator', () => {
    expect(formatDistance(2.5, 'no')).toBe('2,5');
    expect(formatDistance(2, 'no')).toBe('2,0');
    expect(formatDistance(11.5, 'no')).toBe('11,5');
    expect(formatDistance(2.5, 'en')).toBe('2.5');
  });
});

describe('the catalogs of the row and the sheet', () => {
  const PARAMS = {
    group: 'flighten',
    hole: 7,
    points: '1,5',
    name: 'Tore',
    distance: '2,5',
    unit: 'm',
    hits: 2,
    balls: 4,
    max: 2,
  };

  function leaves(obj: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([key, value]) =>
      value !== null && typeof value === 'object'
        ? leaves(value as Record<string, unknown>, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    );
  }

  it.each([
    ['no', noMessages],
    ['en', mergeMessages(noMessages as never, enMessages as never)],
  ])('%s: every message formats, and none keeps a brace', (locale, messages) => {
    const errors: string[] = [];
    for (const namespace of ['holes.sideContest', 'holes.girContest']) {
      const t = createTranslator<never, never>({
        locale,
        messages: messages as never,
        namespace: namespace as never,
        onError: (error: { message: string }) => errors.push(`${namespace}: ${error.message}`),
      } as never) as unknown as (key: string, values?: Record<string, unknown>) => string;
      const node = namespace.split('.').reduce<Record<string, unknown>>(
        (acc, part) => acc[part] as Record<string, unknown>,
        messages as unknown as Record<string, unknown>,
      );
      for (const key of leaves(node)) {
        const text = t(key, PARAMS);
        expect(text, `${namespace}.${key}`).not.toMatch(/[{}]/);
        expect(text.trim(), `${namespace}.${key}`).not.toBe('');
      }
    }
    expect(errors).toEqual([]);
  });
});

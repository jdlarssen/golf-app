import { describe, expect, it } from 'vitest';
import type { GameMode } from '@/lib/scoring/modes/types';
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';
import { wholeNumber } from '@/lib/__tests__/copyNumbers';
import { START_COUNT_RANGES, type StartCountMode } from '@/lib/games/startPlayerCount';
import { maxTeamsForSize, teamSizesForMode } from '@/lib/games/teamFormatLimits';

// Copy-parity for the format guide (#2274): every sentence that says how many
// can play, or which team sizes a format has, must name the limits the app
// enforces. The numbers come from their homes, so the next limit change turns
// this red instead of leaving stale copy behind. Numbers and keys only, never
// wording.

const LOCALES = { no: noMessages, en: enMessages } as const;
type Locale = keyof typeof LOCALES;

const NUMBER_WORDS: Record<Locale, Record<number, string>> = {
  no: { 2: 'to', 3: 'tre', 4: 'fire', 5: 'fem', 16: 'seksten' },
  en: { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 16: 'sixteen' },
};

/** Does `text` state `n`, as a whole number or as a number word? */
function mentions(text: string, n: number, locale: Locale): boolean {
  if (wholeNumber(n).test(text)) return true;
  const word = NUMBER_WORDS[locale][n];
  return word !== undefined && new RegExp(`(?<![\\p{L}-])${word}(?![\\p{L}-])`, 'iu').test(text);
}

/** `n` as a regex alternative: its digits or its number word. */
function numberPattern(n: number, locale: Locale): string {
  const word = NUMBER_WORDS[locale][n];
  return word === undefined ? String(n) : `(?:${n}|${word})`;
}

const LIMIT_WORDS: Record<Locale, { range: string; upTo: string; players: string }> = {
  no: { range: 'til', upTo: 'opptil', players: 'spillere' },
  en: { range: 'to', upTo: 'up\\s+to', players: 'players' },
};

/**
 * The phrase that states a limit: «2 til 16» / «three to five» for a range,
 * «opptil 16» / «up to 16» for a cap, «fire spillere» / «four players» for a
 * fixed count. Matching the phrase, not each number on its own, keeps a
 * recommendation in the same text («Fire er best») from passing for a limit.
 */
function limitPattern(kind: 'span' | 'max', min: number, max: number, locale: Locale): RegExp {
  const w = LIMIT_WORDS[locale];
  const body =
    kind === 'max'
      ? `${w.upTo}\\s+${numberPattern(max, locale)}`
      : min === max
        ? `${numberPattern(min, locale)}\\s+${w.players}`
        : `${numberPattern(min, locale)}\\s+${w.range}\\s+${numberPattern(max, locale)}`;
  return new RegExp(`(?<![\\p{L}\\d])${body}(?![\\p{L}\\d])`, 'iu');
}

function lookup(messages: unknown, path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], messages);
  if (typeof value !== 'string') throw new Error(`no message at ${path}`);
  return value;
}

const guide = (mode: string, path: string) => `formatGuide.content.${mode}.${path}`;

const locales = Object.keys(LOCALES) as Locale[];

describe('format guide player counts follow START_COUNT_RANGES (#2274)', () => {
  // 'span' states the range (a fixed count when min equals max);
  // 'max' answers «can more play?» and states the cap.
  const rows: [StartCountMode, string, 'span' | 'max'][] = [
    ['wolf', 'summary', 'span'],
    ['wolf', 'sections.0.body', 'span'],
    ['wolf', 'faq.0.a', 'span'],
    ['bingo_bango_bongo', 'sections.3.body', 'span'],
    ['bingo_bango_bongo', 'faq.3.a', 'span'],
    ['skins', 'faq.1.a', 'span'],
    ['nassau', 'faq.3.a', 'max'],
    ['nines', 'summary', 'span'],
    ['round_robin', 'summary', 'span'],
    ['acey_deucey', 'summary', 'span'],
  ];
  const cases = locales.flatMap((locale) =>
    rows.map(([mode, path, kind]) => [locale, mode, path, kind] as const),
  );

  it.each(cases)('%s %s.%s states the %s', (locale, mode, path, kind) => {
    const text = lookup(LOCALES[locale], guide(mode, path));
    const { min, max } = START_COUNT_RANGES[mode];
    expect(text).toMatch(limitPattern(kind, min, max, locale));
  });

  it.each(locales)('%s best_ball.sections.0.body names the pair cap', (locale) => {
    const text = lookup(LOCALES[locale], guide('best_ball', 'sections.0.body'));
    expect(text).toMatch(limitPattern('max', 0, maxTeamsForSize(2), locale));
  });
});

describe('format guide team sizes follow teamSizesForMode (#2274)', () => {
  const rows: [GameMode, string][] = [
    ['texas_scramble', 'sections.0.body'],
    ['texas_scramble', 'sections.2.body'],
    ['texas_scramble', 'faq.0.a'],
    ['texas_scramble', 'faq.2.a'],
    ['florida_scramble', 'summary'],
  ];
  const cases = locales.flatMap((locale) =>
    rows.map(([mode, path]) => [locale, mode, path] as const),
  );

  it.each(cases)('%s %s.%s names every team size', (locale, mode, path) => {
    const text = lookup(LOCALES[locale], guide(mode, path));
    for (const size of teamSizesForMode(mode)) {
      expect(mentions(text, size, locale), `${size} missing in «${text}»`).toBe(true);
    }
  });
});

describe('game form team handicap help has a text per team size (#2274)', () => {
  // GameForm builds the key `wizard.form.teamHandicap.<prefix>Netto<size>`
  // from the team size, so tsc fails if a key it can build is missing. This
  // table adds the other half: every size the format offers has its text.
  const modes: [GameMode, string][] = [
    ['texas_scramble', 'texas'],
    ['ambrose', 'ambrose'],
    ['florida_scramble', 'florida'],
  ];
  const sizeLabel: Record<Locale, (n: number) => string> = {
    no: (n) => `${n}-mannslag`,
    en: (n) => `${n}-player`,
  };
  const cases = locales.flatMap((locale) =>
    modes.flatMap(([mode, prefix]) =>
      teamSizesForMode(mode).map((size) => [locale, mode, size, prefix] as const),
    ),
  );

  it.each(cases)('%s %s, team size %i', (locale, _mode, size, prefix) => {
    const text = lookup(LOCALES[locale], `wizard.form.teamHandicap.${prefix}Netto${size}`);
    expect(text).toContain(sizeLabel[locale](size));
  });
});

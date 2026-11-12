import type { ShareCardModel, ShareCardScore } from '@/lib/games/buildShareCardData';
import { isUnplacedLeagueCard } from '@/lib/games/finishedResultBadge';

import { firstName } from './shareCardLayout';

/**
 * What the result card's headline says, decided from the model alone (#2319).
 * The route turns it into words with next-intl (`leaderboard.shareCard`), so
 * the rules for who is named and which wording applies live here, testable.
 */
export type HeadlineSpec =
  | { kind: 'won'; names: string[]; result: ShareCardScore }
  | { kind: 'shared'; names: string[]; result: ShareCardScore }
  /** A shared win with too many names for the headline: «Delt seier med …». */
  | { kind: 'sharedMany'; result: ShareCardScore }
  | { kind: 'matchWon'; names: string[]; margin: string }
  | { kind: 'tied' }
  | { kind: 'finished' }
  /** #2712: a league flight has no place and no win. */
  | { kind: 'approved' };

/** More first names than this in a shared win makes the headline «Delt seier …». */
export const MAX_SHARED_NAMES = 4;

/**
 * First names for a headline. When two of them are the same («Ole» and «Ole»),
 * those members keep their public name («Ole H.», «Ole B.») so the headline
 * says who is who.
 */
function headlineNames(memberNames: readonly string[]): string[] {
  const count = new Map<string, number>();
  for (const m of memberNames) {
    const key = firstName(m).toLocaleLowerCase();
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return memberNames.map((m) =>
    (count.get(firstName(m).toLocaleLowerCase()) ?? 0) > 1 ? m : firstName(m),
  );
}

export function headlineSpec(
  model: ShareCardModel | null,
  opts: { leagueFlight?: boolean } = {},
): HeadlineSpec {
  if (model === null) return { kind: 'finished' };
  if (isUnplacedLeagueCard(model, opts.leagueFlight ?? false)) return { kind: 'approved' };

  if (model.band === 'matchplay') {
    const match = model.match;
    if (!match) return { kind: 'finished' };
    switch (match.headline.kind) {
      case 'winner': {
        const winner = match.sides.find((s) => s.won);
        if (!winner) return { kind: 'finished' };
        return {
          kind: 'matchWon',
          names: headlineNames(winner.memberNames),
          margin: match.headline.margin,
        };
      }
      case 'tied':
        return { kind: 'tied' };
      case 'undecided':
        return { kind: 'finished' };
    }
  }

  // A skins round nobody won has no winners: the neutral headline.
  if (model.winners.length === 0) return { kind: 'finished' };

  const result = model.winners[0].score;
  const names = headlineNames(model.winners.flatMap((w) => w.memberNames));
  if (model.winners.length === 1) return { kind: 'won', names, result };
  if (names.length > MAX_SHARED_NAMES) return { kind: 'sharedMany', result };
  return { kind: 'shared', names, result };
}

/**
 * A count worded by `format`, with a real minus sign (U+2212) when negative.
 * The ICU number format gives a hyphen-minus in English, and the figure in the
 * row uses the real sign, so the headline sets it itself.
 */
export function signedCount(value: number, format: (abs: number) => string): string {
  return `${value < 0 ? '\u2212' : ''}${format(Math.abs(value))}`;
}

/** The `leaderboard.shareCard` keys `resultWords` reads, with their values. */
export type ShareResultT = (
  key: 'points' | 'skins' | 'par',
  values?: Record<string, string | number>,
) => string;

/**
 * The result as the headline words it: «38 poeng», «6 skins», «−4», «par».
 * A points game always says its points (#2738). `at` picks the «vant på»
 * wording over «vant med».
 */
export function resultWords(score: ShareCardScore, t: ShareResultT): { text: string; at: boolean } {
  switch (score.kind) {
    case 'points':
      return { text: signedCount(score.value, (n) => t('points', { n })), at: false };
    case 'skins':
      return { text: t('skins', { n: score.value }), at: false };
    case 'vsPar':
      return { text: score.label === 'E' ? t('par') : score.label, at: true };
  }
}

/** The number in a row: just the figure, locale-neutral («38», «−4», «6»). */
export function scoreFigure(score: ShareCardScore): string {
  switch (score.kind) {
    case 'points':
    case 'skins':
      return signedCount(score.value, String);
    case 'vsPar':
      return score.label; // −2 / E / +3
  }
}

/** One word of the headline, marked gold or not. */
export type Word = { text: string; gold: boolean };

/** Joins a run of gold words into one item, so «38 poeng» never splits across lines. */
export function keepGoldTogether(words: Word[]): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (w.gold && last?.gold) last.text += ` ${w.text}`;
    else out.push({ ...w });
  }
  return out;
}

/**
 * The headline's words in lines. A result headline breaks before its
 * preposition, as the artboard does («Marte vant» / «med 38 poeng»); the other
 * headlines run as one block that wraps on width.
 */
export function headlineWordLines(words: Word[], spec: HeadlineSpec): Word[][] {
  const resultHeadline =
    spec.kind === 'won' || spec.kind === 'shared' || spec.kind === 'sharedMany';
  const gold = words.findIndex((w) => w.gold);
  if (!resultHeadline || gold < 1) return [words];
  return [words.slice(0, gold - 1), words.slice(gold - 1)];
}

/** The lines as one string, «\n» between them, for `headlineLayout`. */
export function lineText(lines: Word[][]): string {
  return lines.map((line) => line.map((w) => w.text).join(' ')).join('\n');
}

/**
 * The date on the card's meta line, in Oslo time. `locale` is a BCP 47 tag.
 * `null` when the date is missing or unreadable: the line then leaves it out.
 */
export function osloDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'Europe/Oslo',
      day: 'numeric',
      month: 'long',
      // Satori draws a no-break space wider than a space.
    }).format(new Date(iso)).replace(/\u00a0/g, ' ');
  } catch {
    return null;
  }
}

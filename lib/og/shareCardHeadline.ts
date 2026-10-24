import type { ShareCardModel, ShareCardScore } from '@/lib/games/buildShareCardData';

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
  | { kind: 'finished' };

/** More first names than this in a shared win makes the headline «Delt seier …». */
const MAX_SHARED_NAMES = 4;

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

export function headlineSpec(model: ShareCardModel | null): HeadlineSpec {
  if (model === null) return { kind: 'finished' };

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
  key: 'points' | 'skins' | 'par' | 'pointsVsPar',
  values?: Record<string, string | number>,
) => string;

/**
 * The result as the headline words it: «38 poeng», «6 skins», «−4», «par»,
 * and (#2625) «+3 mot par» for points against par pace, where «+» is the good
 * side, so a bare «+3» would read as three over par. A player without a hole
 * has no number: «—» stands alone, as in the round report's facts. `at` picks
 * the «vant på» wording over «vant med».
 */
export function resultWords(score: ShareCardScore, t: ShareResultT): { text: string; at: boolean } {
  switch (score.kind) {
    case 'points':
      return { text: signedCount(score.value, (n) => t('points', { n })), at: false };
    case 'skins':
      return { text: t('skins', { n: score.value }), at: false };
    case 'vsPar':
      return { text: score.label === 'E' ? t('par') : score.label, at: true };
    case 'pointsVsPar':
      if (score.label === '—') return { text: score.label, at: true };
      return { text: score.label === 'E' ? t('par') : t('pointsVsPar', { label: score.label }), at: true };
  }
}

/** The number in a row: just the figure, locale-neutral («38», «−4», «6»). */
export function scoreFigure(score: ShareCardScore): string {
  switch (score.kind) {
    case 'points':
    case 'skins':
      return signedCount(score.value, String);
    case 'vsPar':
    case 'pointsVsPar':
      return score.label; // −2 / E / +3
  }
}

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
          names: winner.memberNames.map(firstName),
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
  const names = model.winners.flatMap((w) => w.memberNames.map(firstName));
  if (model.winners.length === 1) return { kind: 'won', names, result };
  if (names.length > MAX_SHARED_NAMES) return { kind: 'sharedMany', result };
  return { kind: 'shared', names, result };
}

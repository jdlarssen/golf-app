import type { ShareCardModel, ShareCardRow } from '@/lib/games/buildShareCardData';

import { scoreFigure } from './shareCardHeadline';
import { rowDisplayName } from './shareCardLayout';

/**
 * The rows of the result card (#2319), before they are drawn. The web's PNG
 * route and the app's drawing of the same card (#2756) read them from here, so
 * who gets a medallion, a figure and gold has one home.
 */
export type CardRow = {
  /** The rank printed in the medallion; null for a matchplay side. */
  rank: number | null;
  name: string;
  /** The figure on the right; null on a losing or halved matchplay side. */
  figure: string | null;
  winner: boolean;
};

/** `alone` (#2712): a league round played alone, so no medallion and no gold. */
export function placementRows(model: ShareCardModel, alone: boolean): CardRow[] {
  const winnerRank = model.winners.length > 0 && !alone ? model.winners[0].rank : null;
  return model.podium.slice(0, 3).map((r: ShareCardRow) => ({
    rank: alone ? null : r.rank,
    name: rowDisplayName(r.memberNames),
    figure: scoreFigure(r.score),
    winner: winnerRank !== null && r.rank === winnerRank,
  }));
}

export function matchRows(model: ShareCardModel): CardRow[] {
  const match = model.match;
  if (!match) return [];
  const margin = match.headline.kind === 'winner' ? match.headline.margin : null;
  return match.sides.map((side) => ({
    rank: null,
    name: rowDisplayName(side.memberNames),
    figure: side.won ? margin : null,
    winner: side.won,
  }));
}

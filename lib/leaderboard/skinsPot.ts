// The skins pot (#2317): how many skins are at stake now and on which hole,
// and what each hole's coin on «Hull for hull» shows.
//
// Pure code like `liveBoard.ts`: no React, no translations. The web's
// `SkinsView` and the app's `PotViews` both read it. Everything comes from the
// rows `lib/scoring/modes/skins.ts` already built, so nothing is recomputed:
// skins are decided in hole order and need a score from everyone, so the pot
// can never move past the first undecided hole. That hole is the same for the
// whole game, not one per flight.

import type { SkinsHoleRow } from '@/lib/scoring/modes/types';

export type SkinsPotNow =
  | {
      kind: 'pending';
      holeNumber: number;
      atStake: number;
      /** The halved holes right before, whose skins rolled into this one. */
      carriedFrom: number[];
      /** Someone has entered the hole, but not everyone. */
      waiting: boolean;
    }
  | { kind: 'settled'; hanging: number };

export type CoinState = 'won' | 'potWon' | 'carried' | 'current' | 'future';

/**
 * The pot stands on the first pending hole. With every hole decided it is
 * settled, and `hanging` is the scoring module's raw `carriedPot` (skins left
 * when the last played hole was halved).
 */
export function skinsPotNow(holes: SkinsHoleRow[], carriedPot: number): SkinsPotNow {
  const index = holes.findIndex((h) => h.outcome === 'pending');
  if (index === -1) return { kind: 'settled', hanging: carriedPot };

  const hole = holes[index];
  const carriedFrom: number[] = [];
  for (let i = index - 1; i >= 0 && holes[i].outcome === 'carryover'; i--) {
    carriedFrom.unshift(holes[i].holeNumber);
  }
  return {
    kind: 'pending',
    holeNumber: hole.holeNumber,
    atStake: hole.atStake,
    carriedFrom,
    waiting: hole.perPlayer.some((p) => p.gross != null),
  };
}

/**
 * A won hole that had skins rolled in is a won pot (the gold ring). Only the
 * hole the pot stands on is `current`; the later pending holes are `future`.
 */
export function coinState(hole: SkinsHoleRow, currentHoleNumber: number | null): CoinState {
  if (hole.outcome === 'won') return hole.carriedIn > 0 ? 'potWon' : 'won';
  if (hole.outcome === 'carryover') return 'carried';
  return hole.holeNumber === currentHoleNumber ? 'current' : 'future';
}

/** Rows of nine coins: one row for a 9-hole round (also the back nine), two for 18. */
export function coinRows(holes: SkinsHoleRow[]): SkinsHoleRow[][] {
  const rows: SkinsHoleRow[][] = [];
  for (let i = 0; i < holes.length; i += 9) rows.push(holes.slice(i, i + 9));
  return rows;
}

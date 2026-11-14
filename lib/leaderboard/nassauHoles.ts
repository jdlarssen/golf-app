// #2755: Nassau «Hull for hull» (the app's B3 artboard, `Nassau-hull-B3-*`):
// the three matches hole by hole — who won each hole, the hole the match's
// winner went alone in the lead from and kept it out the match, and the
// standing after any hole. Pure code, next to `nassauBoard.ts`, so the app
// draws the same numbers as the board.
//
// It reads the engine's result and never changes it (`lib/scoring/modes/
// nassau.ts`). The standing after a hole is the sum of the match's holes so
// far, on the engine's rule for an unplayed hole: `net_total` pads it with
// `UNPLAYED_PADDING`, `net_to_par` counts it par once the player has played a
// hole of the match so far, and pads it before. Only the sum decides — no
// countback — so a match won on countback has no «alone from» hole: the
// winner was never alone on the sum at the end.

import type { NassauHolePlayerCell, NassauResult } from '@/lib/scoring/modes/types';
import { UNPLAYED_PADDING } from '@/lib/scoring/tiebreaker';
import { comparableGap } from './liveBoard';
import { NASSAU_SECTION_KEYS, summarizeNassau, type NassauSectionKey } from './nassauBoard';
import { nassauHoleCardRows } from './nassauHoleCard';
import type { teamHeadline } from './vsPar';

export interface NassauStanding {
  /** The players on the lowest sum: one leads alone, more share the lead. */
  leaderUserIds: string[];
  /**
   * Strokes ahead of number two when one leads alone and the two compare
   * (`comparableGap`), else `null`.
   */
  lead: number | null;
}

export interface NassauMatch {
  key: NassauSectionKey;
  /** `won`: one winner. `tied`: a push. `none`: nobody won (not played to the end). */
  outcome: 'won' | 'tied' | 'none';
  /** The board's winners of the finished match (`summarizeNassau`). */
  winnerUserIds: string[];
  /** The sum the board leads the winner's row with («33», «-2»), or `null` without one. */
  headline: ReturnType<typeof teamHeadline> | null;
  /** The hole the winner went alone in the lead from, out the match (`nassauAloneFrom`). */
  aloneFrom: number | null;
}

export interface NassauHoleCard {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  section: 'front9' | 'back9';
  /** From the engine's `bestUserIds`: one is a win, more a tie, none nobody played it. */
  outcome: 'won' | 'tied' | 'unplayed';
  winnerUserId: string | null;
  /** Best first, unplayed last (`nassauHoleCardRows`). */
  rows: NassauHolePlayerCell[];
  /** The standing in the hole's match (front 9 or back 9) after the hole. */
  sectionStanding: NassauStanding | null;
  /** The standing in the total after the hole. */
  totalStanding: NassauStanding | null;
}

export interface NassauHoleCards {
  scoring: NassauResult['scoring'];
  ranking: NassauResult['ranking'];
  matches: Record<NassauSectionKey, NassauMatch>;
  holes: NassauHoleCard[];
  /** The hole the hole card opens on. */
  startHoleNumber: number;
}

interface PlayerSoFar {
  userId: string;
  /** What the lead is decided on: the sum with the engine's padding. */
  measure: number;
  /** The comparable sum (`comparableGap`): net strokes played, or to par; `null` without a hole. */
  total: number | null;
  holesPlayed: number;
}

/**
 * The standing in a match after `holeNumber`: the players on the lowest sum
 * over the match's holes up to it. `null` when the hole is not in the match,
 * or nobody has played a hole of the match so far.
 */
export function nassauStandingAfter(
  result: NassauResult,
  section: NassauSectionKey,
  holeNumber: number,
): NassauStanding | null {
  const { holeNumbers, players } = result.sections[section];
  if (!holeNumbers.includes(holeNumber)) return null;
  const holes = result.holes.filter((h) => holeNumbers.includes(h.holeNumber) && h.holeNumber <= holeNumber);
  const toPar = result.ranking === 'net_to_par';

  const soFar: PlayerSoFar[] = players.map(({ userId }) => {
    const cells = holes.map((h) => h.perPlayer.find((c) => c.userId === userId));
    const played = cells.filter((c) => c?.effective != null);
    const holesPlayed = played.length;
    if (toPar) {
      const total = played.reduce((sum, c) => sum + (c?.toPar ?? 0), 0);
      return {
        userId,
        measure: cells.reduce((sum, c) => sum + (c?.toPar ?? (holesPlayed > 0 ? 0 : UNPLAYED_PADDING)), 0),
        total: holesPlayed > 0 ? total : null,
        holesPlayed,
      };
    }
    return {
      userId,
      measure: cells.reduce((sum, c) => sum + (c?.effective ?? UNPLAYED_PADDING), 0),
      total: holesPlayed > 0 ? played.reduce((sum, c) => sum + (c?.effective ?? 0), 0) : null,
      holesPlayed,
    };
  });
  if (soFar.every((p) => p.holesPlayed === 0)) return null;

  const best = Math.min(...soFar.map((p) => p.measure));
  const leaders = soFar.filter((p) => p.measure === best);
  const others = soFar.filter((p) => p.measure !== best).sort((a, b) => a.measure - b.measure);
  const runnerUp = others[0];
  const lead =
    leaders.length === 1 && runnerUp
      ? comparableGap(toPar ? 'toPar' : 'net', leaders[0], runnerUp)
      : null;
  return { leaderUserIds: leaders.map((p) => p.userId), lead };
}

/**
 * The first hole from which the match's one winner led alone on every hole
 * out the match. `null` for a push, a match without a winner, and a match won
 * on countback.
 */
export function nassauAloneFrom(result: NassauResult, section: NassauSectionKey): number | null {
  const { holeNumbers, winnerUserIds } = result.sections[section];
  if (winnerUserIds.length !== 1) return null;
  const winner = winnerUserIds[0];
  let from: number | null = null;
  for (const holeNumber of [...holeNumbers].reverse()) {
    const standing = nassauStandingAfter(result, section, holeNumber);
    if (standing?.leaderUserIds.length !== 1 || standing.leaderUserIds[0] !== winner) break;
    from = holeNumber;
  }
  return from;
}

/**
 * The model the app's Nassau «Hull for hull» draws, for a finished round.
 *
 * The hole card opens where the viewer went alone in the lead in a match they
 * won (the biggest of them: the total before the back 9 before the front 9),
 * else where the total's winner did, else on the first hole.
 */
export function nassauHoleCards(
  result: NassauResult,
  opts: { viewerUserId: string | null },
): NassauHoleCards {
  const board = summarizeNassau(result, { finished: true, viewerUserId: opts.viewerUserId });
  const match = (key: NassauSectionKey): NassauMatch => {
    const card = board.sections[key];
    const winners = card.leaderUserIds;
    return {
      key,
      outcome: winners.length === 1 ? 'won' : winners.length > 1 ? 'tied' : 'none',
      winnerUserIds: [...winners],
      headline: card.leaderHeadline,
      aloneFrom: nassauAloneFrom(result, key),
    };
  };
  const matches: Record<NassauSectionKey, NassauMatch> = {
    front9: match('front9'),
    back9: match('back9'),
    total18: match('total18'),
  };

  const holes: NassauHoleCard[] = result.holes.map((h) => ({
    holeNumber: h.holeNumber,
    par: h.par,
    strokeIndex: h.strokeIndex,
    section: h.section,
    outcome: h.bestUserIds.length === 1 ? 'won' : h.bestUserIds.length > 1 ? 'tied' : 'unplayed',
    winnerUserId: h.bestUserIds.length === 1 ? h.bestUserIds[0] : null,
    rows: nassauHoleCardRows(h.perPlayer, result.ranking),
    sectionStanding: nassauStandingAfter(result, h.section, h.holeNumber),
    totalStanding: nassauStandingAfter(result, 'total18', h.holeNumber),
  }));

  const biggestFirst = [...NASSAU_SECTION_KEYS].reverse();
  const viewersOwn = biggestFirst
    .map((key) => matches[key])
    .find(
      (m) => m.outcome === 'won' && m.winnerUserIds[0] === opts.viewerUserId && m.aloneFrom !== null,
    );
  const startHoleNumber =
    viewersOwn?.aloneFrom ?? matches.total18.aloneFrom ?? holes[0]?.holeNumber ?? 1;

  return { scoring: result.scoring, ranking: result.ranking, matches, holes, startHoleNumber };
}

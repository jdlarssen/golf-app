// Nassau-tavla (#2327): the three matches — front 9, back 9 and the total —
// as three cards. Pure code — no React, next-intl or server imports — so the
// web board and, later, the app (native/app) read the same summary.
//
// It never ranks by itself. Ranks, ties and winners come from the scoring
// engine (`lib/scoring/modes/nassau.ts`); this only decides what each card
// says about them. One rule differs from the engine on purpose: the engine
// names a winner as soon as one player has completed a match (units and the
// settlement count it), while the card calls a match decided only when every
// player has completed it, or the game is finished. Until then it has a
// leader and no winner.

import type { NassauResult, NassauSection, NassauSectionLine } from '@/lib/scoring/modes/types';
import { comparableGap, gapToLead, type LiveBoardUnit } from './liveBoard';
import { teamHeadline } from './vsPar';

export type NassauSectionKey = 'front9' | 'back9' | 'total18';

/** The cards' order on the screen, and the order a sweep looks for its open match in. */
export const NASSAU_SECTION_KEYS: readonly NassauSectionKey[] = ['front9', 'back9', 'total18'];

/**
 * `waiting`: nobody has played a hole of the match. `live`: under way, with a
 * leader. `decided`: every player has played all its holes, or the game is
 * finished (also when nobody played the match: it then has no winner).
 */
export type NassauCardState = 'waiting' | 'live' | 'decided';

export interface NassauViewerLine {
  rank: number;
  tied: boolean;
  /** Strokes behind the lead, or `null` when leading or not comparable (`gapToLead`). */
  gap: number | null;
  /** Strokes ahead of number two when leading alone and comparable, else `null`. */
  lead: number | null;
}

export interface NassauCardSummary {
  key: NassauSectionKey;
  state: NassauCardState;
  /** Holes played by the player who has come furthest in the match. */
  holesDone: number;
  holesTotal: number;
  /**
   * `decided`: the winners — one is a win, more is a tie, none is no winner.
   * `live`: the players ranked 1. `waiting`: empty.
   */
  leaderUserIds: string[];
  /** What the leader's row leads with («33», «−2»), or `null` without a leader. */
  leaderHeadline: ReturnType<typeof teamHeadline> | null;
  /** `null` when the viewer has no row in the match, or the match is waiting. */
  viewer: NassauViewerLine | null;
}

export interface NassauSweep {
  /** The one player who has won every decided match alone. */
  userId: string;
  /** The first match not yet decided — where the sweep can still be stopped. */
  openSection: NassauSectionKey;
}

export interface NassauBoardSummary {
  sections: Record<NassauSectionKey, NassauCardSummary>;
  /** The card selected when the board opens. */
  defaultSection: NassauSectionKey;
  sweep: NassauSweep | null;
}

export function summarizeNassau(
  result: NassauResult,
  opts: { finished: boolean; viewerUserId: string | null },
): NassauBoardSummary {
  const unit: LiveBoardUnit = result.ranking === 'net_to_par' ? 'toPar' : 'net';
  const card = (key: NassauSectionKey) =>
    summarizeSection(key, result.sections[key], result.ranking, unit, opts);
  const sections: Record<NassauSectionKey, NassauCardSummary> = {
    front9: card('front9'),
    back9: card('back9'),
    total18: card('total18'),
  };
  return {
    sections,
    defaultSection: defaultSection(sections),
    sweep: sweepOf(sections),
  };
}

function summarizeSection(
  key: NassauSectionKey,
  section: NassauSection,
  ranking: NassauResult['ranking'],
  unit: LiveBoardUnit,
  opts: { finished: boolean; viewerUserId: string | null },
): NassauCardSummary {
  const holesTotal = section.holeNumbers.length;
  const holesDone = Math.max(0, ...section.players.map((p) => p.holesPlayed));
  // A finished game decides every match, also one nobody got to: it ends
  // without a winner rather than «not started».
  const state: NassauCardState = opts.finished
    ? 'decided'
    : holesDone === 0
      ? 'waiting'
      : section.players.every((p) => p.holesPlayed === holesTotal)
        ? 'decided'
        : 'live';

  const leaderUserIds =
    state === 'decided'
      ? [...section.winnerUserIds]
      : state === 'live'
        ? section.players.filter((p) => p.rank === 1).map((p) => p.userId)
        : [];
  const leaderLine = section.players.find((p) => p.userId === leaderUserIds[0]);

  return {
    key,
    state,
    holesDone,
    holesTotal,
    leaderUserIds,
    leaderHeadline: leaderLine
      ? teamHeadline(ranking, { total: leaderLine.totalEffectiveStrokes, toPar: leaderLine.toPar })
      : null,
    viewer: state === 'waiting' ? null : viewerLine(section.players, unit, opts.viewerUserId),
  };
}

function viewerLine(
  lines: readonly NassauSectionLine[],
  unit: LiveBoardUnit,
  viewerUserId: string | null,
): NassauViewerLine | null {
  const meLine = lines.find((l) => l.userId === viewerUserId);
  if (!meLine) return null;
  const row = (l: NassauSectionLine) => ({
    rank: l.rank,
    total: unit === 'toPar' ? l.toPar : l.totalEffectiveStrokes,
    holesPlayed: l.holesPlayed,
  });
  const me = row(meLine);
  const tied = meLine.tiedWith.length > 0;
  const gap = gapToLead(unit, me, lines.filter((l) => l.rank === 1).map(row));
  const runnerUp = lines.find((l) => l.rank > 1);
  const lead =
    meLine.rank === 1 && !tied && runnerUp ? comparableGap(unit, me, row(runnerUp)) : null;
  // A countback can split equal sums: no «0 bak» or «leder med 0».
  return {
    rank: meLine.rank,
    tied,
    gap: gap === 0 ? null : gap,
    lead: lead === 0 ? null : lead,
  };
}

/**
 * The match being played: back 9 while it is under way, else the first of
 * front 9 and back 9 not yet decided, else the total — so a finished game
 * opens on the total.
 */
function defaultSection(sections: Record<NassauSectionKey, NassauCardSummary>): NassauSectionKey {
  if (sections.back9.state === 'live') return 'back9';
  if (sections.front9.state !== 'decided') return 'front9';
  if (sections.back9.state !== 'decided') return 'back9';
  return 'total18';
}

/**
 * One player has won every decided match alone, and at least one match is
 * still open: they can take all three.
 */
function sweepOf(sections: Record<NassauSectionKey, NassauCardSummary>): NassauSweep | null {
  const cards = NASSAU_SECTION_KEYS.map((k) => sections[k]);
  const decided = cards.filter((c) => c.state === 'decided');
  const open = cards.find((c) => c.state !== 'decided');
  if (decided.length === 0 || !open) return null;
  const userId = decided[0].leaderUserIds[0];
  const sweeps = decided.every((c) => c.leaderUserIds.length === 1 && c.leaderUserIds[0] === userId);
  return sweeps ? { userId, openSection: open.key } : null;
}

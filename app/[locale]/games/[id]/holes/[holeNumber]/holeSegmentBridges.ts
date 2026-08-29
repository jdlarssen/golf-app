// Broene mellom de to halvdelene av en splittet cup-dag (#1716 — ren flytting
// ut av `page.tsx`): hvem søskenet er, om vi står i broModus, hvilken lenke
// bunn-CTA-en får, og hvilke hull hull-stripa skal vise fra den andre siden.

import {
  firstHoleForSegment,
  holeNumbersForSegment,
  lastHoleForSegment,
} from '@/lib/games/holeScope';
import {
  findSegmentSibling,
  isSegmentSiblingCandidate,
  type SegmentSibling,
} from '@/lib/games/segmentSibling';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type {
  HoleStripSibling,
  SegmentSiblingLink,
} from './holeClientProps';

/**
 * #1466 (eier-tillegget): resolve the segment sibling for ALL holes of a
 * segment-candidate game — not just the boundary hole — so the hole strip can
 * render the whole 1–18 round «som et helt vanlig scorekort». Only segment
 * cup hosts pay this (2 indexed admin queries via findSegmentSibling); every
 * other game skips the lookup entirely.
 */
export async function resolveSiblingMatch(
  game: GameForHole,
  userId: string,
): Promise<SegmentSibling | null> {
  if (
    !isSegmentSiblingCandidate({
      holeSegment: game.hole_segment,
      sourceGameId: game.source_game_id,
      tournamentId: game.tournament_id,
    })
  ) {
    return null;
  }
  return findSegmentSibling(userId, {
    gameId: game.id,
    holeSegment: game.hole_segment,
    sourceGameId: game.source_game_id,
    tournamentId: game.tournament_id,
  });
}

export type SegmentBridges = {
  /**
   * #1466 §2: broModus = front9 host + sibling exists + my back9 row is still
   * undelivered. When true the front9 bottom CTA becomes the bridge to hole 10
   * instead of a deliver-CTA (one delivery for the whole round happens on the
   * back9 host). Self-heals to false when the sibling is delivered — a rejected
   * front9 card after the cascade brings the deliver-CTA back.
   */
  broModus: boolean;
  /**
   * The boundary bridge keeps its existing secondary-link semantics: rendered
   * only at the segment's boundary hole (front9's hole 9, back9's hole 10). In
   * broModus it is promoted to the primary CTA and this secondary link is
   * suppressed (see HoleClient) — otherwise a duplicate bridge on hole 9.
   */
  segmentSibling: SegmentSiblingLink | null;
  /**
   * broModus bridge target: the front9 host's bridge to the sibling's hole 10.
   * Available on ALL front9 holes (roundComplete surfaces the deliver-CTA on
   * every screen), so every «Lever scorekort» occurrence becomes the bridge.
   * Null off broModus.
   */
  broBridge: SegmentSiblingLink | null;
};

export function resolveSegmentBridges(args: {
  game: GameForHole;
  holeNumber: number;
  siblingMatch: SegmentSibling | null;
}): SegmentBridges {
  const { game, holeNumber, siblingMatch } = args;
  const broModus =
    game.hole_segment === 'front9' &&
    siblingMatch != null &&
    siblingMatch.mySubmittedAt == null;

  const isSegmentBoundaryHole =
    (game.hole_segment === 'front9' &&
      holeNumber === lastHoleForSegment('front9')) ||
    (game.hole_segment === 'back9' &&
      holeNumber === firstHoleForSegment('back9'));

  const segmentSibling =
    siblingMatch && isSegmentBoundaryHole
      ? {
          gameId: siblingMatch.gameId,
          gameMode: siblingMatch.gameMode,
          holeNumber:
            siblingMatch.holeSegment === 'back9'
              ? firstHoleForSegment('back9')
              : lastHoleForSegment('front9'),
        }
      : null;

  const broBridge =
    broModus && siblingMatch
      ? {
          gameId: siblingMatch.gameId,
          holeNumber: firstHoleForSegment('back9'),
          gameMode: siblingMatch.gameMode,
        }
      : null;

  return { broModus, segmentSibling, broBridge };
}

/**
 * Strip data: the sibling's own segment holes plus everything needed to read
 * them score-aware, rendered on every hole so the full 1–18 union shows
 * across the two hosts. Null → today's 9-hole strip.
 */
export function buildHoleStripSibling(args: {
  siblingMatch: SegmentSibling | null;
  teamOwnerId: string | null;
  scoredHoles: number[] | null;
}): HoleStripSibling | null {
  const { siblingMatch, teamOwnerId, scoredHoles } = args;
  if (!siblingMatch) return null;
  return {
    gameId: siblingMatch.gameId,
    holes: holeNumbersForSegment(siblingMatch.holeSegment),
    gameMode: siblingMatch.gameMode,
    teamOwnerId,
    scoredHoles,
  };
}

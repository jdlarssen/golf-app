import type { GameMode } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring/holeSegment';

// The pure half of the split-day sibling rules (#1441, #1466), split out of
// `segmentSibling.ts` for #2752. That file reads the database with the admin
// client and is `server-only`; the app needs the same answers on the phone,
// also offline. Nothing here reads anything.

export type SegmentHalf = Extract<HoleSegment, 'front9' | 'back9'>;

export type SegmentSibling = {
  gameId: string;
  gameMode: GameMode;
  holeSegment: SegmentHalf;
  /**
   * #1466: the acting player's own `submitted_at` on the sibling game (null =
   * not yet delivered there). Drives broModus (front9's bridge-as-primary CTA)
   * and the one-delivery cascade's "already delivered?" gate on the back9 host.
   */
  mySubmittedAt: string | null;
  /**
   * #1466: the acting player's `team_number` on the sibling game (null for
   * per-player formats / a player with no team). Drives the team-wide vs
   * own-row form of the one-delivery cascade — a greensome front9 sibling
   * delivers per team (#1453), a best-ball sibling per player.
   */
  myTeamNumber: number | null;
};

/** The wire shape of `GET /api/games/{id}/segment-sibling`. */
export type SegmentSiblingResponse = { sibling: SegmentSibling | null };

const OPPOSITE_HALF: Record<SegmentHalf, SegmentHalf> = {
  front9: 'back9',
  back9: 'front9',
};

/** Pure: the segment a sibling lookup should search for, given the current
 *  game's own segment. Exported for direct unit coverage. */
export function oppositeSegmentHalf(segment: SegmentHalf): SegmentHalf {
  return OPPOSITE_HALF[segment];
}

/**
 * Pure: whether `game` is even eligible to have a segment sibling — a HOST
 * (never a derived match, which has no entry surface at all and is
 * explicitly out of this bridge's scope) with a real half-segment and a
 * tournament. Exported for direct unit coverage.
 */
export function isSegmentSiblingCandidate(game: {
  holeSegment: HoleSegment;
  sourceGameId: string | null;
  tournamentId: string | null;
}): game is {
  holeSegment: SegmentHalf;
  sourceGameId: null;
  tournamentId: string;
} {
  return (
    game.sourceGameId == null &&
    game.tournamentId != null &&
    (game.holeSegment === 'front9' || game.holeSegment === 'back9')
  );
}

/**
 * #1466 §2: broModus = front9 host + sibling exists + my back9 row is still
 * undelivered. When true the front9 «Lever» becomes the bridge to hole 10 (one
 * delivery for the whole round happens on the back9 host). Self-heals to false
 * when the sibling is delivered — a rejected front9 card after the cascade
 * brings the deliver button back.
 */
export function isBroModus(
  segment: HoleSegment,
  sibling: Pick<SegmentSibling, 'mySubmittedAt'> | null,
): boolean {
  return segment === 'front9' && sibling != null && sibling.mySubmittedAt == null;
}

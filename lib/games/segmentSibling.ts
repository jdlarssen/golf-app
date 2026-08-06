import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';

/**
 * #1441 (owner-QA finding B): «en flight kan bruke samme scorekort hele
 * runden, uten at de må inn i en ny kamp.» Physically the flight plays 18
 * holes; the app splits a split-day cup round into a front9 host game and a
 * back9 host game. This resolves the OTHER host for a given player, so
 * hole-navigation and game-home can offer a direct bridge at the segment
 * boundary (hole 9 → hole 10 and back) instead of dead-ending at the front9
 * submit flow. Deluxe single-scorecard UI is explicitly out of scope — this
 * is navigation only, never score/data merging.
 */

export type SegmentHalf = Extract<HoleSegment, 'front9' | 'back9'>;

export type SegmentSibling = {
  gameId: string;
  gameMode: GameMode;
  holeSegment: SegmentHalf;
};

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
 * Pure: given the opposite-segment HOST candidates in the tournament and the
 * subset of their ids where `userId` holds an active (non-withdrawn)
 * `game_players` row, picks the one sibling. A player is expected to be on
 * at most one flight's pair of halves, so at most one candidate should ever
 * match — this returns the first match defensively rather than asserting
 * uniqueness (a malformed cup should degrade to "no bridge shown", not a
 * thrown error on a hole page). Exported for direct unit coverage.
 */
export function pickSiblingCandidate(
  candidates: { id: string; game_mode: GameMode }[],
  activeMembershipGameIds: readonly string[],
): { id: string; game_mode: GameMode } | null {
  const memberSet = new Set(activeMembershipGameIds);
  return candidates.find((c) => memberSet.has(c.id)) ?? null;
}

/**
 * I/O: resolves `userId`'s segment sibling for `game`, or `null` if there
 * isn't one (not a split-day host, no tournament, no opposite-segment host
 * in the tournament, or the user isn't an active player on it).
 *
 * Uses the admin client, mirroring `getGameWithPlayers`/`getCupSnapshot` on
 * this same hot page: the caller has already authenticated the acting user
 * as a player of `game` itself (the page's own `me = players.find(...)`
 * check) BEFORE calling this — the `userId` filter on the game_players
 * lookup below IS the authz check for the sibling half: a candidate only
 * qualifies when a row with that exact user_id (and no withdrawal) exists,
 * so this can never be used to discover a stranger's games.
 */
export async function findSegmentSibling(
  userId: string,
  game: {
    holeSegment: HoleSegment;
    sourceGameId: string | null;
    tournamentId: string | null;
  },
): Promise<SegmentSibling | null> {
  if (!isSegmentSiblingCandidate(game)) return null;

  const targetSegment = oppositeSegmentHalf(game.holeSegment);
  const supabase = getAdminClient();

  const { data: candidateRows, error: candidatesError } = await supabase
    .from('games')
    .select('id, game_mode')
    .eq('tournament_id', game.tournamentId)
    .eq('hole_segment', targetSegment)
    .is('source_game_id', null)
    .returns<{ id: string; game_mode: GameMode }[]>();
  if (candidatesError) throw candidatesError;
  const candidates = candidateRows ?? [];
  if (candidates.length === 0) return null;

  const { data: membershipRows, error: membershipError } = await supabase
    .from('game_players')
    .select('game_id')
    .in(
      'game_id',
      candidates.map((c) => c.id),
    )
    .eq('user_id', userId)
    .is('withdrawn_at', null)
    .returns<{ game_id: string }[]>();
  if (membershipError) throw membershipError;

  const match = pickSiblingCandidate(
    candidates,
    (membershipRows ?? []).map((r) => r.game_id),
  );
  return match
    ? { gameId: match.id, gameMode: match.game_mode, holeSegment: targetSegment }
    : null;
}

import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { candidatesOnSameSplitDay } from './splitDayPairing';
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

/** #1466: the acting player's own membership row on a sibling candidate. */
type SiblingMembership = {
  game_id: string;
  submitted_at: string | null;
  team_number: number | null;
};

/**
 * A HOST half fetched while resolving a sibling: enough to identify the opposite
 * half, day-scope it (#1449 finding 1), and carry its mode into the match.
 */
type SegmentHostRow = {
  id: string;
  game_mode: GameMode;
  hole_segment: SegmentHalf;
  scheduled_tee_off_at: string | null;
  created_at: string | null;
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
 * acting player's active (non-withdrawn) `game_players` rows on them, picks the
 * one sibling and carries its `submitted_at` + `team_number` (#1466). A player
 * is expected to be on at most one flight's pair of halves, so at most one
 * candidate should ever match — this returns the first match defensively rather
 * than asserting uniqueness (a malformed cup should degrade to "no bridge
 * shown", not a thrown error on a hole page). Exported for direct unit coverage.
 */
export function pickSiblingCandidate(
  candidates: { id: string; game_mode: GameMode }[],
  memberships: readonly SiblingMembership[],
): {
  id: string;
  game_mode: GameMode;
  submitted_at: string | null;
  team_number: number | null;
} | null {
  const membershipByGameId = new Map(memberships.map((m) => [m.game_id, m]));
  for (const c of candidates) {
    const membership = membershipByGameId.get(c.id);
    if (membership) {
      return {
        id: c.id,
        game_mode: c.game_mode,
        submitted_at: membership.submitted_at,
        team_number: membership.team_number,
      };
    }
  }
  return null;
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
    /** The source game's own id — needed to read its split-day anchor and to
     *  exclude itself from the opposite-half candidates (#1449 finding 1). */
    gameId: string;
    holeSegment: HoleSegment;
    sourceGameId: string | null;
    tournamentId: string | null;
  },
): Promise<SegmentSibling | null> {
  if (!isSegmentSiblingCandidate(game)) return null;

  const targetSegment = oppositeSegmentHalf(game.holeSegment);
  const supabase = getAdminClient();

  // Fetch EVERY host half in the tournament (both segments, both days), carrying
  // each host's split-day anchor. A two-day cup shares one `tournament_id`, so
  // without day-scoping a day-2 lookup could bind to a finished day-1 host
  // (#1449 finding 1). We read the source's own anchor from this same set, then
  // keep only the opposite-half hosts on the source's Oslo day — reusing the
  // pairing rule (`candidatesOnSameSplitDay`) so there is one home for it.
  //
  // No status filter: day-scoping already isolates the single opposite host of
  // the current day, and a delivered-but-not-yet-finished sibling MUST still
  // resolve — the back9→front9 cascade and the self-heal after a rejected front9
  // card both target an active (not finished) sibling, so filtering on status
  // would risk dropping a legitimately-resolvable sibling for no correctness gain.
  const { data: hostRows, error: hostsError } = await supabase
    .from('games')
    .select('id, game_mode, hole_segment, scheduled_tee_off_at, created_at')
    .eq('tournament_id', game.tournamentId)
    .is('source_game_id', null)
    .in('hole_segment', ['front9', 'back9'])
    .returns<SegmentHostRow[]>();
  if (hostsError) throw hostsError;
  const hosts = hostRows ?? [];

  const source = hosts.find((h) => h.id === game.gameId);
  if (!source) return null; // defensive: source row not found → no bridge
  const candidates = candidatesOnSameSplitDay(
    source,
    hosts.filter((h) => h.hole_segment === targetSegment && h.id !== game.gameId),
  );
  if (candidates.length === 0) return null;
  // #1449 runde-2: to samme-dags-kandidater (uten tee-off-tider bucketes dager
  // på created_at og kan kollidere) gjør søskenet flertydig. Speil kort-sidens
  // nøyaktig-én-semantikk: løs ingenting fremfor å gjette — verste fall
  // degraderer dagen til to leveringer, aldri en kaskade mot feil spill.
  if (candidates.length > 1) return null;

  const { data: membershipRows, error: membershipError } = await supabase
    .from('game_players')
    .select('game_id, submitted_at, team_number')
    .in(
      'game_id',
      candidates.map((c) => c.id),
    )
    .eq('user_id', userId)
    .is('withdrawn_at', null)
    .returns<SiblingMembership[]>();
  if (membershipError) throw membershipError;

  const match = pickSiblingCandidate(candidates, membershipRows ?? []);
  return match
    ? {
        gameId: match.id,
        gameMode: match.game_mode,
        holeSegment: targetSegment,
        mySubmittedAt: match.submitted_at,
        myTeamNumber: match.team_number,
      }
    : null;
}

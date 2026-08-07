/**
 * Pure per-cup-match submission-status derivation (#1488, K4/K5). Extracted from
 * `getCupSnapshot` so the levert-logic is directly Type-A testable.
 *
 * Two facts drive the match card + the one-tap-finish gate:
 *  - `allScorecardsSubmitted` — every non-withdrawn player has submitted. Drives
 *    the «Scorekort levert»-label (#1502).
 *  - a DERIVED match (`source_game_id` set, #1441) owns no submissions of its
 *    own, so it must INHERIT its host's status — otherwise it shows «Pågår»
 *    forever (owner prod finding on #1502).
 *
 * The host of a derived match is always in the same tournament fetch (#1441 D4:
 * the split-day bundle is generated together under one tournament), so the host
 * lookup normally hits. The `?? own` fallback is defensive only.
 */

export type MatchPlayerRow = {
  submitted_at: string | null;
  withdrawn_at: string | null;
};

export type MatchSubmissionStatus = {
  /** ≥1 non-withdrawn player exists AND all of them have submitted. */
  allScorecardsSubmitted: boolean;
  /**
   * The match HAS players but every one of them is withdrawn (#1488, K5). Such a
   * match never becomes «levert» (there is no card to hand in), yet the one-tap
   * finish should still close it — `endGameCore` skips withdrawn players. A
   * match with no players at all is `false` (it would fail with `no_players`
   * and must keep blocking).
   */
  allPlayersWithdrawn: boolean;
};

export type GameSubmissionInput = {
  gameId: string;
  /** `null` for a host match; the host's game id for a derived match (#1441). */
  sourceGameId: string | null;
  players: MatchPlayerRow[];
};

/** Status computed from a single game's own player rows (no inheritance). */
function computeOwnStatus(players: MatchPlayerRow[]): MatchSubmissionStatus {
  // Withdrawn (WD, #386) are out of the ranking — they never count as a missing
  // submission, and a match with no non-withdrawn players is never «levert».
  const nonWithdrawn = players.filter((p) => !p.withdrawn_at);
  return {
    allScorecardsSubmitted:
      nonWithdrawn.length > 0 && nonWithdrawn.every((p) => p.submitted_at != null),
    allPlayersWithdrawn: players.length > 0 && nonWithdrawn.length === 0,
  };
}

/**
 * Does this match block the cup's one-tap finish (#1488, K5)? The single home
 * of that rule, consumed by BOTH the `finishTournament` gate and the
 * CupManagement banner list. A match blocks only when it is neither fully
 * submitted NOR fully withdrawn: a fully-withdrawn active host match passes
 * (`endGameCore` closes it via the WD-skip), while a match with no players at
 * all still blocks (it would fail with `no_players`).
 */
export function matchBlocksOneTapFinish(m: {
  allScorecardsSubmitted?: boolean;
  allPlayersWithdrawn?: boolean;
}): boolean {
  return !(m.allScorecardsSubmitted ?? false) && !(m.allPlayersWithdrawn ?? false);
}

/**
 * Per-game submission status for every game in a cup, with derived matches
 * inheriting their host's status. Returns a `Map` keyed by `gameId`.
 */
export function computeSubmissionStatusByGame(
  games: GameSubmissionInput[],
): Map<string, MatchSubmissionStatus> {
  // Pre-pass: own status for every game (hosts and derived alike).
  const ownStatus = new Map<string, MatchSubmissionStatus>();
  for (const g of games) ownStatus.set(g.gameId, computeOwnStatus(g.players));

  // Second pass: a derived match inherits its host's status.
  const result = new Map<string, MatchSubmissionStatus>();
  for (const g of games) {
    if (g.sourceGameId != null) {
      const host = ownStatus.get(g.sourceGameId);
      result.set(g.gameId, host ?? ownStatus.get(g.gameId)!);
    } else {
      result.set(g.gameId, ownStatus.get(g.gameId)!);
    }
  }
  return result;
}

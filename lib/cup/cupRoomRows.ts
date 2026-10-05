/**
 * The «Cuper» rows in the Klubbhus room (#2493). A cup that is not finished is
 * a row with its progress; a finished cup is only counted (it stands on
 * `/admin/cup`), so the room never builds a snapshot for it: `getCupSnapshot`
 * reads every match, score and side award with the service role.
 */
export function splitCupsForRoom<C extends { status: string }>(
  cups: readonly C[],
): { live: C[]; finishedCount: number } {
  const live = cups.filter((c) => c.status !== 'finished');
  return { live, finishedCount: cups.length - live.length };
}

/**
 * «X av N kamper spilt», from the cup page's own leaderboard
 * (`computeCupLeaderboard`: `isCupMatchSettled` decides what counts as
 * played). No snapshot, or a cup without matches, gives 0 of 0.
 */
export function cupProgress(
  leaderboard: { finishedMatches: number; remainingMatches: number } | null,
): { played: number; total: number } {
  if (!leaderboard) return { played: 0, total: 0 };
  return {
    played: leaderboard.finishedMatches,
    total: leaderboard.finishedMatches + leaderboard.remainingMatches,
  };
}

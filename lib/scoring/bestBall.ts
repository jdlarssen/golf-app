export interface PlayerHoleScore {
  userId: string;
  gross: number | null;
  extraStrokes: number;
}

export interface BestBallResult {
  teamNet: number | null;
  contributors: string[];
}

export function netScore(input: { gross: number | null; extraStrokes: number }): number | null {
  if (input.gross === null) return null;
  return input.gross - input.extraStrokes;
}

export function bestBallForHole(players: PlayerHoleScore[]): BestBallResult {
  const nets = players
    .map((p) => ({ userId: p.userId, net: netScore({ gross: p.gross, extraStrokes: p.extraStrokes }) }))
    .filter((p): p is { userId: string; net: number } => p.net !== null);

  if (nets.length === 0) {
    return { teamNet: null, contributors: [] };
  }

  const min = Math.min(...nets.map((n) => n.net));
  const contributors = nets.filter((n) => n.net === min).map((n) => n.userId);
  return { teamNet: min, contributors };
}

export interface HoleTeamScore {
  holeNumber: number;
  teamNet: number | null;
}

/**
 * Sums team scores across holes that have a non-null teamNet.
 *
 * - `total` is the sum of the holes that have a score. If `missingHoles` is non-empty,
 *   `total` is a PARTIAL sum — comparing it directly against another team's `total`
 *   is only meaningful when both have empty `missingHoles`.
 * - `missingHoles` lists hole numbers where teamNet was null (both players had null gross).
 *
 * Callers that compare team totals (e.g. a leaderboard) MUST check missingHoles
 * is empty for both teams or treat the comparison as invalid.
 */
export function teamTotal(holes: HoleTeamScore[]): { total: number; missingHoles: number[] } {
  const missingHoles: number[] = [];
  let total = 0;
  for (const h of holes) {
    if (h.teamNet === null) {
      missingHoles.push(h.holeNumber);
    } else {
      total += h.teamNet;
    }
  }
  return { total, missingHoles };
}

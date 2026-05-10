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

/**
 * The duel card's math (HeadToHeadResult, #496), kept pure so it is tested as
 * Type A (#2226): who won, how the tug-of-war bar splits, and the parts of the
 * verdict. The component maps `verdict.kind` to copy and picks the separator.
 */

export type HeadToHeadInput = {
  sideA: { userId: string; score: number };
  sideB: { userId: string; score: number };
  /**
   * The winner's userId, or null for a tie. Passed in because a tiebreak the
   * score alone can't see may decide it (Skins: equal skins, more holes won).
   */
  winnerUserId: string | null;
  /** Lowest score wins (strokeplay net): the bar is inverted. */
  lowerWins: boolean;
};

export type HeadToHeadSummary = {
  winner: 'a' | 'b' | 'tie';
  /** Bar shares in whole percent; pctA + pctB = 100. */
  pctA: number;
  pctB: number;
  /** Either score below zero — the component then separates with « mot ». */
  hasNegativeScore: boolean;
  verdict:
    | { kind: 'tie'; scoreA: string; scoreB: string }
    | { kind: 'winTiebreak'; winner: 'a' | 'b' }
    | { kind: 'win'; winner: 'a' | 'b'; winnerScore: string; loserScore: string };
};

// Negative totals (modified stableford nets par to 0) get a real minus
// (U+2212), so «4 mot −3» never reads as «4--3».
function formatScore(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

export function headToHeadSummary({
  sideA,
  sideB,
  winnerUserId,
  lowerWins,
}: HeadToHeadInput): HeadToHeadSummary {
  const winner: HeadToHeadSummary['winner'] =
    winnerUserId === sideA.userId ? 'a' : winnerUserId === sideB.userId ? 'b' : 'tie';

  // The bar is drawn from a 0 baseline, or from the most negative score. For
  // non-negative formats lo = 0 and this is the plain score/sum share; the
  // shift keeps the bar sane when a total goes below zero.
  const lo = Math.min(sideA.score, sideB.score, 0);
  const aShift = sideA.score - lo;
  const bShift = sideB.score - lo;
  const totalShift = aShift + bShift;
  const rawPctA = totalShift === 0 ? 50 : Math.round((aShift / totalShift) * 100);
  // When lowest wins, invert so the winner still gets the larger share.
  const pctA = lowerWins ? 100 - rawPctA : rawPctA;
  const pctB = 100 - pctA;

  const hasNegativeScore = sideA.score < 0 || sideB.score < 0;

  // The verdict shows the winner's score first, so it reads right whether
  // highest or lowest wins: Skins «5–3», strokeplay net «78–85».
  let verdict: HeadToHeadSummary['verdict'];
  if (winner === 'tie') {
    verdict = {
      kind: 'tie',
      scoreA: formatScore(sideA.score),
      scoreB: formatScore(sideB.score),
    };
  } else if (sideA.score === sideB.score) {
    // Equal score, decided on a tiebreak (e.g. most holes won).
    verdict = { kind: 'winTiebreak', winner };
  } else {
    const [winnerSide, loserSide] = winner === 'a' ? [sideA, sideB] : [sideB, sideA];
    verdict = {
      kind: 'win',
      winner,
      winnerScore: formatScore(winnerSide.score),
      loserScore: formatScore(loserSide.score),
    };
  }

  return { winner, pctA, pctB, hasNegativeScore, verdict };
}

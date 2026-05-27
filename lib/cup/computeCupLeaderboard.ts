// Aggregator for Ryder Cup-stil multi-match-turnering (#47, fase 1).
//
// Tar tournament-raden + en liste av match-summary-er (allerede med pre-
// beregnet matchplay-result) og produserer master-leaderboard-en: team 1-
// point, team 2-point, vinner-deklarering, og bevart match-rekkefølge.
//
// Renheten her er bevisst: zero IO, zero scoring-pipeline-kobling. Caller-
// stien gjør game-fetch + per-match singlesMatchplay.compute(), og passerer
// inn en oppsummert match-rad. Det gir oss enkel unit-test-dekning (alle
// kombinasjoner: vunnet, halvert, in-progress, blanding, vinner-deklarert)
// uten å mocke games/game_players/scores.
//
// Point-tildelings-regel (matcher PGA/European Tour-ryder-cup-tradisjon):
//   - winnerSide === 1 → 1 point til team 1
//   - winnerSide === 2 → 1 point til team 2
//   - winnerSide === 'tied' (AS) → 0,5 til hvert lag
//   - result === null (matchen ikke ferdig) → 0 til begge

export type CupMatchInput = {
  gameId: string;
  matchLabel: string | null;
  team1PlayerName: string;
  team2PlayerName: string;
  /**
   * Game-mode for matchen. Brukes av cup-UI for å velge mellom spiller-fokusert
   * («3&2 til Per») og lag-fokusert («3&2 til Lag Skog») result-tekst. Singles
   * bruker spiller-navn; fourball (#217) og foursomes (#218) bruker lag-navn.
   * Optional for backward-compat med pre-#217-call-sites; UI defaulter til
   * singles-stil rendering når feltet er undefined.
   */
  gameMode?: 'singles_matchplay' | 'fourball_matchplay' | 'foursomes_matchplay';
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  result: { winnerSide: 1 | 2 | 'tied'; formatted: string } | null;
};

export type TournamentInput = {
  team_1_name: string;
  team_2_name: string;
  points_to_win: number;
  status: 'draft' | 'active' | 'finished';
  winner_team: 1 | 2 | null;
};

export type CupMatchSummary = CupMatchInput & {
  pointsTeam1: number;
  pointsTeam2: number;
};

export type CupLeaderboardResult = {
  team1Name: string;
  team2Name: string;
  team1Points: number;
  team2Points: number;
  pointsToWin: number;
  winner: 1 | 2 | null;
  matches: CupMatchSummary[];
  finishedMatches: number;
  remainingMatches: number;
};

function pointsForMatch(input: CupMatchInput): { team1: number; team2: number } {
  if (input.status !== 'finished' || input.result === null) {
    return { team1: 0, team2: 0 };
  }
  if (input.result.winnerSide === 1) return { team1: 1, team2: 0 };
  if (input.result.winnerSide === 2) return { team1: 0, team2: 1 };
  return { team1: 0.5, team2: 0.5 };
}

export function computeCupLeaderboard(
  tournament: TournamentInput,
  matches: CupMatchInput[],
): CupLeaderboardResult {
  let team1Points = 0;
  let team2Points = 0;
  let finished = 0;

  const summarized: CupMatchSummary[] = matches.map((m) => {
    const pts = pointsForMatch(m);
    team1Points += pts.team1;
    team2Points += pts.team2;
    if (m.status === 'finished') finished += 1;
    return { ...m, pointsTeam1: pts.team1, pointsTeam2: pts.team2 };
  });

  // Avrunde til nærmeste 0,1 for å unngå flyt-presisjons-rusk (0,5 + 0,5
  // kan teoretisk gi 0,9999...). Halv-poenger er den minste granulariteten
  // i cup-formatet.
  team1Points = Math.round(team1Points * 10) / 10;
  team2Points = Math.round(team2Points * 10) / 10;

  let winner: 1 | 2 | null = null;
  if (tournament.status === 'finished') {
    winner = tournament.winner_team;
  } else if (team1Points >= tournament.points_to_win) {
    winner = 1;
  } else if (team2Points >= tournament.points_to_win) {
    winner = 2;
  }

  return {
    team1Name: tournament.team_1_name,
    team2Name: tournament.team_2_name,
    team1Points,
    team2Points,
    pointsToWin: tournament.points_to_win,
    winner,
    matches: summarized,
    finishedMatches: finished,
    remainingMatches: matches.length - finished,
  };
}

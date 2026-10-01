/**
 * The cup's winner from the final team points (#2214): the team with more
 * points wins, and a tie names no winner. One home for the rule:
 * `finishTournament` names the winner with it, and `syncFinishedCupWinner`
 * re-names it when a side award is corrected after the finish.
 */
export function cupWinnerFromPoints(team1Points: number, team2Points: number): 1 | 2 | null {
  if (team1Points > team2Points) return 1;
  if (team2Points > team1Points) return 2;
  return null;
}

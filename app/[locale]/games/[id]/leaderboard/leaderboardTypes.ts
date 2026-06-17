/**
 * Delte rad-/spiller-typer for leaderboard-render-modulene. Trukket ut av
 * `page.tsx` (#682) så `sideTournament.tsx` og hver `formats/*`-modul kan dele
 * dem uten å redefinere identiske shapes per fil.
 */

export type SideWinnerRow = {
  category: 'longest_drive' | 'closest_to_pin';
  position: number;
  winner_user_id: string | null;
};

// Minste spiller-shape `computeSideTournament` trenger. Matchplay-render-
// funksjonene passerer sin `gwp.players` (som også bærer `tee_gender`) — ekstra
// felt er strukturelt OK. `withdrawn_at` er valgfritt: kun WD-støttende formater
// bærer feltet, fravær = ikke trukket.
export type SideTournamentPlayer = {
  user_id: string;
  team_number: number;
  users: { name: string | null; nickname: string | null } | null;
  course_handicap: number | null;
  withdrawn_at?: string | null;
};

export type CourseHoleRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

export type ScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

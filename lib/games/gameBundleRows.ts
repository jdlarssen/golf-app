import type { ResultSummary } from '../scoring/resultSummary';

/**
 * Radene og spørringene bak en spillbundel (#2752). Appen bygger `GameBundle` av
 * disse (`native/app/src/data/gameBundle.ts`), og tavla til andres ferdige kamper
 * får samme rader fra serveren. Ett hjem, så de to ikke kan drive fra hverandre.
 *
 * Bare typer og strenger: appen importerer fila med relativ sti.
 */

// Rå PostgREST-fasonger. Som i `db.ts` bor snake_case → camelCase-mappingen kun
// i denne fila; ingen skjerm ser en rå rad.
export interface GameRow {
  id: string;
  name: string;
  status: string;
  game_mode: string;
  mode_config: unknown;
  course_id: string | null;
  tee_box_id: string | null;
  require_peer_approval: boolean;
  scheduled_tee_off_at: string | null;
  hole_segment: string;
  source_game_id: string | null;
  created_by: string | null;
  score_visibility: string;
  tournament_id: string | null;
  league_round_id: string | null;
  foursomes_side1_tee_starter_user_id: string | null;
  foursomes_side2_tee_starter_user_id: string | null;
  patsome_tee_starters?: { team_number: number; tee_starter_user_id: string }[] | null;
  side_tournament_enabled: boolean;
  side_ld_count: number;
  side_ctp_count: number;
  side_disabled_categories: string[];
  hcp_allowance_pct: number;
  hcp_max_strokes?: number | null;
  spectate_token?: string | null;
  round_report?: string | null;
  courses: { name: string; course_holes: CourseHoleRow[] } | null;
  tee_boxes: TeeBoxRow | null;
}

// `course_rating_*` er `numeric` i basen, og PostgREST kan levere den som tekst.
export interface TeeBoxRow {
  name: string;
  length_meters: number | null;
  slope_mens: number | null;
  course_rating_mens: number | string | null;
  par_total_mens: number | null;
  slope_ladies: number | null;
  course_rating_ladies: number | string | null;
  par_total_ladies: number | null;
  slope_juniors: number | null;
  course_rating_juniors: number | string | null;
  par_total_juniors: number | null;
}

export interface CourseHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

export interface PlayerRow {
  user_id: string;
  team_number: number | null;
  flight_number: number | null;
  course_handicap: number | null;
  tee_gender: string;
  accepted_at: string | null;
  submitted_at: string | null;
  submitted_by_user_id: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  marker_user_id?: string | null;
  rejection_reason: string | null;
  withdrawn_at: string | null;
  withdrawn_by_user_id?: string | null;
  result_summary?: ResultSummary | null;
  users: { name: string | null; nickname: string | null; is_guest: boolean | null } | null;
}

// `users!game_players_user_id_fkey`: game_players har TRE fremmednøkler mot
// users (user_id, approved_by_user_id, withdrawn_by_user_id, og fra 0191
// submitted_by_user_id), så et bart `users(...)` er tvetydig og feiler. Samme
// hint som webben bruker.
export const PLAYER_SELECT =
  'user_id, team_number, flight_number, course_handicap, tee_gender, accepted_at, submitted_at, submitted_by_user_id, approved_at, approved_by_user_id, marker_user_id, rejection_reason, withdrawn_at, withdrawn_by_user_id, result_summary, users!game_players_user_id_fkey(name, nickname, is_guest)';

// Bane, tee og hullene rir med på games-raden som embeds. Det gjør hele
// metadata-hentingen til to spørringer i én Promise.all i stedet for en kjede
// der hullene må vente på at course_id kommer tilbake.
export const GAME_SELECT =
  'id, name, status, game_mode, mode_config, course_id, tee_box_id, require_peer_approval, scheduled_tee_off_at, hole_segment, source_game_id, created_by, score_visibility, tournament_id, league_round_id, foursomes_side1_tee_starter_user_id, foursomes_side2_tee_starter_user_id, patsome_tee_starters(team_number, tee_starter_user_id), side_tournament_enabled, side_ld_count, side_ctp_count, side_disabled_categories, hcp_allowance_pct, hcp_max_strokes, spectate_token, round_report, courses(name, course_holes(hole_number, par_mens, par_ladies, par_juniors, stroke_index)), tee_boxes(name, length_meters, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)';

/** Svaret fra `GET /api/cup/[id]/matches/[gameId]/board`: en ferdig kamp, bare for lesing. */
export type CupMatchBoardResponse = {
  game: GameRow;
  players: PlayerRow[];
  /** Verten til en avledet kamp, for overskriften. */
  sourceGameName: string | null;
  /** Slagene, fra verten når kampen er avledet. */
  scores: { user_id: string; hole_number: number; strokes: number | null }[];
};

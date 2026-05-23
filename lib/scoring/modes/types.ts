// Felles types for mode-router (lib/scoring/index.ts) og mode-modules
// (lib/scoring/modes/*). Discriminated union på `kind` matcher
// games.game_mode-discriminator i DB.

export type GameMode = 'best_ball_netto' | 'stableford';

/**
 * Norske visnings-labels for hver spillmodus. Brukes av ModeChip i admin-
 * surfaces og av detail-pages som viser «Spillform: …». Holdt som single
 * source of truth slik at vi ikke driver ulike norske oversettelser per
 * call-site. Speilet `STATUS_LABELS` i `lib/games/status.ts`.
 */
export const MODE_LABELS: Record<GameMode, string> = {
  best_ball_netto: 'Best ball',
  stableford: 'Stableford',
};

/**
 * Mode-spesifikk config som lagres i `games.mode_config` (JSONB).
 * Diskrimineres på `kind` slik at konsumenter narrower trygt.
 *
 * Stableford-grenen har to varianter:
 *  - `team_size: 1` = solo (en spiller = en deltager, ranking på spiller-poeng)
 *  - `team_size: 2` = par-stableford / 4BBB (to spillere per lag, lag-hull-poeng
 *    = MAX av partnernes individuelle poeng, ranking på lag-poeng)
 */
export type GameModeConfig =
  | { kind: 'best_ball_netto'; team_size: 2; teams_count: 4 }
  | { kind: 'stableford'; team_size: 1; points_table: 'standard' }
  | { kind: 'stableford'; team_size: 2; points_table: 'standard' };

/**
 * Minimal hole-shape som scoring-laget trenger. Holder oss løse fra
 * Supabase `course_holes`-raden — kallsteder mapper sin egen form ned.
 */
export interface ScoringHole {
  number: number;
  par: number;
  /**
   * Stroke index 1..18. Brukes av allocateStrokes/strokesForHole for
   * å bestemme hvilke hull spilleren får slag på.
   */
  strokeIndex: number;
}

export interface ScoringPlayer {
  userId: string;
  /** Null for solo-spill (stableford). */
  teamNumber: number | null;
  /** Null for solo-spill (stableford). */
  flightNumber: number | null;
  courseHandicap: number;
}

export interface ScoringHoleScore {
  userId: string;
  holeNumber: number;
  gross: number | null;
}

export interface ScoringContext {
  game: {
    id: string;
    game_mode: GameMode;
    mode_config: GameModeConfig;
  };
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
}

/**
 * Per-spiller-rad i best-ball-resultat. Speilar shape som dagens
 * `bestBall.ts`-eksporter bruker (gross, extraStrokes, net) slik at vi
 * ikke brekker konsumenter ved migrering til mode-router.
 */
export interface BestBallPlayerCell {
  userId: string;
  gross: number | null;
  extraStrokes: number;
  net: number | null;
  isContributor: boolean;
}

export interface BestBallHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  teamNet: number | null;
  contributorIds: string[];
  players: BestBallPlayerCell[];
}

export interface BestBallTeamLine {
  teamNumber: number;
  playerIds: string[];
  holes: BestBallHoleRow[];
  total: number;
  missingHoles: number[];
  rank: number;
  tiedWith: number[];
}

export interface BestBallNettoResult {
  kind: 'best_ball_netto';
  teams: BestBallTeamLine[];
}

export interface StablefordPlayerLine {
  userId: string;
  totalPoints: number;
  rank: number;
  holesPlayed: number;
  /**
   * Tied-with: andre spilleres userIds som har EKSAKT samme tie-break-cascade
   * (totalPoints + back9 + back6 + back3 + hole18-poeng). Tom for unike rader.
   */
  tiedWith: string[];
}

/**
 * Solo-variant av stableford-resultatet — én rad per spiller.
 * Returnert når `mode_config.team_size === 1`.
 */
export interface StablefordSoloResult {
  kind: 'stableford';
  variant: 'solo';
  players: StablefordPlayerLine[];
}

/**
 * Per-spiller per-hull-detalj i par-stableford (4BBB). Speilet best-balls
 * `BestBallPlayerCell` slik at view-laget kan rendre player-rader på
 * konsistent måte. `isContributor` flagger spillere som hadde MAX-poeng
 * på hullet (kan være begge ved tie).
 */
export interface StablefordPlayerCell {
  userId: string;
  gross: number | null;
  /**
   * Netto strokes for hullet (gross minus extra strokes). Null hvis gross
   * er null (hullet ikke spilt). Speiler `BestBallPlayerCell.net`.
   */
  netStrokes: number | null;
  points: number;
  isContributor: boolean;
}

/**
 * Per-hull-rad for et par-stableford-lag. `teamPoints` = MAX av partnernes
 * individuelle stableford-poeng (4BBB-regelen). `contributorIds` = de
 * spillerne som hadde MAX-poeng — kan være begge ved tie.
 */
export interface StablefordTeamHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  teamPoints: number;
  contributorIds: string[];
  players: StablefordPlayerCell[];
}

/**
 * Lag-rad i par-stableford. `totalPoints` = sum av per-hull `teamPoints`.
 * Ranking: høyest poeng vinner med 5-tier tie-break-cascade på lag-poeng-
 * arrays. Speilet `BestBallTeamLine` for konsistent UI-shape.
 */
export interface StablefordTeamLine {
  teamNumber: number;
  playerIds: string[];
  holes: StablefordTeamHoleRow[];
  totalPoints: number;
  rank: number;
  tiedWith: number[];
}

/**
 * Team-variant av stableford-resultatet — én rad per lag (par).
 * Returnert når `mode_config.team_size === 2`.
 */
export interface StablefordTeamResult {
  kind: 'stableford';
  variant: 'team';
  teams: StablefordTeamLine[];
}

/**
 * Discriminert på `variant`: konsumenter narrower trygt på solo vs team.
 * Bevart `kind: 'stableford'` så ytre router-narrowing (på `ModeResult.kind`)
 * fortsatt fungerer for begge variantene.
 */
export type StablefordResult = StablefordSoloResult | StablefordTeamResult;

/**
 * Discriminated union — konsumenter narrower på `kind`:
 *   const r = computeLeaderboard(ctx);
 *   if (r.kind === 'stableford') { r.players.forEach(...) }
 *
 * For stableford må man eventuelt narrowe videre på `r.variant` siden
 * solo og team-varianten har ulik shape (players vs teams).
 */
export type ModeResult = BestBallNettoResult | StablefordResult;

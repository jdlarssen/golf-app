// Felles types for mode-router (lib/scoring/index.ts) og mode-modules
// (lib/scoring/modes/*). Discriminated union på `kind` matcher
// games.game_mode-discriminator i DB.

export type GameMode = 'best_ball_netto' | 'stableford';

/**
 * Mode-spesifikk config som lagres i `games.mode_config` (JSONB).
 * Diskrimineres på `kind` slik at konsumenter narrower trygt.
 */
export type GameModeConfig =
  | { kind: 'best_ball_netto'; team_size: 2; teams_count: 4 }
  | { kind: 'stableford'; team_size: 1; points_table: 'standard' };

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

export interface StablefordResult {
  kind: 'stableford';
  players: StablefordPlayerLine[];
}

/**
 * Discriminated union — konsumenter narrower på `kind`:
 *   const r = computeLeaderboard(ctx);
 *   if (r.kind === 'stableford') { r.players.forEach(...) }
 */
export type ModeResult = BestBallNettoResult | StablefordResult;

import type { GameStatus } from '@/lib/games/status';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import type { TeeBoxRatings } from '@/lib/games/teeRating';
import type { HoleSegment } from '@/lib/scoring';

export type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  /**
   * #1007: gates the «Revansje?» CTA on the finished branch — cup matches
   * and liga-rounds don't get a standalone rematch button (the cup/liga
   * itself owns the rematch). Immutable after creation.
   */
  tournament_id: string | null;
  /** #1007: same gating rationale as `tournament_id` above. */
  league_round_id: string | null;
  course_id: string;
  tee_box_id: string;
  scheduled_tee_off_at: string | null;
  require_peer_approval: boolean;
  /**
   * Game-mode discriminator — leses fra cache-rad eller re-fetch ved auto-
   * start. Bestemmer hvilken view-variant av spill-hjem som rendres (solo
   * stableford dropper team-strip, best-ball viser Lag/Flight/CH).
   *
   * Speilet `GameMode` fra `lib/scoring/modes/types.ts` — utvides når nye
   * moduser landes. Holdt som lokal alias for å unngå dyptkoblet import i en
   * server-component som allerede leser status-unionen lokalt.
   */
  game_mode:
    | 'best_ball'
    | 'stableford'
    | 'modified_stableford'
    | 'singles_matchplay'
    | 'solo_strokeplay'
    | 'texas_scramble'
    | 'ambrose'
    | 'florida_scramble'
    | 'fourball_matchplay'
    | 'foursomes_matchplay'
    | 'greensome_matchplay'
    | 'chapman_matchplay'
    | 'gruesome_matchplay'
    | 'wolf'
    | 'nassau'
    | 'skins'
    | 'bingo_bango_bongo'
    | 'nines'
    | 'round_robin'
    | 'acey_deucey'
    | 'shamble'
    | 'patsome';
  /**
   * Mode-spesifikk config fra `games.mode_config` (JSONB). Type-en speilet
   * fra `GameForHole` slik at scorecardTitle() kan resolve riktig tittel/
   * label per modus (best-ball + 4BBB + texas → «Lagets scorekort»,
   * matchplay → «Match-scorekort», solo → «Mitt scorekort»). Settes fra
   * `gwp.game` via spread, eller fra re-fetchen etter auto-start (#2164).
   */
  mode_config: GameForHole['mode_config'];
  courses: { name: string } | null;
  tee_boxes:
    | (TeeBoxRatings & { name: string; length_meters: number | null })
    | null;
  /** #1441: limits the game to holes 1-9/10-18 — drives the holeCount copy
   *  + the segment-aware CTA thread further down. */
  hole_segment: HoleSegment;
  /**
   * #1441: non-null when this game is DERIVED from another game in the same
   * cup bundle (e.g. a back9 singles match derived from the back9 best-ball
   * host). Gates the active branch to a minimal, read-only «Slagene føres i
   * …»-notice instead of the normal score-entry CTA — a derived game never
   * has its own scores.
   */
  source_game_id: string | null;
};

/**
 * One entry per `GameRow` key (#2164). game-home refetches the game after a
 * visit wins the auto-start flip and replaces the cached row with the result,
 * so a column missing here is `undefined` for the rest of the render — and
 * `.single<GameRow>()` hides that from the compiler. Keying this map on
 * `keyof GameRow` moves the check to `tsc`: add a field to `GameRow` without a
 * column and the build fails.
 */
const GAME_ROW_COLUMNS: Record<keyof GameRow, string> = {
  id: 'id',
  name: 'name',
  status: 'status',
  tournament_id: 'tournament_id',
  league_round_id: 'league_round_id',
  course_id: 'course_id',
  tee_box_id: 'tee_box_id',
  scheduled_tee_off_at: 'scheduled_tee_off_at',
  require_peer_approval: 'require_peer_approval',
  game_mode: 'game_mode',
  mode_config: 'mode_config',
  courses: 'courses(name)',
  tee_boxes:
    'tee_boxes(name, length_meters, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
  hole_segment: 'hole_segment',
  source_game_id: 'source_game_id',
};

export const GAME_HOME_SELECT = Object.values(GAME_ROW_COLUMNS).join(', ');
